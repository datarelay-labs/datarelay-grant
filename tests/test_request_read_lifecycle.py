"""Passive request reads do not perform lifecycle work or external execution."""

import hashlib
import json
import time
from collections import Counter
from types import SimpleNamespace

import pytest

from grant.transport import Worker

LIFECYCLE_TABLES = (
    "requests", "request_decisions", "request_comments", "approval_assignments",
    "escalations", "decision_issuances", "decision_intents", "audit", "outbox",
)


def _row_hash(row):
    return hashlib.sha256(json.dumps(dict(row), sort_keys=True).encode()).hexdigest()


def _snapshot(env):
    with env.db.transaction(write=False) as conn:
        return {
            table: tuple(sorted(_row_hash(row) for row in conn.execute(f"SELECT * FROM {table}")))
            for table in LIFECYCLE_TABLES
        }


def _get(client, path, **params):
    response = client.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def due_requests(env):
    # Reuse the disposable API fixture; authentication itself is not under test.
    requester, approver, admin = (env.human(name) for name in ("requester", "approver", "admin"))
    rows = {}
    for name in ("expiry", "grant_expiry", "reminder", "escalation"):
        response = requester.post(
            "/api/v1/requests", json=env.intake(title=f"Read lifecycle {name}")
        )
        assert response.status_code == 202, response.text
        rows[name] = response.json()
    approved = approver.post(
        f"/api/v1/requests/{rows['grant_expiry']['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": rows["grant_expiry"]["revision"]},
    )
    assert approved.status_code == 200, approved.text
    rows["grant_expiry"] = approved.json()
    configured = admin.post(
        f"/api/v1/requests/{rows['escalation']['id']}/escalation",
        json={
            "target_user_id": env.users["stranger"]["id"],
            "after_seconds": 60,
            "expected_revision": rows["escalation"]["revision"],
        },
    )
    assert configured.status_code == 200, configured.text
    now = time.time()
    with env.db.transaction() as conn:
        # Keep all unrelated timing well outside this bounded test.
        conn.execute("UPDATE requests SET deadline=?,next_reminder=?", (now + 3600, now + 3600))
        conn.execute(
            "UPDATE requests SET deadline=?,next_reminder=? WHERE id=?",
            (now - 10, now - 10, rows["expiry"]["id"]),
        )
        conn.execute(
            "UPDATE requests SET deadline=?,grant_until=? WHERE id=?",
            (now - 10, now - 5, rows["grant_expiry"]["id"]),
        )
        conn.execute(
            "UPDATE requests SET next_reminder=? WHERE id=?",
            (now - 10, rows["reminder"]["id"]),
        )
        conn.execute(
            "UPDATE escalations SET due_at=? WHERE request_id=?",
            (now - 10, rows["escalation"]["id"]),
        )
    return SimpleNamespace(requester=requester, approver=approver, admin=admin, rows=rows)


@pytest.mark.parametrize("surface", ("list", "detail", "operations"))
def test_passive_reads_leave_due_lifecycle_state_unchanged(env, due_requests, surface):
    fixture = due_requests
    before = _snapshot(env)
    expected_ids = {row["id"] for row in fixture.rows.values()}
    for _ in range(2):
        if surface == "list":
            first = _get(fixture.approver, "/api/v1/requests", limit=2, offset=0)
            second = _get(fixture.approver, "/api/v1/requests", limit=2, offset=2)
            assert len(first) == len(second) == 2
            assert {row["id"] for row in first + second} == expected_ids
            needs = _get(fixture.approver, "/api/v1/requests", view="needs")
            assert fixture.rows["expiry"]["id"] not in {row["id"] for row in needs}
        elif surface == "detail":
            for row in fixture.rows.values():
                current = _get(fixture.approver, f"/api/v1/requests/{row['id']}")
                assert current["id"] == row["id"]
                if row["id"] == fixture.rows["expiry"]["id"]:
                    assert current["viewer_can_decide"] is False
        else:
            summary = _get(fixture.admin, "/api/v1/admin/operations")
            assert summary["counts"]["total"] == 4
        after = _snapshot(env)
        assert {table for table in before if after[table] != before[table]} == set()


