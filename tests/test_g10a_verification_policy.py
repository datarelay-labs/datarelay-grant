"""G10A-3 trusted email verification policy, OTP delivery, and fail-closed MFA."""

import json
import re
import time
from dataclasses import replace

import pytest

from grant.db import Database
from grant.models import Integration, Profile, ProfileUpdate


def activate(env, profile: Profile):
    created = env.core.create_profile(env.admin, profile)
    env.core.transition_profile(env.admin, created["id"], "TESTING")
    return env.core.transition_profile(env.admin, created["id"], "ACTIVE")


def create(env, profile, *, source=None):
    action = {"kind": profile["action_kind"], "target": "protected-test", "parameters": {}}
    result = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=profile["id"], action=action,
            source=source or {},
        ),
    )
    assert result.status_code == 202, result.text
    return result.json()


def mailbox(env, request_id):
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT * FROM outbox WHERE request_id=? AND issuance_id IS NOT NULL "
            "AND event_type='requested' ORDER BY created_at,id LIMIT 1",
            (request_id,),
        ).fetchone()
    assert row and row["sealed_payload"] == 1
    contents = env.settings.unseal(row["payload"])
    pin = re.search("Four-digit confirmation PIN: ([0-9]{4})", contents["body"])
    link = re.search(r"Approve: (https?://[^\s]+)", contents["body"])
    assert pin and link
    return row, contents, pin.group(1), link.group(1).split("/")[-1]


def pin_verify(env, link, code):
    return env.api.post(
        f"/api/v1/decision-intents/{link}/verify",
        json={"pin": code},
        headers={"Origin": env.settings.origin},
    )


def otp_request(env, link, context):
    return env.api.post(
        f"/api/v1/decision-intents/{link}/otp/request",
        json={"confirmation_token": context},
        headers={"Origin": env.settings.origin},
    )


def otp_verify(env, link, context, code):
    return env.api.post(
        f"/api/v1/decision-intents/{link}/otp/verify",
        json={"confirmation_token": context, "otp": code},
        headers={"Origin": env.settings.origin},
    )


def final(env, link, context):
    return env.api.post(
        f"/api/v1/decision-intents/{link}/confirm",
        json={"confirmation_token": context, "reason": ""},
        headers={"Origin": env.settings.origin},
    )


