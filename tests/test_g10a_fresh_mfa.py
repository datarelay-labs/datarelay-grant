"""G10A optional fresh Grant TOTP step-up, identity and replay semantics."""

import json
import re
import time

import pyotp

from grant.models import Profile


def create_high_policy(env, *, kind="service.fresh-mfa"):
    created = env.core.create_profile(
        env.admin,
        Profile(
            name="G10A fresh local TOTP step-up",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind=kind,
            verification_mode="EMAIL_PIN_PLUS_MFA",
        ),
    )
    env.core.transition_profile(env.admin, created["id"], "TESTING")
    return env.core.transition_profile(env.admin, created["id"], "ACTIVE")


def create_request(env, profile):
    resp = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=profile["id"],
            action={"kind": profile["action_kind"], "target": "demo", "parameters": {}},
        ),
    )
    assert resp.status_code == 202, resp.text
    return resp.json()


def email_proof(env, request):
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT payload FROM outbox WHERE request_id=? AND event_type='requested' "
            "AND sealed_payload=1 LIMIT 1",
            (request["id"],),
        ).fetchone()
    contents = env.settings.unseal(row["payload"])["body"]
    code = re.search("Four-digit confirmation PIN: ([0-9]{4})", contents)
    link = re.search(r"Approve: https?://[^\s/]+/api/v1/decision-intents/([^\s]+)", contents)
    assert code and link
    return code.group(1), link.group(1)


def context_from_email(env, link, code):
    verified = env.api.post(
        f"/api/v1/decision-intents/{link}/verify",
        json={"pin": code}, headers={"Origin": env.settings.origin},
    )
    assert verified.status_code == 200, verified.text
    return verified.json()["confirmation_token"]


def issue_authenticated_totp(env, user, *, registered_session=True):
    # Disposable test identity: session is already established as a human
    # before enrollment, matching first-party Grant's existing account flow.
    client = env.human(user) if registered_session else None
    secret = pyotp.random_base32()
    now = int(time.time() // 30)
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE users SET totp_secret=?,totp_last_step=? WHERE id=?",
            (env.settings.seal(secret), now - 2, env.users[user]["id"]),
        )
    return client, secret


def step_up(client, origin, link, context, code):
    return client.post(
        f"/api/v1/decision-intents/{link}/mfa/verify",
        headers={"Origin": origin},
        json={"confirmation_token": context, "code": code},
    )


def confirm(client, origin, link, context):
    return client.post(
        f"/api/v1/decision-intents/{link}/confirm",
        headers={"Origin": origin},
        json={"confirmation_token": context, "reason": ""},
    )


