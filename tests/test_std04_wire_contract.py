"""STD-04 opt-in standards contracts; isolated stores and loopback only."""

import hashlib
import hmac
import json
import threading
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from pydantic import ValidationError

from grant.auth import Principal
from grant.core import Core
from grant.errors import GrantError
from grant.models import Decision, Intake, Integration
from grant.transport import Worker, webhook_wire_payload


def _registration(env, *, event_format="CLOUDEVENTS"):
    from grant.models import Integration

    return env.core.create_integration(
        env.admin,
        Integration(
            name="STD-04 isolated callback", kind="datarelay",
            callback_url=env.settings.callback_urls[0],
            event_format=event_format,
        ),
    )


def test_legacy_format_is_default_and_exact_original_bytes(env):
    existing = env.settings.unseal(_sealed(env, env.integration["id"]))
    assert existing.get("event_format", "LEGACY") == "LEGACY"
    raw = '{"event_type":"grant.approval.outcome","occurred_at":123.25,"event_id":"id-1"}'
    data, media = webhook_wire_payload(env.settings, existing, raw, "id-1")
    assert data == raw.encode()
    assert media == "application/json"
    assert env.core.integrations(env.admin)[0]["event_format"] == "LEGACY"


def _sealed(env, integration_id):
    with env.db.transaction(write=False) as conn:
        return conn.execute("SELECT destination FROM integrations WHERE id=?", (integration_id,)).fetchone()[0]


def test_admin_only_explicit_format_snapshot_and_invalid_mode_refused(env):
    row = _registration(env)
    assert row["event_format"] == "CLOUDEVENTS"
    sealed = env.settings.unseal(_sealed(env, row["id"]))
    assert sealed["event_format"] == "CLOUDEVENTS"
    assert sealed["integration_id"] == row["id"]
    assert sealed["event_source"] == env.settings.origin + "/api/v1/integrations/" + row["id"]
    current = {item["id"]: item for item in env.core.integrations(env.admin)}
    assert current[row["id"]]["event_format"] == "CLOUDEVENTS"
    with pytest.raises(ValidationError):
        Integration(
            name="Invalid", kind="datarelay",
            callback_url=env.settings.callback_urls[0], event_format="UNKNOWN",
        )
    requester = env.human("requester")
    response = requester.post("/api/v1/integrations", json={
        "name": "Unprivileged", "kind": "datarelay",
        "callback_url": env.settings.callback_urls[0],
        "event_format": "CLOUDEVENTS",
    })
    assert response.status_code == 403


