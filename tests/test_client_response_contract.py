"""Validate the consumer boundary independently of a successful HTTP status."""

import hashlib
import hmac
import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from grant.client import GrantClient, GrantClientError, verify_outcome
from grant.core import fingerprint
from grant.models import Action, Intake

RID = "00000000-0000-0000-0000-000000000001"
ACTION = Action(kind="test.operation", target="unchanged-target")
HASH = fingerprint(ACTION.model_dump())
CLAIM = {
    "request_id": RID,
    "execution_id": "operation-1",
    "action_hash": HASH,
    "committed": True,
    "replay": False,
}
RECORD = {
    "id": RID,
    "external_id": "request-1",
    "profile_id": "profile-1",
    "action": ACTION.model_dump(),
    "action_hash": HASH,
    "execution_id": "operation-1",
    "execution_state": "REPORTED_SUCCEEDED",
}


@contextmanager
def client_response(value=None, *, raw=None, status=200):
    calls = []

    def handle(request):
        calls.append(request)
        if raw is not None:
            return httpx.Response(status, content=raw)
        return httpx.Response(status, json=value)

    with GrantClient(
        "https://grant.example.invalid", "fixture-only", transport=httpx.MockTransport(handle)
    ) as client:
        yield (client, calls)


@pytest.mark.parametrize(
    "field,bad",
    [
        ("request_id", "other"),
        ("execution_id", "other"),
        ("action_hash", "0" * 64),
        ("committed", False),
        ("committed", 1),
        ("committed", "true"),
        ("replay", 0),
        ("replay", 1),
        ("replay", "false"),
        ("replay", None),
    ],
)
def test_claim_rejects_wrong_binding_or_ambiguous_boolean(field, bad):
    with (
        client_response({**CLAIM, field: bad}) as (client, calls),
        pytest.raises(GrantClientError, match="CLAIM_BINDING_MISMATCH"),
    ):
        client.claim(RID, "operation-1", ACTION)
    assert len(calls) == 1


@pytest.mark.parametrize("missing", list(CLAIM))
def test_claim_requires_all_authority_fields(missing):
    value = dict(CLAIM)
    del value[missing]
    with (
        client_response(value) as (client, _),
        pytest.raises(GrantClientError, match="CLAIM_BINDING_MISMATCH"),
    ):
        client.claim(RID, "operation-1", ACTION)


@pytest.mark.parametrize("replay", [False, True])
def test_claim_preserves_explicit_replay(replay):
    with client_response({**CLAIM, "replay": replay}) as (client, _):
        assert client.claim(RID, "operation-1", ACTION)["replay"] is replay


@pytest.mark.parametrize(
    "field,bad",
    [
        ("id", "other"),
        ("external_id", "other"),
        ("profile_id", "other"),
        ("action_hash", "0" * 64),
        ("action", {"kind": "test.operation", "target": "changed"}),
        ("action", None),
        ("action", {}),
    ],
)
def test_create_binds_server_receipt_to_submitted_plan(field, bad):
    request = Intake(external_id="request-1", profile_id="profile-1", title="Test", action=ACTION)
    with (
        client_response({**RECORD, field: bad}) as (client, _),
        pytest.raises(GrantClientError, match="RESPONSE_BINDING_MISMATCH"),
    ):
        client.create_request(request)


def test_create_accepts_matching_receipt():
    request = Intake(external_id="request-1", profile_id="profile-1", title="Test", action=ACTION)
    with client_response(RECORD) as (client, _):
        assert client.create_request(request)["id"] == RID


@pytest.mark.parametrize(
    "field,bad",
    [
        ("id", "other"),
        ("execution_id", "other"),
        ("action_hash", "0" * 64),
        ("execution_state", "RUNNING"),
        ("execution_state", None),
    ],
)
def test_report_checks_actual_acknowledgement_binding(field, bad):
    with (
        client_response({**RECORD, field: bad}) as (client, _),
        pytest.raises(GrantClientError, match="BINDING_MISMATCH"),
    ):
        client.report(RID, "operation-1", ACTION, "REPORTED_SUCCEEDED")


@pytest.mark.parametrize(
    "raw",
    [
        b'{"id":"one","id":"two"}',
        b'{"value":NaN}',
        b'{"value":Infinity}',
        b'{"value":-Infinity}',
        b'{"value":1e9999}',
        b"[]",
        b"null",
        b"not-json",
        b"\xff",
        b"[" * 2000 + b"]" * 2000,
    ],
)
def test_ambiguous_json_is_a_sanitized_protocol_error(raw):
    with (
        client_response(raw=raw) as (client, _),
        pytest.raises(GrantClientError, match="INVALID_RESPONSE"),
    ):
        client.read(RID)


def test_streamed_response_is_bounded():
    with (
        client_response(raw=b" " * (1048576 + 1)) as (client, _),
        pytest.raises(GrantClientError, match="RESPONSE_TOO_LARGE"),
    ):
        client.read(RID)


@pytest.mark.parametrize("status", [301, 302, 401, 403, 409, 500, 503])
def test_client_never_retries_or_follows_non_success(status):
    with (
        client_response(CLAIM, status=status) as (client, calls),
        pytest.raises(GrantClientError, match="GRANT_HTTP_" + str(status)),
    ):
        client.claim(RID, "operation-1", ACTION)
    assert len(calls) == 1


@pytest.mark.parametrize("clock", [float("nan"), float("inf"), float("-inf"), True, "1000"])
def test_signature_verifier_rejects_invalid_clocks(clock):
    body = b'{"event_type":"grant.approval.outcome","event_id":"e"}'
    headers = {
        "X-Grant-Event-Id": "e",
        "X-Grant-Timestamp": "1000",
        "X-Grant-Signature": "sha256="
        + hmac.new(b"test", b"1000." + body, hashlib.sha256).hexdigest(),
    }
    with pytest.raises(GrantClientError, match="INVALID_SIGNED_EVENT"):
        verify_outcome("test", headers, body, now=clock)


def test_real_loopback_http_claim_and_result():
    received = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            received.append((self.path, body))
            value = CLAIM if self.path.endswith("/consume") else RECORD
            encoded = json.dumps(value).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with GrantClient(
            f"http://127.0.0.1:{server.server_port}", "fixture-only", dev_loopback=True
        ) as client:
            assert client.claim(RID, "operation-1", ACTION)["replay"] is False
            assert client.report(RID, "operation-1", ACTION, "REPORTED_SUCCEEDED")["id"] == RID
        assert len(received) == 2
        assert received[0][1]["action_hash"] == HASH
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