def test_fresh_totp_requires_current_assignee_login_and_new_code(env):
    profile = create_high_policy(env)
    client, secret = issue_authenticated_totp(env, "approver")
    request = create_request(env, profile)
    pin, link = email_proof(env, request)
    context = context_from_email(env, link, pin)

    # A possession-only decision never satisfies the fresh-MFA policy.
    no_login = confirm(env.api, env.settings.origin, link, context)
    assert no_login.status_code == 403
    assert no_login.json()["error"]["code"] == "FRESH_IDENTITY_MFA_REQUIRED"
    before = confirm(client, env.settings.origin, link, context)
    assert before.status_code == 403
    assert before.json()["error"]["code"] == "FRESH_IDENTITY_MFA_REQUIRED"
    another_person = env.human("stranger")
    wrong_person = step_up(
        another_person, env.settings.origin, link, context,
        pyotp.TOTP(secret).now(),
    )
    assert wrong_person.status_code == 403
    assert env.core.get(env.admin, request["id"])["state"] == "AWAITING"

    code = pyotp.TOTP(secret).now()
    good = step_up(client, env.settings.origin, link, context, code)
    assert good.status_code == 200, good.text
    assert good.json()["mfa"] is True
    assert good.json()["verified_person_id"] == env.users["approver"]["id"]
    assert good.json()["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_MFA"
    assert good.json()["execution_allowed"] is False
    assert confirm(env.api, env.settings.origin, link, context).status_code == 403
    assert confirm(another_person, env.settings.origin, link, context).status_code == 403
    completed = confirm(client, env.settings.origin, link, context)
    assert completed.status_code == 200, completed.text
    assert completed.json()["state"] == "APPROVED"
    assert completed.json()["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_MFA"
    assert completed.json()["verified_person_id"] == env.users["approver"]["id"]
    assert completed.json()["execution_allowed"] is False
    with env.db.transaction(write=False) as conn:
        stored = conn.execute(
            "SELECT decision_actor,execution_id FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()
        assert stored["decision_actor"] == env.users["approver"]["id"]
        assert stored["execution_id"] is None
        audit_row = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (request["id"],),
        ).fetchone()
        evidence = json.loads(audit_row["detail"])
        assert evidence["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_MFA"
        assert evidence["verified_person_id"] == env.users["approver"]["id"]
    audit_chain = env.human("admin").get(
        f"/api/v1/admin/audit/chain/{request['id']}"
    )
    assert audit_chain.status_code == 200, audit_chain.text
    payload = audit_chain.json()
    assert payload["identity_evidence_limit"] == "GRANT_ACCOUNT_FRESH_TOTP_VERIFIED"
    assert len(payload["fresh_identity_proofs"]) == 1
    proof = payload["fresh_identity_proofs"][0]
    assert proof["verified_grant_user_id"] == env.users["approver"]["id"]
    assert proof["proof_method"] == "GRANT_FRESH_TOTP"
    assert proof["decision_only"] is True
    assert "mfa_session_id" not in audit_chain.text
    assert "token_digest" not in audit_chain.text
    assert "totp_secret" not in audit_chain.text
    assert confirm(client, env.settings.origin, link, context).status_code in (404, 409)


def test_fresh_totp_code_is_one_use_and_sessions_can_be_revoked(env):
    profile = create_high_policy(env, kind="service.fresh-replay")
    client, secret = issue_authenticated_totp(env, "approver")
    first = create_request(env, profile)
    second = create_request(env, profile)
    pin1, link1 = email_proof(env, first)
    pin2, link2 = email_proof(env, second)
    context1 = context_from_email(env, link1, pin1)
    context2 = context_from_email(env, link2, pin2)
    code = pyotp.TOTP(secret).now()
    assert step_up(client, env.settings.origin, link1, context1, code).status_code == 200
    replay = step_up(client, env.settings.origin, link2, context2, code)
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "INVALID_MFA_CODE"
    # Even the first successful independent verification loses authority
    # when that exact authenticated session is revoked before final POST.
    principal = env.auth.session(client.cookies["grant_session"])
    with env.db.transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))
    blocked = confirm(client, env.settings.origin, link1, context1)
    assert blocked.status_code in (401, 403)
    assert env.core.get(env.admin, first["id"])["state"] == "AWAITING"


def test_fresh_mfa_needs_enrolled_totp_and_blocks_recovery_only_email(env):
    profile = create_high_policy(env, kind="service.no-totp")
    original_client = env.human("approver")
    request = create_request(env, profile)
    pin, link = email_proof(env, request)
    context = context_from_email(env, link, pin)
    unavailable = step_up(original_client, env.settings.origin, link, context, "123456")
    assert unavailable.status_code == 403
    assert unavailable.json()["error"]["code"] == "FRESH_IDENTITY_MFA_UNAVAILABLE"
    assert confirm(original_client, env.settings.origin, link, context).status_code == 403



def test_fresh_mfa_bad_totp_attempts_are_rate_limited_and_audited(env):
    profile = create_high_policy(env, kind="service.mfa-rate-limit")
    client, secret = issue_authenticated_totp(env, "approver")
    request = create_request(env, profile)
    pin, link = email_proof(env, request)
    context = context_from_email(env, link, pin)
    correct = pyotp.TOTP(secret).now()
    for i in range(5):
        bad = f"{i:06d}"
        if bad == correct:
            bad = "999999"
        result = step_up(client, env.settings.origin, link, context, bad)
        assert result.status_code == 401, result.text
        assert result.json()["error"]["code"] == "INVALID_MFA_CODE"
    blocked = step_up(client, env.settings.origin, link, context, correct)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "FRESH_MFA_RATE_LIMITED"
    assert confirm(client, env.settings.origin, link, context).status_code == 403
    with env.db.transaction(write=False) as conn:
        failure_events = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? "
            "AND action='decision.mfa_failed'",
            (request["id"],),
        ).fetchall()
        assert len(failure_events) == 5
        assert all("123456" not in evt["detail"] for evt in failure_events)