def test_admin_registration_public_api_exposes_format_without_secrets(env):
    admin = env.human("admin")
    body = {
        "name": "Standards explicit opt-in",
        "kind": "datarelay",
        "callback_url": env.settings.callback_urls[0],
        "event_format": "CLOUDEVENTS",
        "hmac_secret": "isolated-only-never-disclose",
    }
    posted = admin.post("/api/v1/integrations", json=body)
    assert posted.status_code == 201, posted.text
    created = posted.json()
    assert created["event_format"] == "CLOUDEVENTS"
    listed = admin.get("/api/v1/integrations")
    assert listed.status_code == 200
    registered = next(row for row in listed.json() if row["id"] == created["id"])
    assert registered["event_format"] == "CLOUDEVENTS"
    assert "hmac_secret" not in listed.text
    assert body["hmac_secret"] not in posted.text
    invalid = admin.post("/api/v1/integrations", json={**body, "event_format": "UNKNOWN"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "INVALID_INPUT"


def test_cloudevents_structured_envelope_and_strict_id_binding(env):
    registration = _registration(env)
    destination = env.settings.unseal(_sealed(env, registration["id"]))
    payload = {
        "event_type": "grant.approval.outcome",
        "event_id": "fixed-event-1", "occurred_at": 1740000000.125,
        "request_id": "req-1", "state_revision": 2,
        "action_hash": "a" * 64, "decision": "APPROVED", "state": "APPROVED",
    }
    wire, media = webhook_wire_payload(env.settings, destination,
                                      json.dumps(payload), "fixed-event-1")
    event = json.loads(wire)
    assert media == "application/cloudevents+json"
    assert event == {
        "specversion": "1.0", "id": "fixed-event-1",
        "source": destination["event_source"],
        "type": "grant.approval.outcome",
        "time": "2025-02-19T21:20:00.125Z",
        "datacontenttype": "application/json", "data": payload,
    }
    with pytest.raises(GrantError, match="WEBHOOK_EVENT_ID_MISMATCH"):
        webhook_wire_payload(env.settings, destination, json.dumps(payload), "changed")
    with pytest.raises(GrantError, match="UNSUPPORTED_WEBHOOK_FORMAT"):
        webhook_wire_payload(env.settings, {**destination, "event_format": "BAD"},
                             json.dumps(payload), "fixed-event-1")


@pytest.fixture
def loopback_receiver():
    received = []
    statuses = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            raw = self.rfile.read(int(self.headers["Content-Length"]))
            received.append((dict(self.headers), raw))
            self.send_response(statuses.pop(0) if statuses else 202)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/callback", received, statuses
    server.shutdown()
    server.server_close()
    thread.join()


def test_signed_cloudevents_retry_same_id_and_execution_still_not_started(env, loopback_receiver):
    url, received, statuses = loopback_receiver
    settings = replace(env.settings, callback_urls=(url,))
    core = Core(env.db, settings)
    registration = core.create_integration(env.admin, Integration(
        name="Signed CloudEvents", kind="datarelay", callback_url=url,
        hmac_secret="isolated-signature-key", event_format="CLOUDEVENTS",
    ))
    from grant.models import Profile

    prof = core.create_profile(env.admin, Profile(
        name="STD-04 profile", integration_id=registration["id"],
        approver_id=env.users["approver"]["id"], action_kind="service.restart",
    ))
    core.transition_profile(env.admin, prof["id"], "TESTING")
    core.transition_profile(env.admin, prof["id"], "ACTIVE")
    token = env.auth.issue_token(env.admin, registration["id"], ["request:create"])["token"]
    row = core.create_request(
        env.auth.api_token(token),
        Intake(**env.intake(profile_id=prof["id"])),
    )
    core.decide(Principal(env.users["approver"]["id"], "human", "member"),
                row["id"], Decision(decision="APPROVED", expected_revision=row["revision"]))
    statuses.extend([503, 202])
    worker = Worker(env.db, settings)
    for _ in range(8):
        worker.tick(limit=1)
        if received:
            break
    assert len(received) == 1
    with env.db.transaction() as conn:
        conn.execute("UPDATE outbox SET available_at=0 WHERE kind='webhook' AND request_id=?",
                     (row["id"],))
    for _ in range(8):
        worker.tick(limit=1)
        if len(received) == 2:
            break
    assert len(received) == 2
    for headers, raw in received:
        envelope = json.loads(raw)
        assert headers["Content-Type"] == "application/cloudevents+json"
        assert headers["X-Grant-Event-Id"] == envelope["id"]
        expected = hmac.new(
            b"isolated-signature-key", headers["X-Grant-Timestamp"].encode() + b"." + raw,
            hashlib.sha256,
        ).hexdigest()
        assert headers["X-Grant-Signature"] == "sha256=" + expected
        assert envelope["data"]["request_id"] == row["id"]
    assert received[0][1] == received[1][1]
    result = core.get(env.admin, row["id"])
    assert result["execution_state"] == "NOT_STARTED"


def test_connection_diagnostic_uses_cloudevents_and_never_authorizes_execution(
    env, loopback_receiver,
):
    url, received, _ = loopback_receiver
    settings = replace(env.settings, callback_urls=(url,))
    core = Core(env.db, settings)
    registered = core.create_integration(
        env.admin,
        Integration(
            name="Isolated diagnostics", kind="datarelay",
            callback_url=url, event_format="CLOUDEVENTS",
            hmac_secret="isolated-diagnostic-hmac",
        ),
    )
    env.app.state.settings = settings
    admin = env.human("admin")
    response = admin.post(f"/api/v1/integrations/{registered['id']}/test")
    assert response.status_code == 200, response.text
    assert response.json()["execution_allowed"] is False
    assert len(received) == 1
    headers, raw = received[0]
    event = json.loads(raw)
    assert headers["Content-Type"] == "application/cloudevents+json"
    assert event["type"] == "grant.connection.test"
    assert event["data"]["execution_allowed"] is False
    assert event["id"] == response.json()["event_id"]
    assert event["source"] == env.settings.origin + "/api/v1/integrations/" + registered["id"]
    assert event["time"].endswith("Z")


def test_explicit_rfc9457_problem_detail_preserves_legacy_for_other_accepts(env):
    from fastapi.testclient import TestClient

    with TestClient(env.app) as client:
        original = client.get("/api/v1/integrations")
        assert original.status_code == 401
        assert original.headers["content-type"].startswith("application/json")
        assert set(original.json()) == {"error"}
        for accept in ["*/*", "application/json", "application/problem+json;q=0"]:
            legacy = client.get("/api/v1/integrations", headers={"accept": accept})
            assert legacy.json() == original.json()
            assert legacy.headers["content-type"].startswith("application/json")
        problem = client.get("/api/v1/integrations",
                             headers={"accept": "application/problem+json"})
        assert problem.status_code == 401
        assert problem.headers["content-type"].startswith("application/problem+json")
        body = problem.json()
        assert body["type"] == "about:blank"
        assert body["title"] == "Unauthorized"
        assert body["status"] == 401
        assert body["code"] == original.json()["error"]["code"]
        assert body["category"] == original.json()["error"]["category"]
        assert "detail" not in body
        malformed = client.post(
            "/api/v1/auth/login", json={"username": "x"},
            headers={"accept": "application/problem+json"},
        )
        assert malformed.status_code == 422
        assert malformed.headers["content-type"].startswith("application/problem+json")
        invalid = malformed.json()
        assert invalid["code"] == "INVALID_INPUT" and "fields" in invalid
        assert "body.password" in invalid["fields"]
        assert "input" not in invalid and "detail" not in invalid
