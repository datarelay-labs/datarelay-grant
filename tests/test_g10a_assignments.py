"""G10A-0 persisted approval seats and policy-versioned denial rules."""

import time

from grant.db import Database
from grant.models import ApproverGroup, Delegation, Profile, ProfileUpdate


def group_request(env, mode="ALL", required=None):
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="G10A " + mode,
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name="G10A " + mode,
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode=mode,
            approver_group_id=group["id"],
            approvals_required=required,
            action_kind="service.g10a-" + mode.lower(),
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    active = env.core.transition_profile(env.admin, profile["id"], "ACTIVE")
    response = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=active["id"],
            action={"kind": active["action_kind"], "target": "test", "parameters": {}},
        ),
    )
    assert response.status_code == 202, response.text
    return response.json()


def decision(env, who, request, choice, reason=""):
    return env.human(who).post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": choice, "expected_revision": request["revision"], "reason": reason},
    )


def test_parallel_hold_does_not_block_other_seats_or_change_epochs(env):
    request = group_request(env, "N_OF_M", 2)
    with env.db.transaction(write=False) as conn:
        original = [dict(row) for row in conn.execute(
            "SELECT * FROM approval_assignments WHERE request_id=? ORDER BY position",
            (request["id"],),
        )]
    assert len(original) == 2
    assert len({row["id"] for row in original}) == 2
    assert len({row["step_id"] for row in original}) == 1
    assert {row["assignment_epoch"] for row in original} == {1}

    held = decision(env, "approver", request, "HELD")
    assert held.status_code == 200, held.text
    assert held.json()["state"] == "HELD"
    other = decision(env, "stranger", held.json(), "APPROVED")
    assert other.status_code == 200, other.text
    assert other.json()["state"] == "HELD"
    completed = decision(env, "approver", other.json(), "APPROVED")
    assert completed.status_code == 200, completed.text
    assert completed.json()["state"] == "APPROVED"
    with env.db.transaction(write=False) as conn:
        after = [dict(row) for row in conn.execute(
            "SELECT * FROM approval_assignments WHERE request_id=? ORDER BY position",
            (request["id"],),
        )]
    assert after == original


def test_sequential_hold_keeps_step_blocked(env):
    request = group_request(env, "SEQUENTIAL")
    with env.db.transaction(write=False) as conn:
        steps = conn.execute(
            "SELECT step_id FROM approval_assignments WHERE request_id=? ORDER BY position",
            (request["id"],),
        ).fetchall()
    assert steps[0]["step_id"] != steps[1]["step_id"]
    hold = decision(env, "approver", request, "HELD")
    assert hold.status_code == 200
    premature = decision(env, "stranger", hold.json(), "APPROVED")
    assert premature.status_code == 409
    assert premature.json()["error"]["code"] == "APPROVAL_STEP_NOT_CURRENT"


def test_original_and_delegate_complete_one_seat_not_two(env):
    now = time.time()
    # The original assignee delegates to a different eligible user.
    from grant.auth import Principal
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1,
            ends_at=now + 3600,
        ),
    )
    request = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    first = decision(env, "approver", request, "HELD")
    assert first.status_code == 200
    finished = decision(env, "stranger", first.json(), "APPROVED")
    assert finished.status_code == 200
    assert finished.json()["state"] == "APPROVED"
    assert len(finished.json()["decisions"]) == 1
    retry = decision(env, "approver", finished.json(), "DENIED")
    assert retry.status_code == 409
    assert retry.json()["error"]["code"] == "DECISION_ALREADY_RECORDED"
    with env.db.transaction(write=False) as conn:
        events = conn.execute(
            "SELECT detail FROM audit WHERE request_id=? AND action='request.decision_recorded'",
            (request["id"],),
        ).fetchall()
        assert len(events) == 2
        assert conn.execute(
            "SELECT COUNT(*) FROM approval_assignments WHERE request_id=?", (request["id"],),
        ).fetchone()[0] == 1


def test_required_deny_reason_is_snapshotted_to_request(env):
    required = env.core.create_profile(
        env.admin,
        Profile(
            name="Required explanation",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="service.denial-required",
            denial_reason_required=True,
        ),
    )
    env.core.transition_profile(env.admin, required["id"], "TESTING")
    active = env.core.transition_profile(env.admin, required["id"], "ACTIVE")
    assert active["denial_reason_required"] is True
    request = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=active["id"],
            action={"kind": active["action_kind"], "target": "test", "parameters": {}},
        ),
    ).json()
    # Updating the reusable policy does not alter in-flight enforcement.
    env.core.update_profile(
        env.admin,
        required["id"],
        ProfileUpdate(
            name="Required explanation",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            action_kind="service.denial-required",
            denial_reason_required=False,
        ),
    )
    refused = decision(env, "approver", request, "DENIED", "   ")
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "DENIAL_REASON_REQUIRED"
    valid = decision(env, "approver", request, "DENIED", "Not safe")
    assert valid.status_code == 200
    assert valid.json()["state"] == "DENIED"

    optional = env.human("requester").post("/api/v1/requests", json=env.intake()).json()
    accepted = decision(env, "approver", optional, "DENIED")
    assert accepted.status_code == 200
    assert accepted.json()["state"] == "DENIED"


def test_v8_upgrade_backfills_seats_but_never_enables_old_email_pin(env, tmp_path):
    request = group_request(env, "ALL")
    with env.db.transaction() as conn:
        # Simulate an authenticated-only v8 request without any G10A
        # issuance (new v10 rows must be cleared in foreign-key order).
        conn.execute(
            "DELETE FROM decision_confirmations WHERE intent_digest IN "
            "(SELECT i.token_digest FROM decision_intents i JOIN decision_issuances x "
            "ON x.id=i.issuance_id WHERE x.request_id=?)", (request["id"],),
        )
        conn.execute(
            "DELETE FROM decision_intents WHERE issuance_id IN "
            "(SELECT id FROM decision_issuances WHERE request_id=?)", (request["id"],),
        )
        conn.execute("DELETE FROM decision_issuances WHERE request_id=?", (request["id"],))
        conn.execute("DELETE FROM approval_assignments WHERE request_id=?", (request["id"],))
        conn.execute(
            "UPDATE requests SET email_pin_enabled=0 WHERE id=?", (request["id"],),
        )
        conn.execute("PRAGMA user_version=8")
    upgraded = Database(env.settings.database)
    with upgraded.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT denial_reason_required,email_pin_enabled FROM requests WHERE id=?",
            (request["id"],),
        ).fetchone()
        assert row["denial_reason_required"] == 0
        assert row["email_pin_enabled"] == 0
        assert conn.execute(
            "SELECT COUNT(*) FROM approval_assignments WHERE request_id=?", (request["id"],),
        ).fetchone()[0] == 2
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 11
    backup = tmp_path / "grant-v9.backup"
    upgraded.backup(backup)
    restored = tmp_path / "grant-v9-restored.sqlite"
    Database.restore(backup, restored)
    Database(restored)
    with Database(restored).transaction(write=False) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM approval_assignments WHERE request_id=?", (request["id"],),
        ).fetchone()[0] == 2
