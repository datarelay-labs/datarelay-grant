"""Bounded integration client: communicates decisions; never executes user actions.

Consumers must keep their own durable operation ledger. A repeated claim is a
reconciliation signal, not permission to execute an action for the second time.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from urllib.parse import urlsplit

import httpx

from .core import bounded_json, fingerprint
from .models import Action, Intake


class GrantClientError(RuntimeError):
    """Sanitized protocol error. Network ambiguity is deliberately not retried."""


class GrantClient:
    def __init__(self, origin: str, token: str, *, dev_loopback: bool = False, transport=None):
        p = urlsplit(origin)
        if (
            p.path not in ("", "/")
            or p.query
            or p.fragment
            or p.username
            or p.password
            or not p.hostname
            or not token
            or any(c in token for c in "\r\n")
        ):
            raise ValueError("Invalid Grant origin or credential")
        if p.scheme != "https" and not (
            dev_loopback and p.scheme == "http" and p.hostname in ("localhost", "127.0.0.1", "::1")
        ):
            raise ValueError("Grant requires HTTPS outside explicit loopback development")
        self._http = httpx.Client(
            base_url=origin.rstrip("/"),
            headers={"Authorization": "Bearer " + token},
            verify=True,
            trust_env=False,
            follow_redirects=False,
            timeout=15,
            transport=transport,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        try:
            response = self._http.request(method, "/api/v1" + path, json=body)
        except httpx.HTTPError as exc:
            raise GrantClientError(
                "TRANSPORT_AMBIGUOUS: reconcile before retrying a mutation"
            ) from exc
        if response.status_code >= 300:
            raise GrantClientError("GRANT_HTTP_" + str(response.status_code))
        try:
            value = response.json()
        except ValueError as exc:
            raise GrantClientError("INVALID_RESPONSE") from exc
        if not isinstance(value, dict):
            raise GrantClientError("INVALID_RESPONSE")
        return value

    @staticmethod
    def _id(ident: str) -> str:
        import uuid

        return str(uuid.UUID(ident))

    def create_request(self, request: Intake) -> dict:
        return self._call("POST", "/requests", request.model_dump())

    def read(self, request_id: str) -> dict:
        return self._call("GET", "/requests/" + self._id(request_id))

    def claim(self, request_id: str, execution_id: str, expected_action: Action) -> dict:
        action = expected_action.model_dump()
        bounded_json(action)
        return self._call(
            "POST",
            "/requests/" + self._id(request_id) + "/consume",
            {"execution_id": execution_id, "action_hash": fingerprint(action)},
        )

    def report(
        self,
        request_id: str,
        execution_id: str,
        expected_action: Action,
        status: str,
        evidence: str = "",
    ) -> dict:
        from .models import Result

        body = Result(
            execution_id=execution_id,
            action_hash=fingerprint(expected_action.model_dump()),
            status=status,
            evidence=evidence,
        )
        return self._call(
            "POST", "/requests/" + self._id(request_id) + "/result", body.model_dump()
        )


def verify_outcome(
    secret: str,
    headers: dict[str, str],
    body: bytes,
    *,
    now: float | None = None,
    max_skew_seconds: int = 300,
) -> dict:
    """Verify a signed event; receiver-side event-ID dedup/current-state checks still apply."""
    if not secret or len(body) > 65536 or not 1 <= max_skew_seconds <= 3600:
        raise GrantClientError("INVALID_SIGNED_EVENT")
    normalized: dict[str, str] = {}
    for key, value in headers.items():
        lowered = key.lower()
        if lowered in normalized:
            raise GrantClientError("AMBIGUOUS_EVENT_HEADERS")
        normalized[lowered] = value
    timestamp = normalized.get("x-grant-timestamp", "")
    if not re.fullmatch(r"[0-9]{1,12}", timestamp):
        raise GrantClientError("INVALID_SIGNED_EVENT")
    try:
        stamp = int(timestamp)
    except ValueError as exc:
        raise GrantClientError("INVALID_SIGNED_EVENT") from exc
    if abs((time.time() if now is None else now) - stamp) > max_skew_seconds:
        raise GrantClientError("EVENT_OUTSIDE_TIME_WINDOW")
    signature = (
        "sha256="
        + hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    )
    supplied = normalized.get("x-grant-signature", "")
    if not re.fullmatch(r"sha256=[0-9a-f]{64}", supplied):
        raise GrantClientError("INVALID_SIGNED_EVENT")
    if not hmac.compare_digest(signature, supplied):
        raise GrantClientError("INVALID_SIGNED_EVENT")
    try:
        from .app import unique_object

        event = json.loads(body, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise GrantClientError("INVALID_SIGNED_EVENT") from exc
    if (
        not isinstance(event, dict)
        or event.get("event_type") != "grant.approval.outcome"
        or not isinstance(event.get("event_id"), str)
        or not 1 <= len(event["event_id"]) <= 200
        or event["event_id"] != normalized.get("x-grant-event-id")
    ):
        raise GrantClientError("INVALID_SIGNED_EVENT")
    return event
