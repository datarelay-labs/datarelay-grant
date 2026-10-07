import pytest

from grant.auth import Principal
from grant.errors import GrantError
from grant.models import Consume, Decision, Intake, Integration, Profile


def test_token_metadata_and_idempotent_revoke_are_admin_only(env):
    admin = env.human("admin")
    member = env.human("requester")
    path = "/api/v1/integrations/" + env.integration["id"] + "/tokens"
    assert member.get(path).status_code == 403
    assert env.api.get(path).status_code == 403
    response = admin.get(path)
    assert response.status_code == 200
    assert env.token["token"] not in response.text
    assert "token_hash" not in response.text
    token = response.json()[0]
    endpoint = "/api/v1/integrations/tokens/" + token["id"] + "/revoke"
    assert member.post(endpoint).status_code == 403
    assert admin.post(endpoint).status_code == 200
    assert admin.post(endpoint).status_code == 200
    assert env.api.get("/api/v1/requests").status_code == 401
    with env.db.transaction(write=False) as conn:
        assert (
            conn.execute(
                "SELECT count(*) FROM audit WHERE action='integration.token_revoked'"
            ).fetchone()[0]
            == 1
        )


def test_revoked_token_cannot_use_already_authenticated_principal(env):
    principal = env.auth.api_token(env.token["token"])
    row = env.core.create_request(principal, Intake(**env.intake()))
    approver = Principal(env.users["approver"]["id"], "human", "member")
    env.core.decide(approver, row["id"], Decision(decision="APPROVED", expected_revision=1))
    env.auth.revoke_token(env.admin, principal.id)
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.consume(
            principal,
            row["id"],
            Consume(execution_id="not-committed", action_hash=row["action_hash"]),
        )
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.create_request(principal, Intake(**env.intake()))
    assert env.core.get(env.admin, row["id"])["execution_id"] is None


def test_disabled_approver_cannot_commit_a_previously_authenticated_decision(env):
    row = env.api.post("/api/v1/requests", json=env.intake()).json()
    approver = Principal(env.users["approver"]["id"], "human", "member")
    with env.db.transaction() as conn:
        conn.execute("UPDATE users SET enabled=0 WHERE id=?", (approver.id,))
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.decide(approver, row["id"], Decision(decision="APPROVED", expected_revision=1))
    assert env.core.get(env.admin, row["id"])["state"] == "AWAITING"


def test_ended_browser_session_cannot_commit_using_stale_principal(env):
    row = env.api.post("/api/v1/requests", json=env.intake()).json()
    browser = env.human("approver")
    principal = env.auth.session(browser.cookies["grant_session"])
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.decide(principal, row["id"], Decision(decision="APPROVED", expected_revision=1))


def test_ended_admin_session_cannot_issue_a_new_integration_token(env):
    browser = env.human("admin")
    principal = env.auth.session(browser.cookies["grant_session"])
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))

    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.auth.issue_token(principal, env.integration["id"], ["grant:consume"])

    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM api_tokens").fetchone()[0] == 1


def test_ended_admin_session_cannot_mutate_durable_admin_configuration(env):
    browser = env.human("admin")
    principal = env.auth.session(browser.cookies["grant_session"])
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))

    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.auth.create_user(
            "stale-admin-created",
            "stale-admin-created@example.invalid",
            "isolated-test-password-42",
            actor=principal,
        )
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.create_integration(
            principal,
            Integration(
                name="stale-admin-integration",
                kind="datarelay",
                callback_url=env.settings.callback_urls[0],
            ),
        )
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.core.create_profile(
            principal,
            Profile(
                name="stale-admin-profile",
                integration_id=env.integration["id"],
                approver_id=env.users["approver"]["id"],
                action_kind="service.restart",
            ),
        )
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.auth.revoke_token(principal, env.token["id"])

    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT count(*) FROM users WHERE username='stale-admin-created'"
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT count(*) FROM integrations WHERE name='stale-admin-integration'"
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT count(*) FROM profiles WHERE name='stale-admin-profile'"
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT enabled FROM api_tokens WHERE id=?", (env.token["id"],)
        ).fetchone()[0] == 1
