import json

from grant.core import fingerprint
from grant.mail_templates import NOTIFICATION_EVENTS


def template_set_payload(**overrides):
    templates = {
        event: {
            "subject": f"[Grant {event}] {{{{request_title}}}}",
            "body": f"Event {event} for {{{{external_id}}}}\n{{{{request_url}}}}\nDecision={{{{decision_state}}}}\nExecution={{{{execution_state}}}}",
        }
        for event in NOTIFICATION_EVENTS
    }
    return {
        "name": "Operations notifications",
        "templates": templates,
        **overrides,
    }


def policy_payload(env, template_id, **overrides):
    return {
        "name": "Notification policy",
        "integration_id": env.integration["id"],
        "approver_id": env.users["approver"]["id"],
        "action_kind": "service.notify",
        "email_template_id": template_id,
        "deadline_seconds": 86400,
        "reminder_seconds": 3600,
        "max_reminders": 3,
        "grant_seconds": 900,
        "tenant_selector": "",
        "environment": "",
        "severity": "",
        "risk_level": "",
        **overrides,
    }


def request_payload(policy_id, external_id="notify-1"):
    return {
        "external_id": external_id,
        "profile_id": policy_id,
        "title": "Notify service",
        "action": {
            "kind": "service.notify",
            "target": "test-service",
            "parameters": {"reason_code": 9},
        },
        "source": {"environment": "prod"},
        "reason": "notification test",
    }


def activate(admin, policy_id):
    assert admin.post(f"/api/v1/profiles/{policy_id}/test").status_code == 200
    response = admin.post(f"/api/v1/profiles/{policy_id}/activate")
    assert response.status_code == 200, response.text


