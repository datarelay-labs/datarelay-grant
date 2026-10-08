"""Delivery only to installation-registered exact endpoints; never execute actions."""

from __future__ import annotations

import hashlib
import hmac
import json
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import urlsplit

import httpx

from .auth import Principal, require_current_authority
from .config import Settings
from .core import Core
from .db import Database, audit, uid
from .errors import GrantError


def validate_destination(url: str, settings: Settings, *, resolve: bool = False) -> None:
    """No caller-selected URL. The installation operator registers exact endpoints.

    HTTPS is verified by HTTPX. No proxy environment or redirect is followed.
    Endpoint ownership and DNS are an installation trust boundary, not user input.
    """
    try:
        p = urlsplit(url)
        if (
            not p.hostname
            or p.username
            or p.password
            or p.fragment
            or any(c in url for c in "\r\n\x00")
        ):
            raise GrantError("INVALID_DESTINATION", 422)
        if url not in settings.callback_urls:
            raise GrantError("DESTINATION_NOT_REGISTERED", 422)
        if p.scheme != "https" and not (
            settings.dev_mode
            and p.scheme == "http"
            and p.hostname in ("localhost", "127.0.0.1", "::1")
        ):
            raise GrantError("DESTINATION_REQUIRES_HTTPS", 422)
        if p.hostname in ("169.254.169.254", "0.0.0.0") or p.port == 0:
            raise GrantError("INVALID_DESTINATION", 422)
    except ValueError as exc:
        raise GrantError("INVALID_DESTINATION", 422) from exc


def send_webhook(settings: Settings, destination: dict, payload: str, event_id: str) -> None:
    validate_destination(destination["url"], settings)
    data = payload.encode()
    timestamp = str(int(time.time()))
    headers = {
        **destination.get("headers", {}),
        "Content-Type": "application/json",
        "X-Grant-Event-Id": event_id,
        "X-Grant-Timestamp": timestamp,
        "User-Agent": "DataRelay-Grant/0.1",
    }
    secret = destination.get("hmac_secret", "")
    if secret:
        signature = hmac.new(
            secret.encode(), timestamp.encode() + b"." + data, hashlib.sha256
        ).hexdigest()
        headers["X-Grant-Signature"] = "sha256=" + signature
    with (
        httpx.Client(verify=True, follow_redirects=False, trust_env=False, timeout=10) as client,
        client.stream("POST", destination["url"], content=data, headers=headers) as response,
    ):
        if not 200 <= response.status_code < 300:
            raise GrantError("CALLBACK_HTTP_" + str(response.status_code), 502)
            # Status acceptance only. Do not retain an unbounded receiver body.


def send_email(settings: Settings, destination: dict, payload: str, event_id: str) -> None:
    if not settings.smtp_host:
        raise GrantError("SMTP_UNCONFIGURED", 503)
    data = json.loads(payload)
    message = EmailMessage()
    sender_display_name = str(data.get("sender_display_name", "")).strip()
    message["From"] = (
        formataddr((sender_display_name, settings.smtp_from))
        if sender_display_name
        else settings.smtp_from
    )
    message["To"] = destination["email"]
    message["Subject"] = data["subject"].replace("\r", " ").replace("\n", " ")
    message["Message-ID"] = f"<{event_id}@grant.local>"
    message.set_content(data["body"])
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


class Worker:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings

    def tick(self, limit: int = 20) -> int:
        # A restored database is deliberately frozen until the operator completes
        # reconciliation. Maintenance is state mutation too (expiry/reminders), so
        # it must respect the same pause as outbound delivery and execution consume.
        with self.db.transaction(write=False) as conn:
            if conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1":
                return 0
        Core(self.db, self.settings).maintenance()
        count = 0
        for _ in range(limit):
            now, lease = time.time(), uid()
            with self.db.transaction() as conn:
                if (
                    conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0]
                    == "1"
                ):
                    break
                conn.execute(
                    "UPDATE outbox SET state='FAILED',last_error='DELIVERY_ATTEMPTS_EXHAUSTED',lease_token=NULL WHERE state='SENDING' AND lease_until<=? AND attempts>=?",
                    (now, self.settings.max_delivery_attempts),
                )
                row = conn.execute(
                    "SELECT * FROM outbox WHERE attempts<? AND ((state='PENDING' AND available_at<=?) OR (state='SENDING' AND lease_until<=?)) ORDER BY created_at,id LIMIT 1",
                    (self.settings.max_delivery_attempts, now, now),
                ).fetchone()
                if not row:
                    break
                req = conn.execute(
                    "SELECT r.state,r.revision,r.collaboration_state,i.enabled FROM requests r JOIN integrations i ON i.id=r.integration_id WHERE r.id=?",
                    (row["request_id"],),
                ).fetchone()
                stale_outcome = (
                    row["kind"] == "webhook" and json.loads(row["payload"])["state"] != req["state"]
                )
                stale_approval_email = (
                    row["kind"] == "email"
                    and row["event_type"] in ("requested", "reminder", "legacy")
                    and (
                        req["state"] not in ("AWAITING", "HELD")
                        or (
                            row["event_type"] == "reminder"
                            and req["collaboration_state"] != "OPEN"
                        )
                    )
                )
                if not req["enabled"] or stale_outcome or stale_approval_email:
                    conn.execute(
                        "UPDATE outbox SET state='SUPERSEDED',lease_token=NULL,last_error=NULL WHERE id=?",
                        (row["id"],),
                    )
                    continue
                conn.execute(
                    "UPDATE outbox SET state='SENDING',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?",
                    (lease, now + 90, row["id"]),
                )
                item = dict(row)
                item["attempts"] += 1
            error = None
            try:
                destination = self.settings.unseal(item["destination"])
                sender = send_webhook if item["kind"] == "webhook" else send_email
                sender(self.settings, destination, item["payload"], item["id"])
            except Exception as exc:  # noqa: BLE001 - isolate worker failures; never log secret values
                error = exc.code if isinstance(exc, GrantError) else type(exc).__name__
            with self.db.transaction() as conn:
                if error:
                    state = (
                        "FAILED"
                        if item["attempts"] >= self.settings.max_delivery_attempts
                        else "PENDING"
                    )
                    conn.execute(
                        "UPDATE outbox SET state=?,last_error=?,available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
                        (
                            state,
                            error,
                            time.time() + min(3600, 2 ** item["attempts"] * 5),
                            item["id"],
                            lease,
                        ),
                    )
                else:
                    conn.execute(
                        "UPDATE outbox SET state='DELIVERED',delivered_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
                        (time.time(), item["id"], lease),
                    )
                audit(
                    conn,
                    item["request_id"],
                    "worker",
                    "delivery.failed" if error else "delivery.accepted",
                    {"event_id": item["id"], "kind": item["kind"], "error": error},
                )
            count += 1
        return count

    def resend(self, actor: Principal, ident: str) -> dict:
        actor.require_admin()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = conn.execute("SELECT * FROM outbox WHERE id=?", (ident,)).fetchone()
            if not row:
                raise GrantError("DELIVERY_NOT_FOUND", 404)
            if row["state"] not in ("FAILED", "PENDING"):
                raise GrantError("DELIVERY_NOT_RETRYABLE")
            conn.execute(
                "UPDATE outbox SET state='PENDING',attempts=0,available_at=?,last_error=NULL WHERE id=?",
                (time.time(), ident),
            )
            audit(
                conn, row["request_id"], actor.id, "delivery.resend_scheduled", {"event_id": ident}
            )
        return {"id": ident, "state": "PENDING", "note": "Notification only; never a new execution"}
