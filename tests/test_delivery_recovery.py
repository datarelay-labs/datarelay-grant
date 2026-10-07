import hashlib
import hmac
import json
import threading
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from grant.auth import Principal
from grant.core import Core
from grant.db import Database
from grant.errors import GrantError
from grant.models import Consume, Decision
from grant.transport import Worker


@pytest.fixture
def receiver():
    received, statuses = [], []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            received.append((dict(self.headers), body))
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


def ready(env, url):
    settings = replace(env.settings, callback_urls=(url,))
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE integrations SET destination=? WHERE id=?",
            (
                settings.seal({"url": url, "headers": {}, "hmac_secret": "test-only-hmac"}),
                env.integration["id"],
            ),
        )
    principal = env.auth.api_token(env.token["token"])
    row = env.core.create_request(
        principal, __import__("grant.models", fromlist=["Intake"]).Intake(**env.intake())
    )
    approver = Principal(env.users["approver"]["id"], "human", "member")
    env.core.decide(approver, row["id"], Decision(decision="APPROVED", expected_revision=1))
    return settings, row


def test_real_http_callback_retry_uses_same_event_and_not_execution(env, receiver):
    url, received, statuses = receiver
    settings, row = ready(env, url)
    statuses.extend([500, 202])
    worker = Worker(env.db, settings)
    assert worker.tick() == 1
    with env.db.transaction() as conn:
        outbox = conn.execute("SELECT * FROM outbox WHERE kind='webhook'").fetchone()
        assert outbox["state"] == "PENDING" and outbox["attempts"] == 1
        conn.execute("UPDATE outbox SET available_at=0 WHERE id=?", (outbox["id"],))
    assert worker.tick() == 1
    assert len(received) == 2
    one, two = [json.loads(body) for _, body in received]
    assert one["event_id"] == two["event_id"]
    headers, body = received[-1]
    expected = hmac.new(
        b"test-only-hmac", headers["X-Grant-Timestamp"].encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    assert headers["X-Grant-Signature"] == "sha256=" + expected
    current = env.core.get(env.admin, row["id"])
    assert current["delivery_state"] == "DELIVERED"
    assert current["execution_state"] == "NOT_STARTED" and current["execution_id"] is None


def test_redirect_is_not_followed_and_manual_resend_preserves_id(env, receiver):
    url, received, statuses = receiver
    settings, row = ready(env, url)
    settings = replace(settings, max_delivery_attempts=1)
    statuses.append(302)
    worker = Worker(env.db, settings)
    worker.tick()
    state = env.core.get(env.admin, row["id"])
    event = next(d for d in state["deliveries"] if d["kind"] == "webhook")
    assert event["state"] == "FAILED"
    worker.resend(env.admin, event["id"])
    worker.tick()
    assert len(received) == 2
    assert json.loads(received[0][1])["event_id"] == json.loads(received[1][1])["event_id"]


def test_restart_reclaims_expired_lease(env, receiver):
    url, received, _ = receiver
    settings, row = ready(env, url)
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE outbox SET state='SENDING',lease_token='dead-worker',lease_until=0,attempts=1 WHERE kind='webhook'"
        )
    restarted = Database(settings.database)
    Worker(restarted, settings).tick()
    assert len(received) == 1
    assert Core(restarted, settings).get(env.admin, row["id"])["delivery_state"] == "DELIVERED"


def test_restore_pauses_delivery_and_execution_clears_sessions(env, receiver, tmp_path):
    url, received, _ = receiver
    settings, row = ready(env, url)
    env.human("approver")
    backup, restored = tmp_path / "backup.sqlite", tmp_path / "restored.sqlite"
    env.db.backup(backup)
    Database.restore(backup, restored)
    restored_db = Database(restored)
    with restored_db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
    restored_settings = replace(settings, database=restored)
    assert Worker(restored_db, restored_settings).tick() == 0
    assert received == []
    actor = env.auth.api_token(env.token["token"])
    with pytest.raises(GrantError, match="RECOVERY_RECONCILIATION_REQUIRED"):
        Core(restored_db, restored_settings).consume(
            actor, row["id"], Consume(execution_id="restore-test", action_hash=row["action_hash"])
        )
    with pytest.raises(ValueError):
        Database.restore(backup, restored)


def test_reminders_bounded_and_preserved_across_restart(env):
    row = env.api.post("/api/v1/requests", json=env.intake()).json()
    for _ in range(5):
        with env.db.transaction() as conn:
            conn.execute("UPDATE requests SET next_reminder=0 WHERE id=?", (row["id"],))
        Core(Database(env.settings.database), env.settings).maintenance()
    current = env.core.get(env.admin, row["id"])
    assert current["reminder_count"] == 3
    assert current["deadline"] == row["deadline"]
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM outbox WHERE kind='email'").fetchone()[0] == 4


def test_cancelled_approval_is_not_delivered_as_a_live_approval(env, receiver):
    from grant.models import Cancel

    url, received, _ = receiver
    settings, row = ready(env, url)
    current = env.core.get(env.admin, row["id"])
    env.core.cancel(env.admin, row["id"], Cancel(expected_revision=current["revision"]))
    Worker(env.db, settings).tick()
    assert len(received) == 1
    assert json.loads(received[0][1])["state"] == "CANCELLED"
    with env.db.transaction(write=False) as conn:
        assert (
            conn.execute(
                "SELECT count(*) FROM outbox WHERE kind='webhook' AND state='SUPERSEDED'"
            ).fetchone()[0]
            == 1
        )


