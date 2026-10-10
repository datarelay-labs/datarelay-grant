"""Recovery PAUSED must block direct diagnostic delivery and resend scheduling.

All identities/DB state are disposable. Outbound SMTP and HTTP are monkeypatched:
these tests do NOT connect to any receiver, send a real message, or execute work.
"""

from grant.mail_templates import NOTIFICATION_EVENTS


def _pause(env) -> None:
    with env.db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")


def _assert_paused(response) -> None:
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "RECOVERY_RECONCILIATION_REQUIRED"


def _template(admin) -> str:
    response = admin.post(
        "/api/v1/notification-template-sets",
        json={
            "name": "Isolated paused-recovery test",
            "templates": {
                event: {
                    "subject": "Synthetic {{request_title}}",
                    "body": "Never sent during recovery: {{external_id}}",
                }
                for event in NOTIFICATION_EVENTS
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _test_send_body() -> dict:
    return {
        "event": "requested",
        "sample": {
            "request_title": "Disposable",
            "request_url": "http://testserver/requests/fixture",
            "external_id": "paused-recovery-fixture",
            "action_kind": "service.restart",
            "target": "local-only",
            "reason": "synthetic",
            "deadline": "2030-01-01T00:00:00+00:00",
            "decision_state": "AWAITING",
            "execution_state": "NOT_STARTED",
        },
    }


def _pending_outbox(env) -> str:
    created = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(external_id="recovery-test-pending-notification"),
    )
    assert created.status_code == 202, created.text
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT id,state FROM outbox WHERE request_id=? AND kind='email'"
            " ORDER BY created_at LIMIT 1",
            (created.json()["id"],),
        ).fetchone()
        assert row and row["state"] == "PENDING"
        return row["id"]


def test_recovery_pause_blocks_admin_mail_test_without_delivery_or_audit(env, monkeypatch):
    admin = env.human("admin")
    outbound = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: outbound.append(args))
    _pause(env)
    response = admin.post("/api/v1/admin/mail-test")
    _assert_paused(response)
    assert outbound == []
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT count(*) FROM audit WHERE action='email.test_accepted'"
        ).fetchone()[0] == 0


def test_recovery_pause_blocks_notification_template_test_send(env, monkeypatch):
    admin = env.human("admin")
    template_id = _template(admin)
    outbound = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: outbound.append(args))
    _pause(env)
    response = admin.post(
        f"/api/v1/notification-template-sets/{template_id}/test-send",
        json=_test_send_body(),
    )
    _assert_paused(response)
    assert outbound == []


def test_recovery_pause_blocks_non_authorizing_webhook_connection_test(env, monkeypatch):
    admin = env.human("admin")
    outbound = []
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: outbound.append(args))
    _pause(env)
    response = admin.post(f"/api/v1/integrations/{env.integration['id']}/test")
    _assert_paused(response)
    assert outbound == []
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT count(*) FROM audit WHERE action='integration.test_accepted'"
        ).fetchone()[0] == 0


def test_recovery_pause_blocks_resend_state_mutation(env):
    event_id = _pending_outbox(env)
    admin = env.human("admin")
    with env.db.transaction(write=False) as conn:
        original = dict(conn.execute(
            "SELECT state,attempts,available_at FROM outbox WHERE id=?", (event_id,)
        ).fetchone())
    _pause(env)
    response = admin.post(f"/api/v1/deliveries/{event_id}/resend")
    _assert_paused(response)
    with env.db.transaction(write=False) as conn:
        after = dict(conn.execute(
            "SELECT state,attempts,available_at FROM outbox WHERE id=?", (event_id,)
        ).fetchone())
        assert after == original
        assert conn.execute(
            "SELECT count(*) FROM audit WHERE action='delivery.resend_scheduled'"
        ).fetchone()[0] == 0


def test_paused_operator_health_is_readable_but_still_role_protected(env):
    admin = env.human("admin")
    member = env.human("approver")
    _pause(env)
    response = admin.get("/api/v1/admin/health")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "degraded"
    checks = {item["id"]: item for item in response.json()["checks"]}
    assert checks["recovery"]["status"] == "degraded"
    assert member.get("/api/v1/admin/health").status_code == 403
    assert member.post("/api/v1/admin/mail-test").status_code == 403


def test_unpaused_manual_diagnostics_and_resend_remain_available(env, monkeypatch):
    admin = env.human("admin")
    template_id = _template(admin)
    event_id = _pending_outbox(env)
    emails, webhooks = [], []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: emails.append(args))
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: webhooks.append(args))
    assert admin.post("/api/v1/admin/mail-test").status_code == 200
    sent = admin.post(
        f"/api/v1/notification-template-sets/{template_id}/test-send",
        json=_test_send_body(),
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["receipt_confirmed"] is False
    connected = admin.post(f"/api/v1/integrations/{env.integration['id']}/test")
    assert connected.status_code == 200, connected.text
    assert connected.json()["execution_allowed"] is False
    resent = admin.post(f"/api/v1/deliveries/{event_id}/resend")
    assert resent.status_code == 200, resent.text
    assert resent.json()["state"] == "PENDING"
    assert len(emails) == 2 and len(webhooks) == 1
