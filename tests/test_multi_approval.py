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


def test_n_of_m_rejects_missing_or_impossible_quorum(env):
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="Quorum group",
            member_ids=[env.users["approver"]["id"], env.users["stranger"]["id"]],
        ),
    )
    admin = env.human("admin")
    for required in (None, 3):
        response = admin.post(
            "/api/v1/profiles",
            json=Profile(
                name="Invalid quorum",
                integration_id=env.integration["id"],
                approver_id=env.users["approver"]["id"],
                approval_mode="N_OF_M",
                approver_group_id=group["id"],
                approvals_required=required,
                action_kind=f"service.invalid-quorum-{required}",
            ).model_dump(),
        )
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] == "APPROVAL_QUORUM_INVALID"


def test_group_policy_projection_preserves_approval_settings(env):
    profile, group = group_profile(env, "N_OF_M", 2)
    current = next(item for item in env.core.profiles(env.admin) if item["id"] == profile["id"])
    assert current["approval_mode"] == "N_OF_M"
    assert current["approver_group_id"] == group["id"]
    assert current["approvals_required"] == 2


def test_request_rejects_disabled_snapshotted_group_member(env):
    profile, _ = group_profile(env, "ALL")
    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE users SET enabled=0 WHERE id=?",
            (env.users["stranger"]["id"],),
        )
    response = env.human("requester").post(
        "/api/v1/requests",
        json=env.intake(
            profile_id=profile["id"],
            action={"kind": profile["action_kind"], "target": "test-service", "parameters": {}},
        ),
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "APPROVER_UNAVAILABLE"


def test_sequential_hold_remains_revisable_by_same_approver(env):
    profile, _ = group_profile(env, "SEQUENTIAL")
    request = create(env, profile)
    held = decide(env, "approver", request, "HELD")
    assert held.status_code == 200, held.text
    assert held.json()["state"] == "HELD"

    approved = decide(env, "approver", held.json(), "APPROVED")
    assert approved.status_code == 200, approved.text
    assert approved.json()["state"] == "AWAITING"

    final = decide(env, "stranger", approved.json(), "APPROVED")
    assert final.status_code == 200, final.text
    assert final.json()["state"] == "APPROVED"


def test_sequential_viewer_assignment_distinguishes_current_step(env):
    profile, _ = group_profile(env, "SEQUENTIAL")
    request = create(env, profile)
    waiting = env.human("stranger").get(f"/api/v1/requests/{request['id']}")
    assert waiting.status_code == 200
    assert waiting.json()["viewer_assigned"] is True
    assert waiting.json()["viewer_can_decide"] is False

    first = decide(env, "approver", request, "APPROVED")
    assert first.status_code == 200
    second = env.human("stranger").get(f"/api/v1/requests/{request['id']}")
    assert second.json()["viewer_can_decide"] is True

    requester_view = env.human("requester").get(f"/api/v1/requests/{request['id']}")
    assert requester_view.json()["viewer_assigned"] is False
    assert requester_view.json()["viewer_can_decide"] is False


def test_policy_preview_contains_full_group_approval_plan(env):
    profile, group = group_profile(env, "N_OF_M", 2)
    response = env.human("admin").post(
        "/api/v1/profiles/preview",
        json={
            "integration_id": env.integration["id"],
            "action_kind": profile["action_kind"],
            "title": "Preview quorum",
            "target": "test-service",
            "reason": "preview",
            "source": {},
        },
    )
    assert response.status_code == 200, response.text
    plan = response.json()["approval_plan"]
    assert plan["mode"] == "N_OF_M"
    assert plan["group_id"] == group["id"]
    assert plan["required"] == 2
    assert plan["members"] == [
        env.users["approver"]["id"],
        env.users["stranger"]["id"],
    ]