def test_explicit_worker_lifecycle_tick_advances_due_work_without_dispatch(
    env, due_requests, monkeypatch
):
    fixture = due_requests
    outbound = []

    def refuse_outbound(*args, **kwargs):
        outbound.append(True)
        pytest.fail("A lifecycle-only tick must not attempt outbound delivery")

    monkeypatch.setattr("grant.transport.send_email", refuse_outbound)
    monkeypatch.setattr("grant.transport.send_webhook", refuse_outbound)
    with env.db.transaction(write=False) as conn:
        originals = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM requests")}
        old_outbox = {row["id"]: _row_hash(row) for row in conn.execute("SELECT * FROM outbox")}
        old_audit_ids = {row["id"] for row in conn.execute("SELECT id FROM audit")}

    worker = Worker(env.db, env.settings)
    assert worker.tick(limit=0) == 0
    with env.db.transaction(write=False) as conn:
        current = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM requests")}
        expired = current[fixture.rows["expiry"]["id"]]
        grant = current[fixture.rows["grant_expiry"]["id"]]
        reminder = current[fixture.rows["reminder"]["id"]]
        escalation = current[fixture.rows["escalation"]["id"]]
        assert expired["state"] == grant["state"] == "EXPIRED"
        assert expired["decision"] is None
        assert grant["decision"] == "APPROVED"
        assert expired["reminder_count"] == 0
        assert reminder["state"] == "AWAITING" and reminder["reminder_count"] == 1
        assert reminder["next_reminder"] > time.time()
        assert json.loads(escalation["approval_plan"])["members"].count(
            env.users["stranger"]["id"]
        ) == 1
        assert conn.execute(
            "SELECT fired_at FROM escalations WHERE request_id=?", (escalation["id"],)
        ).fetchone()[0] is not None
        assert conn.execute(
            "SELECT COUNT(*) FROM approval_assignments WHERE request_id=? AND approver_id=?",
            (escalation["id"], env.users["stranger"]["id"]),
        ).fetchone()[0] == 1
        for ident, row in current.items():
            assert row["execution_id"] is None and row["execution_state"] == "NOT_STARTED"
            assert row["committed_at"] is None
            for field in ("action", "action_hash", "mail_template", "deadline", "grant_until"):
                assert row[field] == originals[ident][field]
        lifecycle_actions = Counter(
            row["action"]
            for row in conn.execute("SELECT id,action FROM audit")
            if row["id"] not in old_audit_ids
            and row["action"] in {"request.expired", "request.reminded", "request.escalated"}
        )
        assert lifecycle_actions == {
            "request.expired": 2, "request.reminded": 1, "request.escalated": 1
        }
        deliveries = {row["id"]: row for row in conn.execute("SELECT * FROM outbox")}
        assert len(deliveries) > len(old_outbox)
        assert all(_row_hash(deliveries[ident]) == digest for ident, digest in old_outbox.items())
        assert all(row["attempts"] == 0 and row["delivered_at"] is None for row in deliveries.values())
        assert conn.execute(
            "SELECT COUNT(*) FROM outbox WHERE request_id=? AND event_type='reminder'",
            (reminder["id"],),
        ).fetchone()[0] == 1
    after_tick = _snapshot(env)
    assert worker.tick(limit=0) == 0
    assert _snapshot(env) == after_tick
    assert outbound == []
    overdue = _get(fixture.approver, "/api/v1/requests", view="approval_overdue")
    assert {row["id"] for row in overdue} == {expired["id"], escalation["id"]}
    operations = _get(fixture.admin, "/api/v1/admin/operations")
    assert operations["counts"]["expired"] == 2
    assert operations["counts"]["overdue"] == 2
    assert grant["id"] not in {row["id"] for row in overdue}
    assert _snapshot(env) == after_tick


def test_due_reads_cannot_make_a_decision_or_consume_an_expired_grant(env, due_requests):
    fixture = due_requests
    pending = fixture.rows["expiry"]
    approved = fixture.rows["grant_expiry"]
    detail = _get(fixture.approver, f"/api/v1/requests/{pending['id']}")
    assert detail["viewer_can_decide"] is False
    needs = _get(fixture.approver, "/api/v1/requests", view="needs")
    assert pending["id"] not in {row["id"] for row in needs}
    decision = fixture.approver.post(
        f"/api/v1/requests/{pending['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": pending["revision"]},
    )
    assert decision.status_code == 409, decision.text
    consume = env.api.post(
        f"/api/v1/requests/{approved['id']}/consume",
        json={"execution_id": "must-not-commit", "action_hash": approved["action_hash"]},
    )
    assert consume.status_code == 409, consume.text
    with env.db.transaction(write=False) as conn:
        for original, expected_decision in ((pending, None), (approved, "APPROVED")):
            row = conn.execute("SELECT * FROM requests WHERE id=?", (original["id"],)).fetchone()
            assert row["state"] == "EXPIRED" and row["decision"] == expected_decision
            assert row["execution_id"] is None and row["execution_state"] == "NOT_STARTED"
            assert row["action_hash"] == original["action_hash"]
            assert conn.execute(
                "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.expired'",
                (original["id"],),
            ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?", (pending["id"],)
        ).fetchone()[0] == 0


def test_due_approval_stays_in_overdue_views_before_maintenance(env, due_requests):
    fixture = due_requests
    pending = fixture.rows["expiry"]
    before = _snapshot(env)
    detail = _get(fixture.approver, f"/api/v1/requests/{pending['id']}")
    assert detail["state"] == "AWAITING" and detail["revision"] == pending["revision"]
    assert detail["viewer_can_decide"] is False
    assert detail["overdue"] is True
    expected = {pending["id"], fixture.rows["escalation"]["id"]}
    for view in ("overdue", "approval_overdue"):
        rows = _get(fixture.approver, "/api/v1/requests", view=view)
        assert {row["id"] for row in rows} == expected
    operations_rows = _get(fixture.admin, "/api/v1/requests", view="ops_overdue")
    assert {row["id"] for row in operations_rows} == expected
    summary = _get(fixture.admin, "/api/v1/admin/operations")
    assert summary["counts"]["overdue"] == len(expected)
    assert _snapshot(env) == before
