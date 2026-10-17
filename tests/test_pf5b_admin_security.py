"""PF-5B shared Administration never extends Grant identity or SMTP privileges."""

import json

from grant.auth import Principal


def test_admin_mail_test_is_own_mailbox_only_and_never_authorizes(env, monkeypatch):
    sent = []

    def record(settings, destination, payload, event_id):
        sent.append((destination, json.loads(payload), event_id))

    monkeypatch.setattr("grant.transport.send_email", record)
    member = env.human("approver")
    for endpoint in ("/api/v1/admin/users", "/api/v1/admin/health", "/api/v1/admin/info"):
        assert member.get(endpoint).status_code == 403
    forbidden = member.post("/api/v1/admin/mail-test")
    assert forbidden.status_code == 403
    assert env.api.post("/api/v1/admin/mail-test").status_code == 403
    assert not sent

    admin = env.human("admin")
    # This body must never override the authenticated administrator's mailbox.
    success = admin.post("/api/v1/admin/mail-test", json={"email": "third-party@example.invalid"})
    assert success.status_code == 200, success.text
    assert success.json()["smtp_accepted"] is True
    assert len(sent) == 1
    assert sent[0][0] == {"email": env.users["admin"]["email"]}
    assert "approve or execute" in sent[0][1]["body"]
    assert not env.core.list_requests(env.admin)

    with env.db.transaction(write=False) as conn:
        latest = conn.execute(
            "SELECT detail FROM audit WHERE action='email.test_accepted' ORDER BY at DESC LIMIT 1"
        ).fetchone()
        assert latest is not None
        assert "password" not in latest["detail"].lower()


def test_revoked_admin_session_cannot_send_after_user_lookup(env, monkeypatch):
    admin = env.human("admin")
    sent = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: sent.append(args))
    original_lookup = env.auth.user

    def revoke_between_lookup_and_transport(principal: Principal):
        current = original_lookup(principal)
        with env.db.transaction() as conn:
            conn.execute(
                "UPDATE users SET role='member' WHERE id=?",
                (principal.id,),
            )
        return current

    monkeypatch.setattr(env.auth, "user", revoke_between_lookup_and_transport)
    response = admin.post("/api/v1/admin/mail-test")
    assert response.status_code in (401, 403), response.text
    assert sent == []


def test_administration_status_never_exposes_smtp_configuration(env):
    # Tests the public projection with nonproduction sentinel values.
    settings = env.app.state.settings
    object.__setattr__(settings, "smtp_host", "smtp-sentinel.example.invalid")
    object.__setattr__(settings, "smtp_user", "smtp-user-sentinel")
    object.__setattr__(settings, "smtp_password", "smtp-password-sentinel")
    admin = env.human("admin")
    for endpoint in ("/api/v1/admin/health", "/api/v1/admin/info", "/api/v1/admin/users"):
        response = admin.get(endpoint)
        assert response.status_code == 200, response.text
        serialized = response.text
        assert "smtp-sentinel" not in serialized
        assert "smtp-user-sentinel" not in serialized
        assert "smtp-password-sentinel" not in serialized
    health = admin.get("/api/v1/admin/health").json()
    assert any(check["id"] == "mail" for check in health["checks"])
