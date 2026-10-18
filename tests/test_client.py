import hashlib
import hmac
import json

import httpx
import pytest

from grant.client import GrantClient, GrantClientError, verify_outcome
from grant.core import fingerprint
from grant.models import Action


def test_client_claim_hashes_the_consumers_actual_action_not_an_event():
    calls = []
    action = Action(kind="test.operation", target="test-target")

    def handler(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "committed": True,
                "replay": True,
                "request_id": "00000000-0000-0000-0000-000000000001",
                "execution_id": "durable-operation-id",
                "action_hash": fingerprint(action.model_dump()),
            },
        )

    with GrantClient(
        "https://grant.example.invalid", "test-only", transport=httpx.MockTransport(handler)
    ) as client:
        result = client.claim(
            "00000000-0000-0000-0000-000000000001", "durable-operation-id", action
        )
    assert result["replay"] is True
    assert len(calls) == 1
    assert json.loads(calls[0].content)["action_hash"] == fingerprint(action.model_dump())


def test_client_does_not_retry_ambiguous_claim():
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("simulated lost reply")

    with (
        GrantClient(
            "https://grant.example.invalid", "test-only", transport=httpx.MockTransport(handler)
        ) as client,
        pytest.raises(GrantClientError, match="TRANSPORT_AMBIGUOUS"),
    ):
        client.claim(
            "00000000-0000-0000-0000-000000000001",
            "operation-id",
            Action(kind="test.operation", target="t"),
        )
    assert len(calls) == 1


def test_client_rejects_remote_plain_http():
    with pytest.raises(ValueError):
        GrantClient("http://remote.example.invalid", "test-only")


def test_signed_outcome_verification_and_tampering():
    event = {"event_type": "grant.approval.outcome", "event_id": "event-1", "state": "APPROVED"}
    body = json.dumps(event).encode()
    secret = "isolated-test-secret"
    headers = {
        "X-Grant-Event-Id": "event-1",
        "X-Grant-Timestamp": "1000",
        "X-Grant-Signature": "sha256="
        + hmac.new(secret.encode(), b"1000." + body, hashlib.sha256).hexdigest(),
    }
    assert verify_outcome(secret, headers, body, now=1001) == event
    with pytest.raises(GrantClientError):
        verify_outcome(secret, headers, body + b" ", now=1001)
    with pytest.raises(GrantClientError, match="TIME_WINDOW"):
        verify_outcome(secret, headers, body, now=2000)
    with pytest.raises(GrantClientError):
        verify_outcome(secret, {**headers, "X-Grant-Event-Id": "other"}, body, now=1001)


@pytest.mark.parametrize(
    "event",
    [
        {"event_type": "grant.approval.outcome"},
        {"event_type": "grant.approval.outcome", "event_id": ""},
        {"event_type": "grant.approval.outcome", "event_id": 1},
    ],
)
def test_signed_event_requires_a_nonempty_string_identifier(event):
    body = json.dumps(event).encode()
    headers = {
        "x-grant-timestamp": "1000",
        "x-grant-signature": "sha256="
        + hmac.new(b"test", b"1000." + body, hashlib.sha256).hexdigest(),
    }
    with pytest.raises(GrantClientError):
        verify_outcome("test", headers, body, now=1000)


@pytest.mark.parametrize(
    "body",
    [
        b'{"event_type":"grant.approval.outcome","event_id":"e","state":"DENIED","state":"APPROVED"}',
        b"[" * 2000 + b"]" * 2000,
    ],
)
def test_signed_event_rejects_ambiguous_or_unparseable_json(body):
    headers = {
        "x-grant-event-id": "e",
        "x-grant-timestamp": "1000",
        "x-grant-signature": "sha256="
        + hmac.new(b"test", b"1000." + body, hashlib.sha256).hexdigest(),
    }
    with pytest.raises(GrantClientError):
        verify_outcome("test", headers, body, now=1000)


@pytest.mark.parametrize(
    "changed",
    [
        {"x-grant-signature": "한글"},
        {"x-grant-timestamp": "١٠٠٠"},
        {"x-grant-timestamp": "1e3"},
        {"X-GRANT-EVENT-ID": "e"},
    ],
)
def test_malformed_signature_headers_fail_with_sanitized_errors(changed):
    body = b'{"event_type":"grant.approval.outcome","event_id":"e"}'
    headers = {
        "x-grant-event-id": "e",
        "x-grant-timestamp": "1000",
        "x-grant-signature": "sha256="
        + hmac.new(b"test", b"1000." + body, hashlib.sha256).hexdigest(),
        **changed,
    }
    with pytest.raises(GrantClientError):
        verify_outcome("test", headers, body, now=1000)
