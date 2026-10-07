import pyotp
import pytest
from fastapi.testclient import TestClient

from grant.errors import GrantError
from grant.models import Integration, Profile


def test_wrong_user_admin_and_machine_cannot_decide(env):
    row = env.api.post("/api/v1/requests", json=env.intake()).json()
    path = f"/api/v1/requests/{row['id']}"
    body = {"decision": "APPROVED", "expected_revision": 1}
    assert env.human("admin").post(path + "/decision", json=body).status_code == 403
    assert env.human("stranger").get(path).status_code == 404
    assert env.api.post(path + "/decision", json=body).status_code == 403
    assert env.api.get(path + "/decision").status_code == 404
    assert env.api.get(path).json()["state"] == "AWAITING"


def test_human_self_approval_and_csrf(env):
    assert env.human("approver").post("/api/v1/requests", json=env.intake()).status_code == 403
    client = env.human("requester")
    client.headers.pop("x-csrf-token")
    assert client.post("/api/v1/requests", json=env.intake()).status_code == 403
    client = env.human("requester")
    assert (
        client.post(
            "/api/v1/requests", json=env.intake(), headers={"origin": "https://unrelated.invalid"}
        ).status_code
        == 403
    )
    assert client.get("/api/v1/admin/users").status_code == 403


def test_bearer_scope_and_cross_integration_isolation(env):
    limited = env.auth.issue_token(env.admin, env.integration["id"], ["request:create"])
    api = TestClient(env.app, headers={"authorization": "Bearer " + limited["token"]})
    assert api.get("/api/v1/requests").status_code == 403
    other = env.core.create_integration(
        env.admin,
        Integration(name="Other", kind="datarelay", callback_url=env.settings.callback_urls[0]),
    )
    other_token = env.auth.issue_token(env.admin, other["id"], ["request:create", "request:read"])
    alien = TestClient(env.app, headers={"authorization": "Bearer " + other_token["token"]})
    row = env.api.post("/api/v1/requests", json=env.intake()).json()
    assert alien.get(f"/api/v1/requests/{row['id']}").status_code == 404
    assert alien.post("/api/v1/requests", json=env.intake()).status_code == 404
    assert alien.get("/api/v1/requests").json() == []
    api.close()
    alien.close()


@pytest.mark.parametrize(
    "extra", [{"approver_id": "stranger"}, {"callback_url": "https://unrelated.invalid"}]
)
def test_request_cannot_override_policy_or_destination(env, extra):
    assert env.api.post("/api/v1/requests", json=env.intake(**extra)).status_code == 422


def test_secrets_and_noncanonical_parameters_rejected(env):
    for params in (
        {"password": "sensitive"},
        {"nested": {"api_key": "sensitive"}},
        {"float": 0.1},
        {"huge": 2**54},
    ):
        body = env.intake(
            action={"kind": "service.restart", "target": "test", "parameters": params}
        )
        assert env.api.post("/api/v1/requests", json=body).status_code == 422