def test_pending_extra_otp_keeps_original_decision_links_on_reminder(env):
    """A later OTP outbox row must not become the source of link/PIN reminders."""
    profile = activate(env, Profile(
        name="OTP pending during decision reminder",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.otp-reminder",
        verification_mode="EMAIL_PIN_PLUS_OTP",
    ))
    req = create(env, profile)
    original, content, pin, link = mailbox(env, req["id"])
    verified = pin_verify(env, link, pin)
    assert verified.status_code == 200, verified.text
    context = verified.json()["confirmation_token"]
    assert otp_request(env, link, context).status_code == 202

    # Exercise the normal reminder scheduler; the OTP message is newer than
    # the approval email and shares its issuance_id.
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE requests SET next_reminder=0 WHERE id=?", (req["id"],),
        )
    env.core.maintenance()

    with env.db.transaction(write=False) as conn:
        reminders = conn.execute(
            "SELECT * FROM outbox WHERE request_id=? AND event_type='reminder'",
            (req["id"],),
        ).fetchall()
        assert len(reminders) == 1
        assert reminders[0]["issuance_id"] == original["issuance_id"]
        assert conn.execute(
            "SELECT COUNT(*) FROM decision_issuances WHERE request_id=?",
            (req["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM outbox WHERE request_id=? AND event_type='decision_otp'",
            (req["id"],),
        ).fetchone()[0] == 1
    reminder_content = env.settings.unseal(reminders[0]["payload"])
    assert reminder_content["_decision_tokens"] == content["_decision_tokens"]
    assert reminder_content["_decision_pin"] == pin
    assert "Approve:" in reminder_content["body"]
    assert pin_verify(env, link, pin).status_code == 200


def test_otp_policy_requires_deliberate_post_and_never_calls_it_mfa(env):
    profile = activate(env, Profile(
        name="OTP-required email approvals",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.otp-needed",
        verification_mode="EMAIL_PIN_PLUS_OTP",
    ))
    req = create(env, profile)
    _, _, pin, link = mailbox(env, req["id"])
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (req["id"],),
        ).fetchone()[0] == "EMAIL_PIN_PLUS_OTP"
        old_count = conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
        assert conn.execute("SELECT COUNT(*) FROM decision_otp_challenges").fetchone()[0] == 0
    generic = env.api.get("/api/v1/decision-intents/" + link)
    assert generic.status_code == 200
    assert generic.json()["verification_mode"] == "EMAIL_PIN_PLUS_OTP"
    assert "protected-test" not in generic.text
    assert env.api.head("/api/v1/decision-intents/" + link).status_code == 204
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == old_count
        assert conn.execute("SELECT COUNT(*) FROM decision_otp_challenges").fetchone()[0] == 0

    verified = pin_verify(env, link, pin)
    assert verified.status_code == 200, verified.text
    context = verified.json()["confirmation_token"]
    assert verified.json()["verification_mode"] == "EMAIL_PIN_PLUS_OTP"
    assert final(env, link, context).json()["error"]["code"] == "EMAIL_OTP_REQUIRED"
    assert env.human("approver").post(
        f"/api/v1/requests/{req['id']}/decision",
        json={"expected_revision": req["revision"], "decision": "APPROVED"},
    ).status_code == 403
    without_origin = env.api.post(
        f"/api/v1/decision-intents/{link}/otp/request",
        json={"confirmation_token": context},
    )
    assert without_origin.status_code == 403
    sent = otp_request(env, link, context)
    assert sent.status_code == 202, sent.text
    assert sent.json()["otp_queued"] is True
    assert sent.json()["mfa"] is False
    with env.db.transaction(write=False) as conn:
        queued = conn.execute(
            "SELECT payload,otp_challenge_id,sealed_payload FROM outbox "
            "WHERE request_id=? AND event_type='decision_otp'",
            (req["id"],),
        ).fetchone()
        assert queued and queued["sealed_payload"] == 1
        assert queued["otp_challenge_id"]
        audit_row = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='decision.otp_queued'",
            (req["id"],),
        ).fetchone()
        assert audit_row
        assert "mfa" in audit_row["detail"]
    payload = env.settings.unseal(queued["payload"])
    otp_match = re.search("verification code is: ([0-9]{6})", payload["body"])
    assert otp_match
    otp = otp_match.group(1)
    assert otp not in queued["payload"]
    assert "NOT MFA" in payload["body"]
    okay = otp_verify(env, link, context, otp)
    assert okay.status_code == 200, okay.text
    assert okay.json()["mfa"] is False
    assert otp_verify(env, link, context, otp).status_code == 409
    decided = final(env, link, context)
    assert decided.status_code == 200, decided.text
    assert decided.json()["state"] == "APPROVED"
    assert decided.json()["verified_person_id"] is None
    assert decided.json()["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_OTP"
    with env.db.transaction(write=False) as conn:
        vote = json.loads(conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (req["id"],),
        ).fetchone()[0])
        assert vote["actor_assurance"] == "EMAIL_LINK_PIN_PLUS_OTP"
        assert vote["verified_person_id"] is None


def test_email_otp_three_bad_guesses_lock_and_cannot_confirm(env):
    profile = activate(env, Profile(
        name="Locked OTP", integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.otp-lock",
        verification_mode="EMAIL_PIN_PLUS_OTP",
    ))
    req = create(env, profile)
    _, _, pin, link = mailbox(env, req["id"])
    context = pin_verify(env, link, pin).json()["confirmation_token"]
    assert otp_request(env, link, context).status_code == 202
    with env.db.transaction(write=False) as conn:
        challenge = conn.execute(
            "SELECT id FROM decision_otp_challenges ORDER BY issued_at DESC LIMIT 1"
        ).fetchone()[0]
        payload = env.settings.unseal(conn.execute(
            "SELECT payload FROM outbox WHERE otp_challenge_id=?", (challenge,)
        ).fetchone()[0])
        secret = re.search(r"code is: (\d{6})", payload["body"]).group(1)
    for i in range(3):
        guess = f"{i:06d}"
        if guess == secret:
            guess = "999999"
        result = otp_verify(env, link, context, guess)
        assert result.status_code == 403
    assert otp_verify(env, link, context, secret).status_code == 409
    assert final(env, link, context).status_code == 403
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT state,failed_attempts FROM decision_otp_challenges WHERE id=?",
            (challenge,),
        ).fetchone()
        assert row["state"] == "LOCKED"
        assert row["failed_attempts"] == 3