def test_v11_to_v12_migration_does_not_implicitly_verify_old_context(env):
    from grant.db import Database

    profile = create_high_policy(env, kind="service.mfa-upgrade")
    request = create_request(env, profile)
    pin, token = email_proof(env, request)
    context = context_from_email(env, token, pin)
    with env.db.transaction() as conn:
        # Simulate re-entering a v11 schema upgrade with newer columns
        # already present, as may happen after interrupted upgrades.
        conn.execute("PRAGMA user_version=11")
    Database(env.settings.database)
    with env.db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        proof = conn.execute(
            "SELECT mfa_verified_at,verified_user_id,mfa_session_id "
            "FROM decision_confirmations"
        ).fetchone()
        assert proof["mfa_verified_at"] is None
        assert proof["verified_user_id"] is None
        assert proof["mfa_session_id"] is None
    denied = confirm(env.api, env.settings.origin, token, context)
    assert denied.status_code == 403
    assert env.core.get(env.admin, request["id"])["state"] == "AWAITING"


def test_original_delegate_fresh_totp_compete_for_exactly_one_seat(env):
    from concurrent.futures import ThreadPoolExecutor

    from grant.auth import Principal
    from grant.models import Delegation

    original_client, original_secret = issue_authenticated_totp(env, "approver")
    delegate_client, delegate_secret = issue_authenticated_totp(env, "stranger")
    now = time.time()
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1, ends_at=now + 3600,
        ),
    )
    profile = create_high_policy(env, kind="service.mfa-delegate-race")
    req = create_request(env, profile)
    with env.db.transaction(write=False) as conn:
        envelopes = conn.execute(
            "SELECT recipient_id,payload FROM outbox WHERE request_id=? "
            "AND event_type='requested' AND sealed_payload=1",
            (req["id"],),
        ).fetchall()
    assert len(envelopes) == 2
    contexts = []
    for who, session, secret in (
        ("approver", original_client, original_secret),
        ("stranger", delegate_client, delegate_secret),
    ):
        issued = next(
            row for row in envelopes if row["recipient_id"] == env.users[who]["id"]
        )
        email = env.settings.unseal(issued["payload"])["body"]
        pin = re.search(r"Four-digit confirmation PIN: (\d{4})", email).group(1)
        link = re.search(
            r"Approve: https?://[^\s/]+/api/v1/decision-intents/([^\s]+)", email,
        ).group(1)
        context = context_from_email(env, link, pin)
        result = step_up(
            session, env.settings.origin, link, context,
            pyotp.TOTP(secret).now(),
        )
        assert result.status_code == 200, result.text
        contexts.append((who, session, link, context))
    # Each has independent fresh MFA proof but the two mailboxes represent
    # ONE original approval seat. No executor action occurs in this test.
    def finish(entry):
        _who, session, link, context = entry
        return confirm(session, env.settings.origin, link, context)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(finish, contexts))
    assert sum(r.status_code == 200 for r in results) == 1, [
        (r.status_code, r.text) for r in results
    ]
    assert any(r.status_code in (404, 409) for r in results)
    successful = next(r.json() for r in results if r.status_code == 200)
    assert successful["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_MFA"
    assert successful["verified_person_id"] in (
        env.users["approver"]["id"], env.users["stranger"]["id"],
    )
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?",
            (req["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT execution_id FROM requests WHERE id=?", (req["id"],),
        ).fetchone()[0] is None
