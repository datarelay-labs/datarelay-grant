"""G10A reminders must never rotate a valid issuance without admin reissue.

Outbox retention may remove old delivered message material, but an approved
email/PIN generation remains valid. Only the administrator may rotate it.
"""

import json
import time

from grant.models import DecisionReissue


def assert_reminder_blocked_audit(env, request_id: str, reason: str) -> None:
    response = env.human("admin").get(
        "/api/v1/admin/audit/search",
        params={"request_id": request_id, "action": "decision.reminder_unavailable"},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 1
    details = items[0]["details"]
    assert details["issuance_id"]
    # The admin audit-search projection intentionally omits free-text
    # reasons; diagnostic codes are checked only in the disposable DB.
    assert "reason" not in details
    serialized = json.dumps(items)
    assert "_decision_pin" not in serialized and "_decision_tokens" not in serialized
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? "
            "AND action='decision.reminder_unavailable'",
            (request_id,),
        ).fetchone()
        assert row
        stored = json.loads(row["detail"])
    assert stored.get("reminder_unavailable_reason", stored.get("reason")) == reason
    assert stored.get("reminder_queued", stored.get("mail_queued")) is False
    assert not any(k in stored for k in ("_decision_pin", "_decision_tokens"))


def test_reminder_without_saved_mail_does_not_silently_issue_new_links(env):
    created = env.human("requester").post(
        "/api/v1/requests", json=env.intake(),
    )
    assert created.status_code == 202, created.text
    request = created.json()
    with env.db.transaction() as conn:
        row = conn.execute(
            """SELECT id,issuance_id,payload FROM outbox
               WHERE request_id=? AND event_type='requested' AND sealed_payload=1""",
            (request["id"],),
        ).fetchone()
        assert row is not None and row["issuance_id"]
        original_issuance = row["issuance_id"]
        content = env.settings.unseal(row["payload"])
        assert "_decision_pin" in content
        pin = content["_decision_pin"]
        token = content["_decision_tokens"]["APPROVED"]
        assert token in content["body"]
        # Only disposable state: simulate archiving an already sent encrypted
        # approval email. The issuance, hashed tokens and PIN remain active.
        conn.execute("DELETE FROM outbox WHERE id=?", (row["id"],))
        conn.execute(
            "UPDATE requests SET next_reminder=0 WHERE id=?", (request["id"],),
        )

    env.core.maintenance()

    with env.db.transaction(write=False) as conn:
        issuances = conn.execute(
            "SELECT id,state FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchall()
        # The scheduler must not act as an untrusted administrator reissue.
        assert [(x["id"], x["state"]) for x in issuances] == [
            (original_issuance, "ACTIVE"),
        ]
        assert conn.execute(
            "SELECT COUNT(*) FROM outbox WHERE request_id=? AND event_type='reminder'",
            (request["id"],),
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='decision.issuance_created'",
            (request["id"],),
        ).fetchone()[0] == 1
        stats = conn.execute(
            "SELECT reminder_count,next_reminder FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()
        assert stats["reminder_count"] == 0
        assert stats["next_reminder"] > time.time()
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminded'",
            (request["id"],),
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminder_skipped'",
            (request["id"],),
        ).fetchone()[0] == 1
    assert_reminder_blocked_audit(
        env, request["id"], "sealed_mail_material_missing",
    )
    preflight = env.api.get(f"/api/v1/decision-intents/{token}")
    assert preflight.status_code == 200, preflight.text
    verified = env.api.post(
        f"/api/v1/decision-intents/{token}/verify",
        json={"pin": pin},
        headers={"Origin": env.settings.origin},
    )
    assert verified.status_code == 200, verified.text

    # Explicit authorized reissue still rotates once, invalidating the old link.
    reissued = env.core.reissue_decision_mail(
        env.admin, request["id"],
        DecisionReissue(
            recipient_user_id=env.users["approver"]["id"],
            reason="Administrator replacement after unavailable stored reminder mail",
        ),
    )
    assert reissued["reissued"] is True
    with env.db.transaction(write=False) as conn:
        latest = conn.execute(
            "SELECT id,state FROM decision_issuances WHERE request_id=? ORDER BY generation",
            (request["id"],),
        ).fetchall()
        assert len(latest) == 2
        assert latest[0]["id"] == original_issuance
        assert latest[0]["state"] == "REVOKED"
        assert latest[1]["state"] == "ACTIVE"
    assert env.api.get(f"/api/v1/decision-intents/{token}").status_code == 404


def test_expired_decision_links_are_not_silently_refreshed_by_reminder(env):
    created = env.human("requester").post(
        "/api/v1/requests", json=env.intake(),
    )
    assert created.status_code == 202
    request = created.json()
    with env.db.transaction() as conn:
        original = conn.execute(
            "SELECT id FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchone()
        assert original is not None
        original_id = original["id"]
        now = time.time()
        conn.execute(
            "UPDATE decision_issuances SET expires_at=? WHERE id=?",
            (now - 5, original_id),
        )
        conn.execute(
            "UPDATE requests SET next_reminder=0 WHERE id=?",
            (request["id"],),
        )

    env.core.maintenance()
    with env.db.transaction(write=False) as conn:
        all_issuances = conn.execute(
            "SELECT id FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchall()
        # The original expiration is authoritative until an administrator
        # deliberately reissues links. A scheduler must not extend the TTL.
        assert [r["id"] for r in all_issuances] == [original_id]
        assert conn.execute(
            "SELECT COUNT(*) FROM outbox WHERE request_id=? AND event_type='reminder'",
            (request["id"],),
        ).fetchone()[0] == 0
        stats = conn.execute(
            "SELECT reminder_count,next_reminder FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()
        assert stats["reminder_count"] == 0
        assert stats["next_reminder"] > time.time()
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminded'",
            (request["id"],),
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminder_skipped'",
            (request["id"],),
        ).fetchone()[0] == 1

    assert_reminder_blocked_audit(
        env, request["id"], "prior_issuance_not_reusable",
    )
    result = env.core.reissue_decision_mail(
        env.admin, request["id"],
        DecisionReissue(
            recipient_user_id=env.users["approver"]["id"],
            reason="Admin approved rotating an expired email capability",
        ),
    )
    assert result["reissued"] is True
    with env.db.transaction(write=False) as conn:
        rotated = conn.execute(
            "SELECT id,state FROM decision_issuances WHERE request_id=? ORDER BY generation",
            (request["id"],),
        ).fetchall()
        assert len(rotated) == 2
        assert rotated[0]["id"] == original_id
        assert rotated[0]["state"] == "REVOKED"
        assert rotated[1]["id"] != original_id
        assert rotated[1]["state"] == "ACTIVE"


def test_ordinary_reminder_reuses_original_links_and_pin(env):
    created = env.human("requester").post(
        "/api/v1/requests", json=env.intake(),
    )
    assert created.status_code == 202
    request = created.json()
    with env.db.transaction() as conn:
        source = conn.execute(
            """SELECT issuance_id,payload FROM outbox WHERE request_id=?
               AND event_type='requested' AND sealed_payload=1""",
            (request["id"],),
        ).fetchone()
        assert source
        original = env.settings.unseal(source["payload"])
        conn.execute(
            "UPDATE requests SET next_reminder=0 WHERE id=?",
            (request["id"],),
        )
    env.core.maintenance()
    with env.db.transaction(write=False) as conn:
        queued = conn.execute(
            "SELECT issuance_id,payload FROM outbox WHERE request_id=? AND event_type='reminder'",
            (request["id"],),
        ).fetchall()
        assert len(queued) == 1
        assert queued[0]["issuance_id"] == source["issuance_id"]
        assert conn.execute(
            "SELECT COUNT(*) FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT reminder_count FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminded'",
            (request["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminder_skipped'",
            (request["id"],),
        ).fetchone()[0] == 0
    rendered = env.settings.unseal(queued[0]["payload"])
    assert rendered["_decision_tokens"] == original["_decision_tokens"]
    assert rendered["_decision_pin"] == original["_decision_pin"]


def test_parallel_partial_recipient_failure_counts_only_a_queued_round(env):
    from grant.models import ApproverGroup, Profile

    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="Partially unavailable reminder recipients",
            member_ids=[
                env.users["approver"]["id"], env.users["stranger"]["id"],
            ],
        ),
    )
    policy = env.core.create_profile(
        env.admin,
        Profile(
            name="Partial G10A reminder budget",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approver_group_id=group["id"],
            approval_mode="ALL",
            action_kind="service.partial-reminders",
        ),
    )
    env.core.transition_profile(env.admin, policy["id"], "TESTING")
    active = env.core.transition_profile(env.admin, policy["id"], "ACTIVE")
    created = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=active["id"],
            action={
                "kind": active["action_kind"],
                "target": "partial-reminders",
                "parameters": {},
            },
        ),
    )
    assert created.status_code == 202, created.text
    request = created.json()
    with env.db.transaction() as conn:
        original = conn.execute(
            """SELECT id,recipient_id,issuance_id FROM outbox
               WHERE request_id=? AND event_type='requested'
                 AND sealed_payload=1 ORDER BY recipient_id""",
            (request["id"],),
        ).fetchall()
        assert len(original) == 2
        conn.execute("DELETE FROM outbox WHERE id=?", (original[0]["id"],))
        conn.execute(
            "UPDATE requests SET next_reminder=0 WHERE id=?", (request["id"],),
        )
    env.core.maintenance()
    with env.db.transaction(write=False) as conn:
        reminders = conn.execute(
            "SELECT issuance_id,recipient_id FROM outbox "
            "WHERE request_id=? AND event_type='reminder'",
            (request["id"],),
        ).fetchall()
        assert len(reminders) == 1
        assert reminders[0]["issuance_id"] == original[1]["issuance_id"]
        assert reminders[0]["recipient_id"] == original[1]["recipient_id"]
        assert conn.execute(
            "SELECT reminder_count FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? AND action='request.reminded'",
            (request["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? "
            "AND action='request.reminder_skipped'",
            (request["id"],),
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=? "
            "AND action='decision.reminder_unavailable'",
            (request["id"],),
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM decision_issuances WHERE request_id=?",
            (request["id"],),
        ).fetchone()[0] == 2