def test_stellar_tenant_and_loop_prevention(env):
    i = env.core.create_integration(
        env.admin,
        Integration(
            name="Stellar",
            kind="stellar",
            tenant="tenant-1",
            callback_url=env.settings.callback_urls[0],
        ),
    )
    p = env.core.create_profile(
        env.admin,
        Profile(
            name="Stellar",
            integration_id=i["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="service.restart",
        ),
    )
    t = env.auth.issue_token(env.admin, i["id"], ["request:create"])
    api = TestClient(env.app, headers={"authorization": "Bearer " + t["token"]})
    assert (
        api.post(
            "/api/v1/requests", json=env.intake(profile_id=p["id"], source={"tenant_id": "wrong"})
        ).status_code
        == 403
    )
    assert (
        api.post(
            "/api/v1/requests",
            json=env.intake(
                profile_id=p["id"],
                source={"tenant_id": "tenant-1", "event_type": "grant.approval.outcome"},
            ),
        ).status_code
        == 422
    )
    assert (
        api.post(
            "/api/v1/requests",
            json=env.intake(profile_id=p["id"], source={"tenant_id": "tenant-1", "case_id": "c-1"}),
        ).status_code
        == 202
    )
    api.close()


def test_password_change_revokes_sessions_and_errors_do_not_echo_secret(env):
    client = env.human("requester")
    second = env.human("requester")
    bad = client.post(
        "/api/v1/auth/password", json={"current_password": env.password, "new_password": "short"}
    )
    assert bad.status_code == 422 and env.password not in bad.text and "short" not in bad.text
    changed = client.post(
        "/api/v1/auth/password",
        json={"current_password": env.password, "new_password": "a-new-test-password-123"},
    )
    assert changed.status_code == 200
    assert second.get("/api/v1/auth/session").status_code == 401


def test_mfa_pending_session_requires_second_factor_and_recovery_is_one_use(env):
    client = env.human("requester")
    material = client.post("/api/v1/auth/mfa/enroll").json()
    assert "secret" in material
    codes = client.post(
        "/api/v1/auth/mfa/confirm", json={"code": pyotp.TOTP(material["secret"]).now()}
    )
    assert codes.status_code == 200, codes.text
    code = codes.json()["recovery_codes"][0]
    challenge = env.human("requester")
    assert challenge.get("/api/v1/auth/session").json()["state"] == "mfa_required"
    assert challenge.get("/api/v1/requests").status_code == 401
    assert (
        challenge.post("/api/v1/auth/mfa/verify", json={"code": code, "recovery": True}).status_code
        == 200
    )
    assert challenge.get("/api/v1/requests").status_code == 200
    another = env.human("requester")
    assert (
        another.post("/api/v1/auth/mfa/verify", json={"code": code, "recovery": True}).status_code
        == 401
    )


def test_http_boundaries_and_sensitive_config_projection(env):
    client = TestClient(env.app)
    assert client.get("/api/v1/requests").status_code == 401
    assert client.get("/api/v1/requests", headers={"host": "wrong.invalid"}).status_code == 400
    assert (
        client.post(
            "/api/v1/auth/login",
            content='{"username":"a","username":"b"}',
            headers={"content-type": "application/json"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/requests", content="x" * 70000, headers={"content-type": "application/json"}
        ).status_code
        == 413
    )
    response = env.human("admin").get("/api/v1/integrations")
    assert "destination" not in response.text and "callback_headers" not in response.text
    assert response.headers["cache-control"] == "no-store"
    client.close()


def test_account_management_enforces_admin_and_invalidates_sessions(env):
    member = env.human("requester")
    admin = env.human("admin")
    body = {
        "username": "new-user",
        "email": "new@example.invalid",
        "password": "isolated-test-password-42",
    }
    assert member.post("/api/v1/admin/users", json=body).status_code == 403
    assert admin.post("/api/v1/admin/users", json={**body, "email": "a@b,b@c"}).status_code == 422
    assert admin.post("/api/v1/admin/users", json={**body, "username": " "}).status_code == 422
    assert admin.post("/api/v1/admin/users", json=body).status_code == 201
    assert admin.post(f"/api/v1/admin/users/{env.users['admin']['id']}/disable").status_code == 409
    assert (
        admin.post(f"/api/v1/admin/users/{env.users['requester']['id']}/disable").status_code == 200
    )
    assert member.get("/api/v1/auth/session").status_code == 401


def test_mfa_enabled_during_login_cannot_create_password_only_session(env, monkeypatch):
    import grant.auth as module

    original = module.verify_password

    def concurrent_enrollment(encoded, password):
        ok = original(encoded, password)
        with env.db.transaction() as conn:
            conn.execute(
                "UPDATE users SET totp_secret=? WHERE id=?",
                (env.settings.seal(pyotp.random_base32()), env.users["requester"]["id"]),
            )
        return ok

    monkeypatch.setattr(module, "verify_password", concurrent_enrollment)
    client = env.human("requester")
    assert client.get("/api/v1/auth/session").json()["state"] == "mfa_required"
    assert client.get("/api/v1/requests").status_code == 401


def test_login_limiter_does_not_treat_the_reverse_proxy_as_user_identity(env, monkeypatch):
    calls = []

    def rate(key, limit=120, seconds=60):
        calls.append((key, limit, seconds))

    monkeypatch.setattr(env.auth, "rate", rate)
    with pytest.raises(GrantError, match="INVALID_CREDENTIALS"):
        env.auth.login("missing-user", "wrong-password", "127.0.0.1")

    assert calls == [
        ("login-installation", 120, 60),
        ("login-user:missing-user", 15, 300),
    ]


def test_ended_session_cannot_change_password_or_complete_mfa_enrollment(env):
    browser = env.human("stranger")
    principal = env.auth.session(browser.cookies["grant_session"])
    material = env.auth.enroll(principal)
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))

    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.auth.change_password(principal, env.password, "new-isolated-password-42")
    with pytest.raises(GrantError, match="AUTHENTICATION_REQUIRED"):
        env.auth.confirm_enrollment(principal, pyotp.TOTP(material["secret"]).now())
