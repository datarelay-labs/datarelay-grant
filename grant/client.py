"""Bounded integration client: communicates decisions; never executes user actions.

Consumers must keep their own durable operation ledger. A repeated claim is a
reconciliation signal, not permission to execute an action for the second time.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
import time
from urllib.parse import urlsplit

import httpx

from .core import bounded_json, fingerprint
from .errors import GrantError
from .models import Action, Consume, Intake, Result

MAX_RESPONSE_BYTES = 1048576


class GrantClientError(RuntimeError):
    """Sanitized protocol error. Network ambiguity is deliberately not retried."""


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON key")
        value[key] = item
    return value


def _reject_constant(_value):
    raise ValueError("Non-finite JSON constant")


def _finite_float(raw):
    value = float(raw)
    if not math.isfinite(value):
        raise ValueError("Non-finite JSON number")
    return value


def _json_object(body: bytes, error_code: str) -> dict:
    try:
        value = json.loads(
            body.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
            parse_float=_finite_float,
        )
    except (ValueError, UnicodeError, RecursionError):
        raise GrantClientError(error_code) from None
    if not isinstance(value, dict):
        raise GrantClientError(error_code)
    return value


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
            with self._http.stream(method, "/api/v1" + path, json=body) as response:
                if not 200 <= response.status_code < 300:
                    raise GrantClientError("GRANT_HTTP_" + str(response.status_code))
                chunks, size = [], 0
                for chunk in response.iter_bytes(chunk_size=65536):
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        raise GrantClientError("RESPONSE_TOO_LARGE")
                    chunks.append(chunk)
        except httpx.HTTPError:
            raise GrantClientError(
                "TRANSPORT_AMBIGUOUS: reconcile before retrying a mutation"
            ) from None
        return _json_object(b"".join(chunks), "INVALID_RESPONSE")

    @staticmethod
    def _id(ident: str) -> str:
        import uuid

        return str(uuid.UUID(ident))

    @staticmethod
    def _require_record(value: dict, request_id: str) -> None:
        if value.get("id") != request_id:
            raise GrantClientError("RESPONSE_BINDING_MISMATCH")

    def create_request(self, request: Intake) -> dict:
        body = request.model_dump()
        bounded_json(body)
        value = self._call("POST", "/requests", body)
        try:
            request_id = self._id(value["id"])
            returned_action = Action.model_validate(value["action"]).model_dump()
            bounded_json(returned_action)
            matches = (
                value.get("external_id") == request.external_id
                and value.get("profile_id") == request.profile_id
                and value.get("action_hash") == fingerprint(body["action"])
                and fingerprint(returned_action) == fingerprint(body["action"])
            )
        except (KeyError, TypeError, ValueError, AttributeError, UnicodeError, GrantError):
            raise GrantClientError("RESPONSE_BINDING_MISMATCH") from None
        self._require_record(value, request_id)
        if not matches:
            raise GrantClientError("RESPONSE_BINDING_MISMATCH")
        return value

    def read(self, request_id: str) -> dict:
        request_id = self._id(request_id)
        value = self._call("GET", "/requests/" + request_id)
        self._require_record(value, request_id)
        return value

    def claim(self, request_id: str, execution_id: str, expected_action: Action) -> dict:
        request_id = self._id(request_id)
        action = expected_action.model_dump()
        bounded_json(action)
        body = Consume(execution_id=execution_id, action_hash=fingerprint(action))
        value = self._call("POST", "/requests/" + request_id + "/consume", body.model_dump())
        if (
            value.get("request_id") != request_id
            or value.get("execution_id") != body.execution_id
            or value.get("action_hash") != body.action_hash
            or value.get("committed") is not True
            or type(value.get("replay")) is not bool
        ):
            raise GrantClientError("CLAIM_BINDING_MISMATCH")
        return value

    def report(
        self,
        request_id: str,
        execution_id: str,
        expected_action: Action,
        status: str,
        evidence: str = "",
    ) -> dict:
        request_id = self._id(request_id)
        action = expected_action.model_dump()
        bounded_json(action)
        body = Result(
            execution_id=execution_id,
            action_hash=fingerprint(action),
            status=status,
            evidence=evidence,
        )
        value = self._call("POST", "/requests/" + request_id + "/result", body.model_dump())
        self._require_record(value, request_id)
        if (
            value.get("execution_id") != body.execution_id
            or value.get("action_hash") != body.action_hash
            or value.get("execution_state") != body.status
        ):
            raise GrantClientError("RESULT_BINDING_MISMATCH")
        return value


def verify_outcome(
    secret: str,
    headers: dict[str, str],
    body: bytes,
    *,
    now: float | None = None,
    max_skew_seconds: int = 300,
) -> dict:
    """Verify a signed event; receiver-side event-ID dedup/current-state checks still apply."""
    clock = time.time() if now is None else now
    if (
        not isinstance(secret, str)
        or not secret
        or not isinstance(body, bytes)
        or len(body) > 65536
        or type(max_skew_seconds) is not int
        or not 1 <= max_skew_seconds <= 3600
        or type(clock) not in (int, float)
        or not math.isfinite(clock)
        or not isinstance(headers, dict)
    ):
        raise GrantClientError("INVALID_SIGNED_EVENT")
    normalized: dict[str, str] = {}
    for key, value in headers.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise GrantClientError("INVALID_SIGNED_EVENT")
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
    if abs(clock - stamp) > max_skew_seconds:
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
    event = _json_object(body, "INVALID_SIGNED_EVENT")
    if (
        not isinstance(event, dict)
        or event.get("event_type") != "grant.approval.outcome"
        or not isinstance(event.get("event_id"), str)
        or not 1 <= len(event["event_id"]) <= 200
        or event["event_id"] != normalized.get("x-grant-event-id")
    ):
        raise GrantClientError("INVALID_SIGNED_EVENT")
    return event