def test_template_set_safe_variables_preview_snapshot_and_event_delivery(env):
    admin = env.human("admin")
    created = admin.post("/api/v1/notification-template-sets", json=template_set_payload())
    assert created.status_code == 201, created.text
    template_set = created.json()
    assert set(template_set["templates"]) == set(NOTIFICATION_EVENTS)

    unsafe = template_set_payload()
    unsafe["templates"]["requested"]["body"] = "secret={{secret}}"
    rejected = admin.post("/api/v1/notification-template-sets", json=unsafe)
    assert rejected.status_code == 422

    variables = admin.get("/api/v1/notification-variables")
    assert variables.status_code == 200
    assert "decision_state" in variables.json()["variables"]
    assert "execution_state" in variables.json()["variables"]
    assert "secret" not in variables.json()["variables"]

    branding = admin.put(
        "/api/v1/notification-branding",
        json={"brand_name": "Grant Operations", "sender_display_name": "Grant Approvals"},
    )
    assert branding.status_code == 200, branding.text
    unsafe_branding = admin.put(
        "/api/v1/notification-branding",
        json={"brand_name": "Grant", "sender_display_name": "Grant\r\nBcc: bad@example.invalid"},
    )
    assert unsafe_branding.status_code == 422

    policy = admin.post(
        "/api/v1/profiles", json=policy_payload(env, template_set["id"])
    ).json()
    activate(admin, policy["id"])

    created_request = env.api.post(
        "/api/v1/requests", json=request_payload(policy["id"])
    )
    assert created_request.status_code == 202, created_request.text
    row = created_request.json()

    with env.db.transaction(write=False) as conn:
        requested = conn.execute(
            "SELECT event_type,payload FROM outbox WHERE request_id=? AND kind='email' ORDER BY created_at,id LIMIT 1",
            (row["id"],),
        ).fetchone()
    assert requested["event_type"] == "requested"
    requested_payload = env.settings.unseal(requested["payload"])
    assert requested_payload["subject"] == "[Grant requested] Notify service"
    assert requested_payload["brand_name"] == "Grant Operations"
    assert requested_payload["sender_display_name"] == "Grant Approvals"

    changed_branding = admin.put(
        "/api/v1/notification-branding",
        json={"brand_name": "Changed Later", "sender_display_name": "Changed Sender"},
    )
    assert changed_branding.status_code == 200, changed_branding.text

    updated = template_set_payload()
    updated["templates"]["approved"] = {
        "subject": "CHANGED {{request_title}}",
        "body": "CHANGED {{external_id}}",
    }
    update = admin.put(
        f"/api/v1/notification-template-sets/{template_set["id"]}",
        json={**updated, "enabled": True},
    )
    assert update.status_code == 200, update.text

    approver = env.human("approver")
    approved = approver.post(
        f"/api/v1/requests/{row["id"]}/decision",
        json={"decision": "APPROVED", "expected_revision": row["revision"], "reason": "ok"},
    )
    assert approved.status_code == 200, approved.text
    with env.db.transaction(write=False) as conn:
        decision_mail = conn.execute(
            "SELECT payload FROM outbox WHERE request_id=? AND kind='email' AND event_type='approved' ORDER BY created_at,id DESC LIMIT 1",
            (row["id"],),
        ).fetchone()
    assert decision_mail is not None
    decision_payload = json.loads(decision_mail["payload"])
    assert decision_payload["subject"] == "[Grant approved] Notify service"
    assert decision_payload["brand_name"] == "Grant Operations"
    assert decision_payload["sender_display_name"] == "Grant Approvals"

    action_hash = fingerprint(request_payload(policy["id"])["action"])
    claimed = env.api.post(
        f"/api/v1/requests/{row["id"]}/consume",
        json={"execution_id": "notify-exec-1", "action_hash": action_hash},
    )
    assert claimed.status_code == 200, claimed.text

    result = env.api.post(
        f"/api/v1/requests/{row["id"]}/result",
        json={
            "execution_id": "notify-exec-1",
            "action_hash": action_hash,
            "status": "REPORTED_SUCCEEDED",
            "evidence": "done",
        },
    )
    assert result.status_code == 200, result.text
    with env.db.transaction(write=False) as conn:
        execution_mail = conn.execute(
            "SELECT payload FROM outbox WHERE request_id=? AND kind='email' AND event_type='execution_succeeded' ORDER BY created_at,id DESC LIMIT 1",
            (row["id"],),
        ).fetchone()
    assert execution_mail is not None
    assert json.loads(execution_mail["payload"])["subject"] == "[Grant execution_succeeded] Notify service"

    preview = admin.post(
        f"/api/v1/notification-template-sets/{template_set["id"]}/preview",
        json={
            "event": "requested",
            "sample": {
                "request_title": "Notify service",
                "request_url": "http://testserver/requests/sample",
                "external_id": "notify-preview",
                "action_kind": "service.notify",
                "target": "test-service",
                "reason": "notification test",
                "deadline": "2030-01-01T00:00:00+00:00",
                "decision_state": "AWAITING",
                "execution_state": "NOT_STARTED",
            },
        },
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["event"] == "requested"
    assert preview.json()["rendered"]["subject"] == "[Grant requested] Notify service"

    health = admin.get("/api/v1/notification-deliveries")
    assert health.status_code == 200, health.text
    assert any(
        item["request_id"] == row["id"] and item["event_type"] == "execution_succeeded"
        for item in health.json()["deliveries"]
    )


def test_notification_test_send_is_non_authorizing_and_receipt_is_not_claimed(env, monkeypatch):
    admin = env.human("admin")
    template_set = admin.post(
        "/api/v1/notification-template-sets", json=template_set_payload()
    ).json()
    sent = {}

    def fake_send(settings, destination, payload, event_id):
        sent.update(
            {
                "destination": destination,
                "payload": json.loads(payload),
                "event_id": event_id,
            }
        )

    monkeypatch.setattr("grant.transport.send_email", fake_send)

    response = admin.post(
        f"/api/v1/notification-template-sets/{template_set["id"]}/test-send",
        json={
            "event": "requested",
            "sample": {
                "request_title": "Test only",
                "request_url": "http://testserver/requests/test",
                "external_id": "test-send",
                "action_kind": "service.notify",
                "target": "test-service",
                "reason": "test",
                "deadline": "2030-01-01T00:00:00+00:00",
                "decision_state": "AWAITING",
                "execution_state": "NOT_STARTED",
            },
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["transport_accepted"] is True
    assert body["receipt_confirmed"] is False
    assert body["execution_allowed"] is False
    assert sent["destination"]["email"] == env.users["admin"]["email"]


def test_notification_test_send_revalidates_authority_before_transport(env, monkeypatch):
    admin = env.human("admin")
    template_set = admin.post(
        "/api/v1/notification-template-sets", json=template_set_payload()
    ).json()
    sent = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: sent.append(args))

    from grant.core import render_from_context as real_render

    def revoke_after_render(*args, **kwargs):
        rendered = real_render(*args, **kwargs)
        with env.db.transaction() as conn:
            conn.execute("UPDATE users SET enabled=0 WHERE id=?", (env.users["admin"]["id"],))
        return rendered

    monkeypatch.setattr("grant.core.render_from_context", revoke_after_render)
    response = admin.post(
        f"/api/v1/notification-template-sets/{template_set['id']}/test-send",
        json={
            "event": "requested",
            "sample": {
                "request_title": "Revoked", "request_url": "http://testserver/requests/test",
                "external_id": "revoked-send", "action_kind": "service.notify",
                "target": "test-service", "reason": "test",
                "deadline": "2030-01-01T00:00:00+00:00",
                "decision_state": "AWAITING", "execution_state": "NOT_STARTED"
            },
        },
    )
    assert response.status_code in (401, 403)
    assert sent == []


def test_notification_test_send_rejects_non_allowlisted_recipient_before_smtp(env, monkeypatch):
    admin = env.human("admin")
    template_set = admin.post(
        "/api/v1/notification-template-sets", json=template_set_payload()
    ).json()
    outgoing = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: outgoing.append(args))
    attempted = admin.post(
        f"/api/v1/notification-template-sets/{template_set['id']}/test-send",
        json={
            "event": "requested",
            "sample": {
                "request_title": "Restricted test",
                "request_url": "http://testserver/requests/test",
                "external_id": "restricted",
                "action_kind": "service.notify",
                "target": "test",
                "reason": "must not deliver",
                "deadline": "2030-01-01T00:00:00+00:00",
                "decision_state": "AWAITING",
                "execution_state": "NOT_STARTED",
            },
            "recipient_user_id": env.users["stranger"]["id"],
        },
    )
    assert attempted.status_code == 403, attempted.text
    assert attempted.json()["error"]["code"] == "TEST_RECIPIENT_NOT_ALLOWED"
    assert outgoing == []


def test_failed_email_delivery_and_expired_deadline_are_projected_separately(env):
    import time

    result = env.human("requester").post(
        "/api/v1/requests", json=env.intake(title="Expired email-failure request")
    )
    assert result.status_code == 202, result.text
    item = result.json()
    with env.db.transaction() as conn:
        email = conn.execute(
            "SELECT id FROM outbox WHERE request_id=? AND kind='email' LIMIT 1",
            (item["id"],),
        ).fetchone()
        assert email is not None
        conn.execute(
            "UPDATE outbox SET state='FAILED',last_error='isolated transport failure' WHERE id=?",
            (email["id"],),
        )
        conn.execute(
            "UPDATE requests SET deadline=? WHERE id=?",
            (time.time()-10, item["id"]),
        )

    listed = env.human("approver").get("/api/v1/requests")
    assert listed.status_code == 200, listed.text
    current = next(value for value in listed.json() if value["id"] == item["id"])
    assert current["state"] == "EXPIRED"
    assert current["deadline"] < time.time()
    assert current["delivery_state"] != "FAILED"  # callback and SMTP are distinct
    assert current["notification_failure_count"] >= 1