def test_strong_integration_minimum_blocks_lower_policy_and_inflight_relaxation(env):
    policy = activate(env, Profile(
        name="Verification floor",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.critical-policy",
        verification_mode="EMAIL_PIN_PLUS_MFA",
    ))
    request = create(env, policy)
    _, _, pin, link = mailbox(env, request["id"])
    first = pin_verify(env, link, pin)
    assert first.status_code == 200
    context = first.json()["confirmation_token"]
    assert first.json()["verification_mode"] == "EMAIL_PIN_PLUS_MFA"
    assert final(env, link, context).status_code == 403
    assert otp_request(env, link, context).status_code == 409
    assert env.human("approver").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": request["revision"]},
    ).status_code == 403
    env.core.update_profile(
        env.admin, policy["id"], ProfileUpdate(
            name="Verification floor",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="service.critical-policy",
            verification_mode="EMAIL_PIN",
        ),
    )
    # The in-flight snapshot remains high assurance despite changing draft.
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()[0] == "EMAIL_PIN_PLUS_MFA"
    assert final(env, link, context).status_code == 403


def test_registered_integration_minimum_overrides_policy_and_request_labels(env):
    integration = env.core.create_integration(
        env.admin, Integration(
            name="Trusted high assurance",
            kind="datarelay", callback_url=env.settings.callback_urls[0],
            decision_verification_minimum="EMAIL_PIN_PLUS_MFA",
        ),
    )
    profile = activate(env, Profile(
        name="Weak policy strong source",
        integration_id=integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.registered-source",
        verification_mode="EMAIL_PIN",
    ))
    request = create(
        env, profile,
        source={"risk_level": "low", "severity": "none", "environment": "test"},
    )
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()[0] == "EMAIL_PIN_PLUS_MFA"
    _, _, pin, link = mailbox(env, request["id"])
    context = pin_verify(env, link, pin).json()["confirmation_token"]
    assert final(env, link, context).status_code == 403


def test_requester_supplied_risk_cannot_downgrade_another_active_policy(env):
    from grant.models import Profile

    high = activate(env, Profile(
        name="High risk source conditional",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.shared-action",
        risk_level="critical",
        verification_mode="EMAIL_PIN_PLUS_MFA",
    ))
    low = activate(env, Profile(
        name="Fallback for same action",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.shared-action",
        verification_mode="EMAIL_PIN",
    ))
    assert high["verification_mode"] == "EMAIL_PIN_PLUS_MFA"
    assert low["verification_mode"] == "EMAIL_PIN"
    request = create(env, low, source={"risk_level": "low"})
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()[0] == "EMAIL_PIN_PLUS_MFA"


