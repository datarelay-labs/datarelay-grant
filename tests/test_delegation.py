import time

from grant.auth import Principal
from grant.models import ApproverGroup, Delegation, Profile


def active_group_profile(env):
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(name="Ops", member_ids=[env.users["approver"]["id"]]),
    )
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name="Delegated policy",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode="ANY_ONE",
            approver_group_id=group["id"],
            action_kind="service.delegated",
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    return env.core.transition_profile(env.admin, profile["id"], "ACTIVE")


def create(env, profile):
    response = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=profile["id"],
            action={"kind": profile["action_kind"], "target": "test", "parameters": {}},
        ),
    )
    assert response.status_code == 202
    return response.json()


def test_time_bounded_delegate_can_act_for_original_approver(env):
    profile = active_group_profile(env)
    now = time.time()
    env.core.create_delegation(
        env.auth.principal_for_user(env.users["approver"]["id"]) if hasattr(env.auth, "principal_for_user") else __import__("grant.auth", fromlist=["Principal"]).Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(substitute_id=env.users["stranger"]["id"], starts_at=now - 1, ends_at=now + 60),
    )
    request = create(env, profile)
    response = env.human("stranger").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": request["revision"], "reason": "covering"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "APPROVED"
    assert response.json()["decisions"][0]["actor_id"] == env.users["approver"]["id"]


def test_expired_delegate_cannot_see_or_decide_request(env):
    profile = active_group_profile(env)
    request = create(env, profile)
    with env.db.transaction() as conn:
        conn.execute(
            "INSERT INTO delegations(id,delegator_id,substitute_id,starts_at,ends_at,created_at) VALUES('expired',?,?,?,?,?)",
            (env.users["approver"]["id"], env.users["stranger"]["id"], time.time() - 100, time.time() - 10, time.time() - 100),
        )
    response = env.human("stranger").get(f"/api/v1/requests/{request['id']}")
    assert response.status_code == 404


def test_admin_reassignment_preserves_audit_and_changes_authority(env):
    profile = active_group_profile(env)
    request = create(env, profile)
    response = env.human("admin").post(
        f"/api/v1/requests/{request['id']}/reassign",
        json={
            "from_approver_id": env.users["approver"]["id"],
            "to_approver_id": env.users["stranger"]["id"],
            "expected_revision": request["revision"],
            "reason": "on-call rotation",
        },
    )
    assert response.status_code == 200, response.text
    changed = response.json()
    assert changed["approval_plan"]["members"] == [env.users["stranger"]["id"]]
    assert any(item["action"] == "request.reassigned" for item in changed["timeline"])


def test_escalation_adds_target_once_and_audits(env):
    profile = active_group_profile(env)
    request = create(env, profile)
    admin = env.human('admin')
    configured = admin.post(f"/api/v1/requests/{request['id']}/escalation", json={
        'target_user_id': env.users['stranger']['id'], 'after_seconds': 60,
    })
    assert configured.status_code == 200, configured.text
    with env.db.transaction() as conn:
        conn.execute('UPDATE escalations SET due_at=? WHERE request_id=?', (time.time() - 1, request['id']))
    env.core.maintenance()
    env.core.maintenance()
    result = admin.get(f"/api/v1/requests/{request['id']}").json()
    assert result['approval_plan']['members'].count(env.users['stranger']['id']) == 1
    assert sum(event['action'] == 'request.escalated' for event in result['timeline']) == 1


