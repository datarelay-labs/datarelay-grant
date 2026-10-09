"""Loginless scoped email approvals must ignore ambient product-session cookies.

A Grant sign-in session is never necessary for EMAIL_PIN or same-mailbox OTP.
A mandatory independent MFA policy alone must demand a current signed-in
and freshly step-up-verified eligible account/session.
"""

import json
import re
import time

import pytest

from grant.models import Profile


def _active_profile(env, mode: str) -> dict:
    kind = "service.loginless-" + mode.lower()
    created = env.core.create_profile(
        env.admin, Profile(
            name="Loginless cookie regression: " + mode,
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind=kind,
            verification_mode=mode,
        ),
    )
    env.core.transition_profile(env.admin, created["id"], "TESTING")
    profile = env.core.transition_profile(env.admin, created["id"], "ACTIVE")
    return profile


def _request(env, profile: dict | None = None) -> tuple[str, str, str]:
    body = env.intake()
    if profile:
        body["profile_id"] = profile["id"]
        body["action"] = {
            "kind": profile["action_kind"], "target": "test-only", "parameters": {},
        }
    created = env.human("requester").post("/api/v1/requests", json=body)
    assert created.status_code == 202, created.text
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            """SELECT payload FROM outbox WHERE request_id=? AND event_type='requested'
               AND sealed_payload=1 ORDER BY created_at,id LIMIT 1""",
            (created.json()["id"],),
        ).fetchone()
    assert row
    message = env.settings.unseal(row["payload"])["body"]
    pin = re.search(r"Four-digit confirmation PIN: ([0-9]{4})", message)
    link = re.search(r"Approve: https?://[^\s/]+/api/v1/decision-intents/([^\s]+)", message)
    assert pin and link
    verified = env.api.post(
        f"/api/v1/decision-intents/{link.group(1)}/verify",
        headers={"Origin": env.settings.origin},
        json={"pin": pin.group(1)},
    )
    assert verified.status_code == 200, verified.text
    return created.json()["id"], link.group(1), verified.json()["confirmation_token"]


def _stale_cookie(env, *, revoke: bool):
    # The browser has an unrelated previously legitimate account cookie and
    # its old CSRF header. It is unrelated to the email mailbox recipient.
    client = env.human("stranger")
    principal = env.auth.session(client.cookies["grant_session"])
    with env.db.transaction() as conn:
        if revoke:
            conn.execute("DELETE FROM sessions WHERE id=?", (principal.session_id,))
        else:
            conn.execute(
                "UPDATE sessions SET expires_at=? WHERE id=?",
                (time.time() - 1, principal.session_id),
            )
    return client


def _confirm(env, client, token: str, context: str):
    return client.post(
        f"/api/v1/decision-intents/{token}/confirm",
        headers={"Origin": env.settings.origin},
        json={"confirmation_token": context, "reason": ""},
    )


@pytest.mark.parametrize("revoke", (False, True), ids=("expired-session", "revoked-session"))
def test_default_pin_remains_loginless_even_with_unrelated_stale_cookie(env, revoke):
    ident, token, context = _request(env)
    result = _confirm(env, _stale_cookie(env, revoke=revoke), token, context)
    assert result.status_code == 200, result.text
    assert result.json()["state"] == "APPROVED"
    assert result.json()["actor_assurance"] == "EMAIL_LINK_PIN"
    assert result.json()["verified_person_id"] is None
    assert result.json()["execution_allowed"] is False
    with env.db.transaction(write=False) as conn:
        decided = conn.execute(
            "SELECT execution_id,decision_actor FROM requests WHERE id=?", (ident,),
        ).fetchone()
        assert decided["execution_id"] is None
        assert decided["decision_actor"] is None
        evidence = json.loads(conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (ident,),
        ).fetchone()["detail"])
        assert evidence["actor_assurance"] == "EMAIL_LINK_PIN"
        assert evidence["verified_person_id"] is None
        assert evidence["mailbox_recipient_id"] == env.users["approver"]["id"]


@pytest.mark.parametrize("revoke", (False, True), ids=("expired-session", "revoked-session"))
def test_same_mailbox_otp_remains_loginless_with_unrelated_stale_cookie(env, revoke):
    profile = _active_profile(env, "EMAIL_PIN_PLUS_OTP")
    ident, token, context = _request(env, profile)
    queued = env.api.post(
        f"/api/v1/decision-intents/{token}/otp/request",
        headers={"Origin": env.settings.origin},
        json={"confirmation_token": context},
    )
    assert queued.status_code == 202, queued.text
    with env.db.transaction(write=False) as conn:
        delivery = conn.execute(
            "SELECT payload FROM outbox WHERE request_id=? AND event_type='decision_otp'",
            (ident,),
        ).fetchone()
        assert delivery
        message = env.settings.unseal(delivery["payload"])["body"]
    otp = re.search(r"verification code is: ([0-9]{6})", message)
    assert otp
    verified = env.api.post(
        f"/api/v1/decision-intents/{token}/otp/verify",
        headers={"Origin": env.settings.origin},
        json={"confirmation_token": context, "otp": otp.group(1)},
    )
    assert verified.status_code == 200, verified.text
    result = _confirm(env, _stale_cookie(env, revoke=revoke), token, context)
    assert result.status_code == 200, result.text
    assert result.json()["state"] == "APPROVED"
    assert result.json()["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_OTP"
    assert result.json()["verified_person_id"] is None
    assert result.json()["mfa_verified"] is False
    assert result.json()["execution_allowed"] is False


def test_valid_but_unrelated_login_session_never_upgrades_mailbox_only_identity(env):
    ident, token, context = _request(env)
    unrelated = env.human("stranger")
    result = _confirm(env, unrelated, token, context)
    assert result.status_code == 200, result.text
    assert result.json()["state"] == "APPROVED"
    assert result.json()["actor_assurance"] == "EMAIL_LINK_PIN"
    assert result.json()["verified_person_id"] is None
    assert result.json()["mfa_verified"] is False
    with env.db.transaction(write=False) as conn:
        evidence = json.loads(conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (ident,),
        ).fetchone()["detail"])
        assert evidence["verified_person_id"] is None
        assert evidence["mailbox_recipient_id"] == env.users["approver"]["id"]
        assert evidence["actor_assurance"] == "EMAIL_LINK_PIN"


def test_independent_mfa_still_rejects_stale_unrelated_or_missing_session(env):
    profile = _active_profile(env, "EMAIL_PIN_PLUS_MFA")
    ident, token, context = _request(env, profile)
    for client in (_stale_cookie(env, revoke=True), env.api):
        rejected = _confirm(env, client, token, context)
        assert rejected.status_code in (401, 403), rejected.text
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?", (ident,),
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT state FROM requests WHERE id=?", (ident,),
        ).fetchone()[0] == "AWAITING"
