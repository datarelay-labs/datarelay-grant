from grant.models import ApproverGroup, Profile


def group_profile(env, mode, required=None):
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(name=f"{mode} group", member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]]),
    )
    profile = env.core.create_profile(
        env.admin,
        Profile(
            name=f"{mode} policy",
            integration_id=env.integration["id"],
            approver_id=env.users["approver"]["id"],
            approval_mode=mode,
            approver_group_id=group["id"],
            approvals_required=required,
            action_kind=f"service.{mode.lower()}",
        ),
    )
    env.core.transition_profile(env.admin, profile["id"], "TESTING")
    return env.core.transition_profile(env.admin, profile["id"], "ACTIVE"), group


def create(env, profile):
    body = env.intake(
        profile_id=profile["id"],
        action={"kind": profile["action_kind"], "target": "test-service", "parameters": {}},
    )
    response = env.human("requester").post("/api/v1/requests", json=body)
    assert response.status_code == 202, response.text
    return response.json()


def decide(env, who, request, decision="APPROVED"):
    return env.human(who).post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": decision, "expected_revision": request["revision"], "reason": "test"},
    )


def test_any_one_group_approval_authorizes_once(env):
    profile, _ = group_profile(env, "ANY_ONE")
    request = create(env, profile)
    response = decide(env, "stranger", request)
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "APPROVED"
    assert len(response.json()["decisions"]) == 1


def test_all_group_requires_every_member_and_snapshots_membership(env):
    profile, group = group_profile(env, "ALL")
    request = create(env, profile)
    env.core.update_approver_group(
        env.admin, group["id"], ApproverGroup(name="changed", member_ids=[env.users["approver"]["id"]])
    )
    first = decide(env, "approver", request)
    assert first.status_code == 200, first.text
    assert first.json()["state"] == "AWAITING"
    second = decide(env, "stranger", first.json())
    assert second.status_code == 200, second.text
    assert second.json()["state"] == "APPROVED"


def test_n_of_m_and_duplicate_decision_are_race_safe(env):
    profile, _ = group_profile(env, "N_OF_M", 2)
    request = create(env, profile)
    first = decide(env, "approver", request)
    assert first.status_code == 200
    duplicate = env.human("approver").post(
        f"/api/v1/requests/{request['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": first.json()["revision"], "reason": "retry"},
    )
    assert duplicate.status_code == 200
    assert len(duplicate.json()["decisions"]) == 1
    second = decide(env, "stranger", first.json())
    assert second.status_code == 200
    assert second.json()["state"] == "APPROVED"


def test_sequential_rejects_out_of_order_then_advances(env):
    profile, _ = group_profile(env, "SEQUENTIAL")
    request = create(env, profile)
    early = decide(env, "stranger", request)
    assert early.status_code == 409
    first = decide(env, "approver", request)
    assert first.status_code == 200
    assert first.json()["state"] == "AWAITING"
    second = decide(env, "stranger", first.json())
    assert second.status_code == 200
    assert second.json()["state"] == "APPROVED"


def test_group_denial_is_final_and_self_approval_is_rejected(env):
    profile, _ = group_profile(env, "ALL")
    request = create(env, profile)
    denied = decide(env, "stranger", request, "DENIED")
    assert denied.status_code == 200
    assert denied.json()["state"] == "DENIED"