def test_delegate_sees_assigned_request_in_primary_inbox(env):
    profile = active_group_profile(env)
    now = time.time()
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1,
            ends_at=now + 60,
        ),
    )
    request = create(env, profile)

    response = env.human("stranger").get("/api/v1/requests")
    assert response.status_code == 200, response.text
    matching = next(item for item in response.json() if item["id"] == request["id"])
    assert matching["viewer_assigned"] is True
    assert matching["viewer_can_decide"] is True
    assert matching["viewer_delegated_for"] == env.users["approver"]["id"]
    detail = env.human("stranger").get(f"/api/v1/requests/{request['id']}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["viewer_can_decide"] is True


def test_delegate_matches_relevant_older_delegation_when_newer_one_is_unrelated(env):
    profile = active_group_profile(env)
    now = time.time()
    env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 2,
            ends_at=now + 60,
        ),
    )
    time.sleep(0.002)
    env.core.create_delegation(
        env.admin,
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1,
            ends_at=now + 60,
        ),
    )
    request = create(env, profile)

    response = env.human("stranger").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={
            "decision": "APPROVED",
            "expected_revision": request["revision"],
            "reason": "covering relevant approver",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "APPROVED"
    assert response.json()["decisions"][0]["actor_id"] == env.users["approver"]["id"]


def test_group_escalation_snapshots_members_and_marks_overdue(env):
    profile = active_group_profile(env)
    target_group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(name="Escalation team", member_ids=[env.users["stranger"]["id"]]),
    )
    request = create(env, profile)
    admin = env.human("admin")
    configured = admin.post(
        f"/api/v1/requests/{request['id']}/escalation",
        json={"target_group_id": target_group["id"], "after_seconds": 60},
    )
    assert configured.status_code == 200, configured.text
    assert configured.json()["target_members"] == [env.users["stranger"]["id"]]

    env.core.update_approver_group(
        env.admin,
        target_group["id"],
        ApproverGroup(name="Escalation team changed", member_ids=[env.users["admin"]["id"]]),
    )
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE escalations SET due_at=? WHERE request_id=?",
            (time.time() - 1, request["id"]),
        )

    env.core.maintenance()
    env.core.maintenance()
    result = admin.get(f"/api/v1/requests/{request['id']}")
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["overdue"] is True
    assert body["escalation"]["target_group_id"] == target_group["id"]
    assert body["escalation"]["target_members"] == [env.users["stranger"]["id"]]
    assert env.users["stranger"]["id"] in body["approval_plan"]["members"]
    assert env.users["admin"]["id"] not in body["approval_plan"]["members"]
    assert sum(event["action"] == "request.escalated" for event in body["timeline"]) == 1


def test_delegation_can_be_revoked_by_delegator(env):
    profile = active_group_profile(env)
    now = time.time()
    created = env.core.create_delegation(
        Principal(env.users["approver"]["id"], "human", "member"),
        Delegation(
            substitute_id=env.users["stranger"]["id"],
            starts_at=now - 1,
            ends_at=now + 60,
        ),
    )
    request = create(env, profile)
    substitute = env.human("stranger")
    assert substitute.get(f"/api/v1/requests/{request['id']}").status_code == 200

    delegator = env.human("approver")
    revoked = delegator.post(f"/api/v1/delegations/{created['id']}/revoke")
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["revoked_at"] is not None
    assert substitute.get(f"/api/v1/requests/{request['id']}").status_code == 404


def test_approver_directory_is_human_safe_projection(env):
    response = env.human("approver").get("/api/v1/approvers/directory")
    assert response.status_code == 200, response.text
    rows = response.json()
    assert any(row["id"] == env.users["stranger"]["id"] for row in rows)
    assert all(set(row) == {"id", "username"} for row in rows)
    assert all(row["id"] != env.users["approver"]["id"] for row in rows)


def test_reassignment_rejects_previous_vote_without_changing_quorum(env):
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="All must approve",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name="All approval reassign guard",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode="ALL",
            approver_group_id=group["id"],
            action_kind="service.reassign-guard",
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    active = env.core.transition_profile(env.admin, profile["id"], "ACTIVE")
    request = create(env, active)
    first = env.human("approver").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": request["revision"]},
    )
    assert first.status_code == 200, first.text
    assert first.json()["state"] == "AWAITING"

    changed = env.human("admin").post(
        f"/api/v1/requests/{request['id']}/reassign",
        json={
            "from_approver_id": env.users["approver"]["id"],
            "to_approver_id": env.users["admin"]["id"],
            "expected_revision": first.json()["revision"],
            "reason": "attempt to replace already counted vote",
        },
    )
    assert changed.status_code == 409, changed.text
    assert changed.json()["error"]["code"] == "REASSIGNMENT_ALREADY_DECIDED"
    current = env.human("admin").get(f"/api/v1/requests/{request['id']}").json()
    assert current["approval_plan"]["members"] == [
        env.users["approver"]["id"], env.users["stranger"]["id"],
    ]
    assert current["state"] == "AWAITING"
    assert len([decision for decision in current["decisions"] if decision["decision"] == "APPROVED"]) == 1
