"""Approval authority and execution gate. All transitions serialize with the outbox."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from typing import Any
from urllib.parse import urlsplit

from .auth import Principal, require_current_authority
from .config import Settings
from .db import Database, audit, json_text, uid
from .errors import GrantError
from .models import Cancel, Consume, Decision, Intake, Integration, Profile, Result


def bounded_json(value: Any, depth: int = 0) -> None:
    if depth > 8:
        raise GrantError("JSON_TOO_DEEP", 422)
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str) and len(value) <= 4000:
        return
    if isinstance(value, int) and -(2**53) < value < 2**53:
        return
    if isinstance(value, list) and len(value) <= 100:
        for item in value:
            bounded_json(item, depth + 1)
        return
    if isinstance(value, dict) and len(value) <= 100:
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 100:
                raise GrantError("INVALID_JSON_KEY", 422)
            if key.lower().replace("-", "_") in {
                "password",
                "secret",
                "token",
                "access_token",
                "api_key",
                "authorization",
                "private_key",
            }:
                raise GrantError("USE_SECRET_REFERENCES_NOT_VALUES", 422)
            bounded_json(item, depth + 1)
        return
    raise GrantError("UNSUPPORTED_JSON_VALUE", 422)


def fingerprint(value: object) -> str:
    return hashlib.sha256(json_text(value).encode()).hexdigest()


class Core:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings

    def create_integration(self, actor: Principal, body: Integration) -> dict:
        actor.require_admin()
        from .transport import validate_destination

        validate_destination(body.callback_url, self.settings, resolve=False)
        forbidden = {
            "host",
            "content-length",
            "connection",
            "transfer-encoding",
            "content-type",
            "x-grant-event-id",
            "x-grant-signature",
            "x-grant-timestamp",
        }
        for key, value in body.callback_headers.items():
            if (
                key.lower() in forbidden
                or not key
                or len(key) > 100
                or len(value) > 2048
                or any(c in key + value for c in "\r\n\x00")
            ):
                raise GrantError("INVALID_CALLBACK_HEADER", 422)
        if len(body.callback_headers) > 10:
            raise GrantError("TOO_MANY_HEADERS", 422)
        if body.kind == "stellar" and not body.tenant:
            raise GrantError("STELLAR_TENANT_REQUIRED", 422)
        ident = uid()
        destination = self.settings.seal(
            {
                "url": body.callback_url,
                "headers": body.callback_headers,
                "hmac_secret": body.hmac_secret,
            }
        )
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO integrations VALUES(?,?,?,1,?,?,?)",
                (ident, body.name, body.kind, body.tenant, destination, time.time()),
            )
            audit(conn, None, actor.id, "integration.created", {"integration_id": ident})
        return {"id": ident, "name": body.name, "kind": body.kind}

    def integrations(self, actor: Principal) -> list[dict]:
        actor.require_admin()
        with self.db.transaction(write=False) as conn:
            rows = conn.execute("SELECT * FROM integrations ORDER BY name").fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "kind": r["kind"],
                "tenant": r["tenant"],
                "enabled": bool(r["enabled"]),
                "callback_origin": self._origin(r["destination"]),
            }
            for r in rows
        ]

    def _origin(self, sealed: str) -> str:
        parsed = urlsplit(self.settings.unseal(sealed)["url"])
        return f"{parsed.scheme}://{parsed.netloc}"

    def create_profile(self, actor: Principal, body: Profile) -> dict:
        actor.require_admin()
        ident = uid()
        with self.db.transaction() as conn:
            if not conn.execute(
                "SELECT id FROM integrations WHERE id=? AND enabled=1", (body.integration_id,)
            ).fetchone():
                raise GrantError("INTEGRATION_NOT_FOUND", 404)
            if not conn.execute(
                "SELECT id FROM users WHERE id=? AND enabled=1", (body.approver_id,)
            ).fetchone():
                raise GrantError("APPROVER_NOT_FOUND", 404)
            conn.execute(
                "INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,1)",
                (
                    ident,
                    body.name,
                    body.integration_id,
                    body.approver_id,
                    body.action_kind,
                    body.deadline_seconds,
                    body.reminder_seconds,
                    body.max_reminders,
                    body.grant_seconds,
                ),
            )
            audit(conn, None, actor.id, "profile.created", {"profile_id": ident})
        return {"id": ident, **body.model_dump()}

    def profiles(self, actor: Principal) -> list[dict]:
        with self.db.transaction(write=False) as conn:
            if actor.kind == "integration":
                rows = conn.execute(
                    "SELECT p.*,i.kind AS integration_kind,i.tenant FROM profiles p JOIN integrations i ON i.id=p.integration_id WHERE p.integration_id=? AND p.enabled=1 AND i.enabled=1",
                    (actor.integration_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT p.*,i.kind AS integration_kind,i.tenant FROM profiles p JOIN integrations i ON i.id=p.integration_id WHERE p.enabled=1 AND i.enabled=1"
                ).fetchall()
        return [dict(r) for r in rows]

    def _visible(self, row: sqlite3.Row, actor: Principal) -> None:
        if actor.kind == "integration":
            if row["integration_id"] != actor.integration_id:
                raise GrantError("REQUEST_NOT_FOUND", 404)
        elif actor.role != "admin" and actor.id not in (row["requester_id"], row["approver_id"]):
            raise GrantError("REQUEST_NOT_FOUND", 404)

    def _load(
        self, conn: sqlite3.Connection, ident: str, actor: Principal | None = None
    ) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM requests WHERE id=?", (ident,)).fetchone()
        if not row:
            raise GrantError("REQUEST_NOT_FOUND", 404)
        if actor:
            self._visible(row, actor)
        return row

    def _mail(
        self, conn: sqlite3.Connection, row: sqlite3.Row, now: float, reminder: bool = False
    ) -> None:
        user = conn.execute(
            "SELECT email,enabled FROM users WHERE id=?", (row["approver_id"],)
        ).fetchone()
        ident = uid()
        payload = {
            "subject": "[Grant] " + ("Reminder: " if reminder else "Approval: ") + row["title"],
            "body": "Review the exact action and sign in as the assigned approver.\n\n"
            + self.settings.origin
            + "/requests/"
            + row["id"]
            + "\n\nEmail previews never authorize execution. Deadline: "
            + str(row["deadline"]),
        }
        conn.execute(
            "INSERT INTO outbox(id,request_id,kind,revision,payload,destination,available_at,created_at) VALUES(?,?,'email',?,?,?,?,?)",
            (
                ident,
                row["id"],
                row["revision"],
                json_text(payload),
                self.settings.seal({"email": user["email"]}),
                now,
                now,
            ),
        )

    def _event(
        self, conn: sqlite3.Connection, row: sqlite3.Row, now: float, reason: str = ""
    ) -> None:
        integration = conn.execute(
            "SELECT destination FROM integrations WHERE id=?", (row["integration_id"],)
        ).fetchone()
        ident = uid()
        payload = {
            "schema_version": 1,
            "event_type": "grant.approval.outcome",
            "occurred_at": now,
            "event_id": ident,
            "state_revision": row["revision"],
            "request_id": row["id"],
            "external_id": row["external_id"],
            "source": json.loads(row["source"]),
            "state": row["state"],
            "decision": row["decision"],
            "decision_actor": row["decision_actor"],
            "decision_at": row["decision_at"],
            "action_hash": row["action_hash"],
            "grant_until": row["grant_until"],
            "execution_state": row["execution_state"],
            "reason": reason,
            "request_url": self.settings.origin + "/requests/" + row["id"],
        }
        conn.execute(
            "INSERT INTO outbox(id,request_id,kind,revision,payload,destination,available_at,created_at) VALUES(?,?,'webhook',?,?,?,?,?)",
            (ident, row["id"], row["revision"], json_text(payload), integration[0], now, now),
        )

    @staticmethod
    def _paused(conn: sqlite3.Connection) -> bool:
        return conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"

    def _expire(self, conn: sqlite3.Connection, row: sqlite3.Row, now: float) -> bool:
        if self._paused(conn):
            return False
        due = (row["state"] in ("AWAITING", "HELD") and row["deadline"] <= now) or (
            row["state"] == "APPROVED" and row["grant_until"] <= now and not row["execution_id"]
        )
        if not due:
            return False
        conn.execute(
            "UPDATE requests SET state='EXPIRED',revision=revision+1 WHERE id=?", (row["id"],)
        )
        updated = self._load(conn, row["id"])
        audit(conn, row["id"], "policy", "request.expired", now=now)
        self._event(
            conn, updated, now, "Deadline or execution validity elapsed; not a human denial"
        )
        return True

    def create_request(self, actor: Principal, body: Intake) -> dict:
        if actor.kind == "integration":
            actor.require_scope("request:create")
        data = body.model_dump()
        bounded_json(data)
        if len(json_text(data).encode()) > 32768:
            raise GrantError("REQUEST_TOO_LARGE", 413)
        action = body.action.model_dump()
        action_hash, intake_hash = fingerprint(action), fingerprint(data)
        now, ident = time.time(), uid()
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "request:create")
            profile = conn.execute(
                "SELECT p.*,i.enabled AS integration_enabled,i.tenant,i.kind FROM profiles p JOIN integrations i ON i.id=p.integration_id WHERE p.id=?",
                (body.profile_id,),
            ).fetchone()
            if not profile or not profile["enabled"] or not profile["integration_enabled"]:
                raise GrantError("PROFILE_NOT_FOUND", 404)
            integration_id = profile["integration_id"]
            if actor.kind == "integration" and actor.integration_id != integration_id:
                raise GrantError("PROFILE_NOT_FOUND", 404)
            if profile["tenant"] and body.source.get("tenant_id") != profile["tenant"]:
                raise GrantError("SOURCE_TENANT_MISMATCH", 403)
            if str(body.source.get("event_type", "")).startswith("grant."):
                raise GrantError("OUTCOME_FEEDBACK_LOOP", 422)
            if action["kind"] != profile["action_kind"]:
                raise GrantError("ACTION_NOT_ALLOWED", 403)
            requester = actor.id if actor.kind == "human" else None
            if requester == profile["approver_id"]:
                raise GrantError("SELF_APPROVAL_PROHIBITED", 403)
            approver = conn.execute(
                "SELECT enabled FROM users WHERE id=?", (profile["approver_id"],)
            ).fetchone()
            if not approver or not approver[0]:
                raise GrantError("APPROVER_UNAVAILABLE", 409)
            existing = conn.execute(
                "SELECT * FROM requests WHERE integration_id=? AND external_id=?",
                (integration_id, body.external_id),
            ).fetchone()
            if existing:
                self._visible(existing, actor)
                if existing["intake_hash"] != intake_hash or existing["requester_id"] != requester:
                    raise GrantError("IDEMPOTENCY_CONFLICT", 409)
                return self._project(conn, existing)
            if body.predecessor_id:
                previous = self._load(conn, body.predecessor_id, actor)
                if previous["integration_id"] != integration_id or previous["state"] != "CANCELLED":
                    raise GrantError("PREDECESSOR_MUST_BE_CANCELLED", 409)
            values = {
                "id": ident,
                "integration_id": integration_id,
                "external_id": body.external_id,
                "profile_id": body.profile_id,
                "requester_id": requester,
                "approver_id": profile["approver_id"],
                "title": body.title,
                "action": json_text(action),
                "action_hash": action_hash,
                "intake_hash": intake_hash,
                "source": json_text(body.source),
                "reason": body.reason,
                "predecessor_id": body.predecessor_id,
                "state": "AWAITING",
                "created_at": now,
                "deadline": now + profile["deadline_seconds"],
                "grant_seconds": profile["grant_seconds"],
                "next_reminder": now + profile["reminder_seconds"],
                "reminder_seconds": profile["reminder_seconds"],
                "max_reminders": profile["max_reminders"],
            }
            columns = ",".join(values)
            conn.execute(
                f"INSERT INTO requests({columns}) VALUES({','.join('?' for _ in values)})",
                tuple(values.values()),
            )
            row = self._load(conn, ident)
            audit(conn, ident, actor.id, "request.created", {"action_hash": action_hash}, now)
            self._mail(conn, row, now)
            return self._project(conn, row)

    def get(self, actor: Principal, ident: str) -> dict:
        with self.db.transaction() as conn:
            row = self._load(conn, ident, actor)
            self._expire(conn, row, time.time())
            return self._project(conn, self._load(conn, ident))

    def list_requests(self, actor: Principal, limit: int = 100, offset: int = 0) -> list[dict]:
        self.maintenance()
        query, args = "SELECT * FROM requests", []
        if actor.kind == "integration":
            query += " WHERE integration_id=?"
            args.append(actor.integration_id)
        elif actor.role != "admin":
            query += " WHERE requester_id=? OR approver_id=?"
            args += [actor.id, actor.id]
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        with self.db.transaction(write=False) as conn:
            return [
                self._project(conn, r, detail=False)
                for r in conn.execute(query, (*args, limit, offset)).fetchall()
            ]

    def decide(self, actor: Principal, ident: str, body: Decision) -> dict:
        if actor.kind != "human":
            raise GrantError("HUMAN_REQUIRED", 403)
        self.get(actor, ident)  # Commit any observed expiry before reporting a conflict.
        error = None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            row = self._load(conn, ident, actor)
            now = time.time()
            if actor.id != row["approver_id"] or actor.id == row["requester_id"]:
                raise GrantError("ASSIGNED_APPROVER_REQUIRED", 403)
            if self._expire(conn, row, now):
                error = GrantError("REQUEST_EXPIRED")
            elif row["state"] == body.decision and row["decision_actor"] == actor.id:
                pass  # Retried identical choice cannot produce a second effect.
            elif row["revision"] != body.expected_revision or row["state"] not in (
                "AWAITING",
                "HELD",
            ):
                raise GrantError("STALE_OR_FINAL_DECISION")
            else:
                until = now + row["grant_seconds"] if body.decision == "APPROVED" else None
                conn.execute(
                    "UPDATE requests SET state=?,decision=?,decision_actor=?,decision_at=?,grant_until=?,revision=revision+1 WHERE id=?",
                    (body.decision, body.decision, actor.id, now, until, ident),
                )
                audit(
                    conn,
                    ident,
                    actor.id,
                    "request." + body.decision.lower(),
                    {"reason": body.reason},
                    now,
                )
                self._event(conn, self._load(conn, ident), now, body.reason)
            result = self._project(conn, self._load(conn, ident))
        if error:
            raise error
        return result

    def cancel(self, actor: Principal, ident: str, body: Cancel) -> dict:
        error = None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "request:create")
            row = self._load(conn, ident, actor)
            allowed = (actor.kind == "integration" and "request:create" in actor.scopes) or (
                actor.kind == "human" and (actor.role == "admin" or actor.id == row["requester_id"])
            )
            if not allowed:
                raise GrantError("CANCELLATION_FORBIDDEN", 403)
            if row["execution_id"]:
                raise GrantError("EXECUTION_ALREADY_COMMITTED")
            if row["state"] == "CANCELLED":
                return self._project(conn, row)
            now = time.time()
            if self._expire(conn, row, now):
                error = GrantError("REQUEST_EXPIRED")
            elif row["revision"] != body.expected_revision or row["state"] in ("DENIED", "EXPIRED"):
                raise GrantError("STALE_OR_FINAL_REQUEST")
            else:
                conn.execute(
                    "UPDATE requests SET state='CANCELLED',revision=revision+1 WHERE id=?", (ident,)
                )
                audit(conn, ident, actor.id, "request.cancelled", {"reason": body.reason}, now)
                self._event(conn, self._load(conn, ident), now, body.reason)
            result = self._project(conn, self._load(conn, ident))
        if error:
            raise error
        return result

    def consume(self, actor: Principal, ident: str, body: Consume) -> dict:
        actor.require_scope("grant:consume")
        self.get(actor, ident)
        error = None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "grant:consume")
            row, now = self._load(conn, ident, actor), time.time()
            if conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1":
                raise GrantError("RECOVERY_RECONCILIATION_REQUIRED", 503)
            if row["action_hash"] != body.action_hash:
                raise GrantError("ACTION_FINGERPRINT_MISMATCH")
            if row["execution_id"]:
                if row["execution_id"] != body.execution_id:
                    raise GrantError("EXECUTION_ALREADY_COMMITTED")
                return {
                    "request_id": ident,
                    "execution_id": body.execution_id,
                    "committed": True,
                    "replay": True,
                    "action_hash": row["action_hash"],
                }
            if self._expire(conn, row, now):
                error = GrantError("GRANT_EXPIRED")
            elif row["state"] != "APPROVED" or not row["grant_until"] or row["grant_until"] <= now:
                raise GrantError("VALID_APPROVAL_REQUIRED", 409)
            else:
                conn.execute(
                    "UPDATE requests SET execution_id=?,execution_state='COMMITTED',committed_at=?,revision=revision+1 WHERE id=?",
                    (body.execution_id, now, ident),
                )
                audit(
                    conn,
                    ident,
                    actor.id,
                    "execution.committed",
                    {"execution_id": body.execution_id, "action_hash": body.action_hash},
                    now,
                )
        if error:
            raise error
        return {
            "request_id": ident,
            "execution_id": body.execution_id,
            "committed": True,
            "replay": False,
            "action_hash": body.action_hash,
        }

    def report(self, actor: Principal, ident: str, body: Result) -> dict:
        actor.require_scope("result:write")
        encoded = json_text(body.model_dump())
        with self.db.transaction() as conn:
            require_current_authority(conn, actor, "result:write")
            row = self._load(conn, ident, actor)
            if row["execution_id"] != body.execution_id or row["action_hash"] != body.action_hash:
                raise GrantError("EXECUTION_BINDING_MISMATCH")
            if row["execution_result"] == encoded:
                return self._project(conn, row)
            if row["execution_state"] in ("REPORTED_SUCCEEDED", "REPORTED_FAILED"):
                raise GrantError("RESULT_ALREADY_FINAL")
            if row["execution_state"] == "UNKNOWN" and body.status == "RUNNING":
                raise GrantError("RESULT_REGRESSION")
            conn.execute(
                "UPDATE requests SET execution_state=?,execution_result=?,revision=revision+1 WHERE id=?",
                (body.status, encoded, ident),
            )
            audit(
                conn,
                ident,
                actor.id,
                "execution.result_reported",
                {"status": body.status, "evidence": body.evidence},
            )
            return self._project(conn, self._load(conn, ident))

    def resume_after_restore(self, *, acknowledged: bool) -> dict:
        """Conservative local recovery: no restored pending approval can be reused."""
        if not acknowledged:
            raise GrantError("EXTERNAL_RECONCILIATION_ACK_REQUIRED", 422)
        now = time.time()
        with self.db.transaction() as conn:
            if conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] != "1":
                raise GrantError("NOT_IN_RECOVERY", 409)
            rows = conn.execute(
                "SELECT * FROM requests WHERE execution_id IS NULL AND state IN ('AWAITING','HELD','APPROVED')"
            ).fetchall()
            for row in rows:
                conn.execute(
                    "UPDATE requests SET state='CANCELLED',revision=revision+1 WHERE id=?",
                    (row["id"],),
                )
                audit(
                    conn,
                    row["id"],
                    "recovery-operator",
                    "request.cancelled_after_restore",
                    {"prior_state": row["state"]},
                    now,
                )
                self._event(
                    conn,
                    self._load(conn, row["id"]),
                    now,
                    "Restored open request invalidated; create a fresh request after reconciliation",
                )
            in_flight = conn.execute(
                "SELECT id FROM requests WHERE execution_id IS NOT NULL AND execution_state IN ('COMMITTED','RUNNING')"
            ).fetchall()
            for row in in_flight:
                conn.execute(
                    "UPDATE requests SET execution_state='UNKNOWN',execution_result=NULL,revision=revision+1 WHERE id=?",
                    (row["id"],),
                )
                audit(
                    conn,
                    row["id"],
                    "recovery-operator",
                    "execution.reconciliation_required",
                    now=now,
                )
            conn.execute("UPDATE runtime SET value='0' WHERE key='paused'")
            audit(
                conn,
                None,
                "recovery-operator",
                "recovery.resumed",
                {"cancelled_open_requests": len(rows), "unknown_executions": len(in_flight)},
                now,
            )
        return {
            "cancelled_open_requests": len(rows),
            "unknown_executions": len(in_flight),
            "paused": False,
        }

    def maintenance(self) -> None:
        now = time.time()
        with self.db.transaction() as conn:
            if self._paused(conn):
                return
            rows = conn.execute(
                "SELECT * FROM requests WHERE state IN ('AWAITING','HELD','APPROVED') AND execution_id IS NULL"
            ).fetchall()
            for row in rows:
                if self._expire(conn, row, now):
                    continue
                if (
                    row["state"] in ("AWAITING", "HELD")
                    and row["next_reminder"] <= now
                    and row["reminder_count"] < row["max_reminders"]
                ):
                    self._mail(conn, row, now, reminder=True)
                    conn.execute(
                        "UPDATE requests SET reminder_count=reminder_count+1,next_reminder=? WHERE id=?",
                        (now + row["reminder_seconds"], row["id"]),
                    )
                    audit(conn, row["id"], "policy", "request.reminded", now=now)

    def _project(self, conn: sqlite3.Connection, row: sqlite3.Row, detail: bool = True) -> dict:
        out = dict(row)
        for field in ("action", "source", "execution_result"):
            out[field] = json.loads(out[field]) if out[field] else None
        for field in ("intake_hash", "next_reminder", "grant_seconds", "reminder_seconds"):
            out.pop(field, None)
        deliveries = [
            dict(r)
            for r in conn.execute(
                "SELECT id,kind,revision,state,attempts,last_error,delivered_at FROM outbox WHERE request_id=? ORDER BY created_at,id",
                (row["id"],),
            ).fetchall()
        ]
        out["delivery_state"] = next(
            (d["state"] for d in reversed(deliveries) if d["kind"] == "webhook"), "NOT_SCHEDULED"
        )
        if detail:
            out["deliveries"] = deliveries
            out["timeline"] = [
                {**dict(r), "detail": json.loads(r["detail"])}
                for r in conn.execute(
                    "SELECT * FROM audit WHERE request_id=? ORDER BY at,id", (row["id"],)
                ).fetchall()
            ]
        return out