def test_recovery_resume_invalidates_restored_open_requests(env, receiver, tmp_path):
    url, received, _ = receiver
    settings, approved = ready(env, url)
    principal = env.auth.api_token(env.token["token"])
    pending = env.api.post("/api/v1/requests", json=env.intake()).json()
    backup, restored = tmp_path / "resume-backup.sqlite", tmp_path / "resume-restored.sqlite"
    env.db.backup(backup)
    Database.restore(backup, restored)
    db = Database(restored)
    restored_settings = replace(settings, database=restored)
    core = Core(db, restored_settings)
    with pytest.raises(GrantError, match="EXTERNAL_RECONCILIATION_ACK_REQUIRED"):
        core.resume_after_restore(acknowledged=False)
    result = core.resume_after_restore(acknowledged=True)
    assert result == {"cancelled_open_requests": 2, "unknown_executions": 0, "paused": False}
    assert core.get(env.admin, approved["id"])["decision"] == "APPROVED"
    for item in (approved, pending):
        assert core.get(env.admin, item["id"])["state"] == "CANCELLED"
        with pytest.raises(GrantError, match="VALID_APPROVAL_REQUIRED"):
            core.consume(
                principal,
                item["id"],
                Consume(execution_id="never-execute", action_hash=item["action_hash"]),
            )
    Worker(db, restored_settings).tick()
    assert len(received) == 2
    assert all(json.loads(body)["state"] == "CANCELLED" for _, body in received)


def test_recovery_resume_marks_committed_work_unknown(env, receiver, tmp_path):
    url, _, _ = receiver
    settings, row = ready(env, url)
    principal = env.auth.api_token(env.token["token"])
    env.core.consume(
        principal,
        row["id"],
        Consume(execution_id="already-committed", action_hash=row["action_hash"]),
    )
    backup, restored = tmp_path / "inflight-backup.sqlite", tmp_path / "inflight-restored.sqlite"
    env.db.backup(backup)
    Database.restore(backup, restored)
    core = Core(Database(restored), replace(settings, database=restored))
    assert core.resume_after_restore(acknowledged=True)["unknown_executions"] == 1
    assert core.get(env.admin, row["id"])["execution_state"] == "UNKNOWN"
    assert (
        core.consume(
            principal,
            row["id"],
            Consume(execution_id="already-committed", action_hash=row["action_hash"]),
        )["replay"]
        is True
    )
    with pytest.raises(GrantError, match="EXECUTION_ALREADY_COMMITTED"):
        core.consume(
            principal,
            row["id"],
            Consume(execution_id="new-execution", action_hash=row["action_hash"]),
        )


def test_connection_test_is_admin_only_and_never_an_approval(env, receiver):
    url, received, _ = receiver
    from fastapi.testclient import TestClient

    from grant.app import create_app
    from grant.models import Integration

    settings = replace(env.settings, callback_urls=(url,))
    integration = Core(env.db, settings).create_integration(
        env.admin, Integration(name="Test receiver", kind="datarelay", callback_url=url)
    )
    app = create_app(settings)
    with TestClient(app) as client:
        login = client.post(
            "/api/v1/auth/login", json={"username": "admin", "password": env.password}
        )
        client.headers["x-csrf-token"] = login.json()["csrf"]
        response = client.post(f"/api/v1/integrations/{integration['id']}/test")
        assert response.status_code == 200
        assert response.json()["execution_allowed"] is False
    assert json.loads(received[0][1])["event_type"] == "grant.connection.test"
    assert (
        env.human("requester").post(f"/api/v1/integrations/{integration['id']}/test").status_code
        == 403
    )
    assert env.api.post(f"/api/v1/integrations/{integration['id']}/test").status_code == 403


def test_recovery_pause_freezes_expiry_maintenance(env, tmp_path):
    pending = env.api.post("/api/v1/requests", json=env.intake()).json()
    backup = tmp_path / "paused-backup.sqlite"
    restored = tmp_path / "paused-restored.sqlite"
    env.db.backup(backup)
    Database.restore(backup, restored)

    restored_db = Database(restored)
    restored_settings = replace(env.settings, database=restored)
    with restored_db.transaction() as conn:
        conn.execute(
            "UPDATE requests SET deadline=0,next_reminder=0 WHERE id=?",
            (pending["id"],),
        )

    core = Core(restored_db, restored_settings)
    assert core.get(env.admin, pending["id"])["state"] == "AWAITING"
    core.maintenance()
    worker = Worker(restored_db, restored_settings)
    assert worker.tick() == 0
    with restored_db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT state,reminder_count FROM requests WHERE id=?", (pending["id"],)
        ).fetchone()
        assert row["state"] == "AWAITING"
        assert row["reminder_count"] == 0
        assert conn.execute("SELECT count(*) FROM outbox WHERE kind='email'").fetchone()[0] == 1
        assert (
            conn.execute(
                "SELECT count(*) FROM audit WHERE request_id=? AND action='request.expired'",
                (pending["id"],),
            ).fetchone()[0]
            == 0
        )