def test_policy_ttl_override_and_v10_database_upgrade_preserves_snapshot(env):
    policy = activate(env, Profile(
        name="Short-lived decision PIN",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.short-link",
        decision_link_ttl_seconds=300,
        deadline_seconds=3600,
    ))
    request = create(env, policy)
    with env.db.transaction(write=False) as conn:
        deadline = conn.execute(
            "SELECT deadline,decision_link_ttl_seconds FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()
        expiry = conn.execute(
            "SELECT issued_at,expires_at FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchone()
    assert deadline["decision_link_ttl_seconds"] == 300
    assert 0 < expiry["expires_at"] - expiry["issued_at"] <= 300
    assert expiry["expires_at"] < deadline["deadline"]
    # Interrupted-upgrade simulation of a v10 DB with already-added columns
    # must not issue links or downgrade existing verification snapshots.
    with env.db.transaction() as conn:
        conn.execute("PRAGMA user_version=10")
    Database(env.settings.database)
    with env.db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        assert conn.execute(
            "SELECT COUNT(*) FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 1


def test_invalid_installation_verification_configuration_rejected(env):
    with pytest.raises(ValueError, match="Invalid decision_verification_default"):
        replace(env.settings, decision_verification_default="REQUESTER_DOWNGRADE")


def test_extra_otp_is_not_redelivered_after_expiry_or_revocation(env, monkeypatch):
    from grant.transport import Worker

    profile = activate(env, Profile(
        name="OTP expiration delivery",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.otp-expired",
        verification_mode="EMAIL_PIN_PLUS_OTP",
    ))
    request = create(env, profile)
    _, _, pin, link = mailbox(env, request["id"])
    context = pin_verify(env, link, pin).json()["confirmation_token"]
    assert otp_request(env, link, context).status_code == 202
    with env.db.transaction() as conn:
        row = conn.execute("SELECT id FROM decision_otp_challenges").fetchone()
        conn.execute(
            "UPDATE decision_otp_challenges SET expires_at=0 WHERE id=?",
            (row["id"],),
        )
    sent = []
    monkeypatch.setattr(
        "grant.transport.send_email",
        lambda _settings, address, body, _event_id: sent.append((address, json.loads(body))),
    )
    monkeypatch.setattr("grant.transport.send_webhook", lambda *args: None)
    Worker(env.db, env.settings).tick()
    assert all("Additional decision verification code" not in item["subject"] for _, item in sent)
    with env.db.transaction(write=False) as conn:
        otp_state = conn.execute(
            "SELECT state FROM outbox WHERE otp_challenge_id=?", (row["id"],),
        ).fetchone()["state"]
        assert otp_state == "SUPERSEDED"
    assert final(env, link, context).status_code == 403


def test_extra_otp_request_is_bound_to_outcome_and_reissue_is_rate_limited(env):
    profile = activate(env, Profile(
        name="OTP scoped requests",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.otp-scoped",
        verification_mode="EMAIL_PIN_PLUS_OTP",
    ))
    req = create(env, profile)
    _, data, pin, approving = mailbox(env, req["id"])
    denying = re.search(r"Deny: (https?://[^\s]+)", data["body"]).group(1).split("/")[-1]
    context = pin_verify(env, approving, pin).json()["confirmation_token"]
    wrong_intent = otp_request(env, denying, context)
    assert wrong_intent.status_code == 409
    assert final(env, denying, context).status_code == 409
    assert otp_request(env, approving, context).status_code == 202
    immediate = otp_request(env, approving, context)
    assert immediate.status_code == 429
    assert immediate.json()["error"]["code"] == "EMAIL_OTP_REISSUE_COOLDOWN"
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM decision_otp_challenges",
        ).fetchone()[0] == 1


def test_admin_decision_reissue_is_blocked_during_recovery_pause(env):
    request = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    admin = env.human("admin")
    with env.db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")
    attempted = admin.post(
        f"/api/v1/admin/requests/{request['id']}/decision-links/reissue",
        json={
            "recipient_user_id": env.users["approver"]["id"],
            "reason": "Do not issue links in recovery pause",
        },
    )
    assert attempted.status_code == 409
    assert attempted.json()["error"]["code"] == "RECOVERY_RECONCILIATION_REQUIRED"
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 1


def test_ambiguous_delegate_reissue_requires_specific_seat(env):
    from grant.auth import Principal
    from grant.models import ApproverGroup, Delegation

    now = time.time()
    for who in ("approver", "stranger"):
        env.core.create_delegation(
            Principal(env.users[who]["id"], "human", "member"),
            Delegation(
                substitute_id=env.users["admin"]["id"],
                starts_at=now - 1,
                ends_at=now + 3600,
            ),
        )
    group = env.core.create_approver_group(
        env.admin, ApproverGroup(
            name="Two seats same substitute",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    profile = activate(env, Profile(
        name="Ambiguous delegated approvals",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        approver_group_id=group["id"], approval_mode="ALL",
        action_kind="service.multiple-delegation",
    ))
    request = create(env, profile)
    rejected = env.human("admin").post(
        f"/api/v1/admin/requests/{request['id']}/decision-links/reissue",
        json={"recipient_user_id": env.users["admin"]["id"], "reason": "Ambiguous"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "DECISION_REISSUE_AMBIGUOUS_SEAT"


def test_admin_updates_integration_verification_floor_and_preserves_old_request(env):
    profile = activate(env, Profile(
        name="Customer verification changes",
        integration_id=env.integration["id"],
        approver_id=env.users["approver"]["id"],
        action_kind="service.integration-floor",
        verification_mode="EMAIL_PIN",
    ))
    first = create(env, profile)
    _, _, pin, link = mailbox(env, first["id"])
    first_ctx = pin_verify(env, link, pin).json()["confirmation_token"]
    denied = env.human("approver").put(
        f"/api/v1/integrations/{env.integration['id']}/decision-verification",
        json={"decision_verification_minimum": "EMAIL_PIN_PLUS_MFA",
              "reason": "Restricted asset now requires fresh identity"},
    )
    assert denied.status_code == 403, denied.text
    updated = env.human("admin").put(
        f"/api/v1/integrations/{env.integration['id']}/decision-verification",
        json={"decision_verification_minimum": "EMAIL_PIN_PLUS_OTP",
              "reason": "Require a separate code on future requests"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["existing_snapshots_unchanged"] is True
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (first["id"],),
        ).fetchone()[0] == "EMAIL_PIN"
    # The current minimum strengthens an already verified PIN decision:
    # the old confirmation cannot silently bypass the newly raised requirement.
    assert final(env, link, first_ctx).status_code == 403
    second = create(env, profile)
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (second["id"],),
        ).fetchone()[0] == "EMAIL_PIN_PLUS_OTP"
    new_floor = env.human("admin").put(
        f"/api/v1/integrations/{env.integration['id']}/decision-verification",
        json={"decision_verification_minimum": "EMAIL_PIN",
              "reason": "Back to default on new requests"},
    )
    assert new_floor.status_code == 200
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT decision_verification_mode FROM requests WHERE id=?",
            (second["id"],),
        ).fetchone()[0] == "EMAIL_PIN_PLUS_OTP"
    new_mail = mailbox(env, second["id"])
    verify = pin_verify(env, new_mail[3], new_mail[2])
    assert verify.json()["verification_mode"] == "EMAIL_PIN_PLUS_OTP"
    assert final(env, new_mail[3], verify.json()["confirmation_token"]).status_code == 403
    with env.db.transaction(write=False) as conn:
        changes = conn.execute(
            "SELECT COUNT(*) FROM audit WHERE action='integration.decision_verification_updated'"
        ).fetchone()[0]
        assert changes == 2


def test_disabled_integration_revokes_mailbox_decision_before_commit(env):
    req = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    _, _, pin, link = mailbox(env, req["id"])
    ctx = pin_verify(env, link, pin)
    assert ctx.status_code == 200
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE integrations SET enabled=0 WHERE id=?",
            (env.integration["id"],),
        )
    assert env.api.get("/api/v1/decision-intents/" + link).status_code == 404
    assert final(env, link, ctx.json()["confirmation_token"]).status_code == 404
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?",
            (req["id"],),
        ).fetchone()[0] == 0


def test_recovery_pause_denies_authenticated_decision_as_well_as_mail_link(env):
    request = env.human("requester").post(
        "/api/v1/requests", json=env.intake(),
    ).json()
    logged_in = env.human("approver")
    _, _, pin, link = mailbox(env, request["id"])
    with env.db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")
    denied = logged_in.post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": request["revision"]},
    )
    assert denied.status_code == 409, denied.text
    assert denied.json()["error"]["code"] == "RECOVERY_RECONCILIATION_REQUIRED"
    assert pin_verify(env, link, pin).status_code == 409
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM request_decisions WHERE request_id=?", (request["id"],),
        ).fetchone()[0] == 0
