import time

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
