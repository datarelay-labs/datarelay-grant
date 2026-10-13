"""G9/M5 truthful administration status over Grant-owned records only."""

from grant.db import audit

ENDPOINT = "/api/v1/admin/operational-readiness"


def test_admin_readiness_uses_recorded_state_without_external_acceptance(env):
    response = env.human("admin").get(ENDPOINT)
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary == {
        "schema_version": 1,
        "scope": "stored_grant_facts_only",
        "allows_execution": False,
        "audit_forwarding": {"state": "disabled"},
        "backup_recovery": {
            "registered_evidence": "unavailable",
            "restore_drill": "not_verified",
            "recovery_paused": False,
            "restore_authorized": False,
        },
        "retention": {"policy": "not_configured", "approval_record_deletion_enabled": False},
        "secret_lifecycle": {
            "rotation_policy": "not_configured",
            "active_integration_tokens": 1,
            "revoked_integration_tokens": 0,
            "material_exposed": False,
            "rotation_authorized": False,
        },
        "management_ingress": {
            "web_allowlist": "not_configured", "host_ssh_enforcement": "not_verified",
            "access_rule_change_authorized": False,
        },
    }
    assert env.human("requester").get(ENDPOINT).status_code == 403
    assert env.api.get(ENDPOINT).status_code == 403


def test_state_changes_follow_current_rows_but_do_not_grant_any_action(env):
    before = env.human("admin").get(ENDPOINT).json()
    assert before["secret_lifecycle"]["active_integration_tokens"] == 1
    with env.db.transaction() as conn:
        conn.execute("UPDATE api_tokens SET enabled=0 WHERE id=?", (env.token["id"],))
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")
        audit(conn, None, env.admin.id, "security.fixture", {"reason_code": "test"})
    result = env.human("admin").get(ENDPOINT)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["backup_recovery"]["recovery_paused"] is True
    assert body["secret_lifecycle"]["active_integration_tokens"] == 0
    assert body["secret_lifecycle"]["revoked_integration_tokens"] == 1
    assert body["audit_forwarding"] == {"state": "disabled"}
    assert body["allows_execution"] is False


def test_readiness_never_discloses_configuration_secrets_or_sends(env, monkeypatch):
    settings = env.settings
    object.__setattr__(settings, "smtp_user", "private-user-sentinel")
    object.__setattr__(settings, "smtp_password", "private-password-sentinel")
    sent = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: sent.append(args))
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: sent.append(args))
    admin = env.human("admin")  # login itself is audited; exclude that expected write.
    with env.db.transaction(write=False) as conn:
        previous_audit = conn.execute("SELECT count(*) FROM audit").fetchone()[0]
        previous_outbox = conn.execute("SELECT count(*) FROM outbox").fetchone()[0]
    data = admin.get(ENDPOINT)
    assert data.status_code == 200
    assert "private-password-sentinel" not in data.text
    assert "private-user-sentinel" not in data.text
    assert env.token["token"] not in data.text
    assert env.integration["id"] not in data.text
    assert sent == []
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM audit").fetchone()[0] == previous_audit
        assert conn.execute("SELECT count(*) FROM outbox").fetchone()[0] == previous_outbox


def test_admin_role_revocation_makes_same_session_read_unavailable(env):
    client = env.human("admin")
    assert client.get(ENDPOINT).status_code == 200
    with env.db.transaction() as conn:
        conn.execute("UPDATE users SET role='member' WHERE id=?", (env.admin.id,))
    assert client.get(ENDPOINT).status_code in (401, 403)


def test_invalid_recovery_pause_marker_is_unavailable_not_false(env):
    admin = env.human("admin")
    with env.db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='unknown' WHERE key='paused'")
    result = admin.get(ENDPOINT)
    assert result.status_code == 200
    assert result.json()["backup_recovery"]["recovery_paused"] is None
