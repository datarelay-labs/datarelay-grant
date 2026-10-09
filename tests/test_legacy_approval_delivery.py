"""Pre-G10A queued approval email must not invite decisions while collaboration blocks them.

Historical v8 requests keep a plaintext, no-issuance approval notification.
Modern sealed G10A emails already have their own per-seat deliverability guard.
These cases exercise only a disposable database and mocked transports.
"""

import json

import pytest

from grant.transport import Worker


def _queued_legacy_approval(env, event_type: str) -> dict:
    created = env.human("requester").post("/api/v1/requests", json=env.intake())
    assert created.status_code == 202, created.text
    request = created.json()
    with env.db.transaction() as conn:
        queued = conn.execute(
            """SELECT id,sealed_payload,issuance_id FROM outbox
               WHERE request_id=? AND event_type='requested' AND kind='email'""",
            (request["id"],),
        ).fetchone()
        assert queued and queued["sealed_payload"] == 1 and queued["issuance_id"]
        # Convert this disposable new request to the durable pre-G10A v8 shape:
        # its queued initial notification predates sealed PIN/intent issuance.
        conn.execute(
            "UPDATE requests SET email_pin_enabled=0 WHERE id=?", (request["id"],),
        )
        conn.execute(
            """UPDATE outbox SET event_type=?,sealed_payload=0,issuance_id=NULL,
               payload=? WHERE id=?""",
            (event_type, json.dumps({
                "subject": "[Legacy] Approval requested",
                "body": "Review and approve this waiting request.",
            }), queued["id"]),
        )
    return {**request, "notification_id": queued["id"]}


@pytest.mark.parametrize("event_type", ("requested", "legacy"))
@pytest.mark.parametrize(
    ("kind", "blocked_state"),
    (("REQUEST_INFO", "INFO_REQUESTED"),
     ("REQUEST_CHANGES", "CHANGES_REQUESTED")),
)
def test_queued_legacy_approval_mail_is_superseded_while_decision_blocked(
    env, monkeypatch, event_type, kind, blocked_state,
):
    request = _queued_legacy_approval(env, event_type)
    response = env.human("approver").post(
        f"/api/v1/requests/{request['id']}/comments",
        json={
            "kind": kind, "body": "Need verified change context first",
            "expected_revision": request["revision"],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["state"] == "AWAITING"
    assert response.json()["collaboration_state"] == blocked_state
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT state FROM outbox WHERE id=?", (request["notification_id"],),
        ).fetchone()["state"] == "PENDING"

    emails = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: emails.append(args))
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: None)
    Worker(env.db, env.settings).tick()
    assert emails == [], "Blocked approval invitation must never leave outbox"
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT state FROM outbox WHERE id=?", (request["notification_id"],),
        ).fetchone()["state"] == "SUPERSEDED"
        current = conn.execute(
            "SELECT state,collaboration_state,execution_id FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()
        assert current["state"] == "AWAITING"
        assert current["collaboration_state"] == blocked_state
        assert current["execution_id"] is None
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 0


@pytest.mark.parametrize("event_type", ("requested", "legacy"))
def test_queued_legacy_approval_mail_still_delivers_when_decision_open(
    env, monkeypatch, event_type,
):
    request = _queued_legacy_approval(env, event_type)
    emails = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: emails.append(args))
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: None)
    Worker(env.db, env.settings).tick()
    assert len(emails) == 1
    assert "[Legacy] Approval requested" in emails[0][2]
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT state FROM outbox WHERE id=?", (request["notification_id"],),
        ).fetchone()["state"] == "DELIVERED"
