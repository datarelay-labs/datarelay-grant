
def policy_payload(env, *, action_kind="service.patch", **overrides):
    return {
        "name": "Patch approval",
        "integration_id": env.integration["id"],
        "approver_id": env.users["approver"]["id"],
        "action_kind": action_kind,
        "email_template_id": None,
        "deadline_seconds": 86400,
        "reminder_seconds": 3600,
        "max_reminders": 3,
        "grant_seconds": 900,
        "tenant_selector": "",
        "environment": "",
        "severity": "",
        "risk_level": "",
        **overrides,
    }


def sample(env, *, action_kind="service.patch", **source):
    return {
        "integration_id": env.integration["id"],
        "action_kind": action_kind,
        "title": "Patch test service",
        "target": "test-service",
        "reason": "maintenance",
        "source": source,
    }


def intake(env, policy_id, *, external_id, action_kind="service.patch", **source):
    return {
        "external_id": external_id,
        "profile_id": policy_id,
        "title": "Patch test service",
        "action": {
            "kind": action_kind,
            "target": "test-service",
            "parameters": {"reason_code": 7},
        },
        "source": source,
        "reason": "maintenance",
    }


def test_policy_lifecycle_versioned_edit_and_isolated_test(env):
    admin = env.human("admin")

    created = admin.post("/api/v1/profiles", json=policy_payload(env))
    assert created.status_code == 201, created.text
    policy = created.json()
    assert policy["lifecycle"] == "DRAFT"
    assert policy["version"] == 1

    blocked = env.api.post(
        "/api/v1/requests",
        json=intake(env, policy["id"], external_id="draft-must-not-run"),
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "PROFILE_SELECTION_MISMATCH"

    testing = admin.post(f"/api/v1/profiles/{policy["id"]}/test")
    assert testing.status_code == 200, testing.text
    assert testing.json()["lifecycle"] == "TESTING"

    isolated = admin.post(
        f"/api/v1/profiles/{policy["id"]}/test-request",
        json=sample(env, environment="prod", severity="high", risk_level="high"),
    )
    assert isolated.status_code == 200, isolated.text
    assert isolated.json()["execution_allowed"] is False
    assert isolated.json()["test_mode"] is True
    assert isolated.json()["policy"]["id"] == policy["id"]

    active = admin.post(f"/api/v1/profiles/{policy["id"]}/activate")
    assert active.status_code == 200, active.text
    assert active.json()["lifecycle"] == "ACTIVE"

    first = env.api.post(
        "/api/v1/requests",
        json=intake(env, policy["id"], external_id="active-v1"),
    )
    assert first.status_code == 202, first.text
    first_row = first.json()
    assert first_row["policy_version"] == 1

    edited = admin.put(
        f"/api/v1/profiles/{policy["id"]}",
        json=policy_payload(env, deadline_seconds=120),
    )
    assert edited.status_code == 200, edited.text
    draft_v2 = edited.json()
    assert draft_v2["id"] == policy["id"]
    assert draft_v2["version"] == 2
    assert draft_v2["lifecycle"] == "DRAFT"

    still_v1 = env.api.post(
        "/api/v1/requests",
        json=intake(env, policy["id"], external_id="still-v1"),
    )
    assert still_v1.status_code == 202, still_v1.text
    assert still_v1.json()["policy_version"] == 1
    assert still_v1.json()["deadline"] - still_v1.json()["created_at"] > 86000

    assert admin.post(f"/api/v1/profiles/{policy["id"]}/test").json()["version"] == 2
    activated_v2 = admin.post(f"/api/v1/profiles/{policy["id"]}/activate")
    assert activated_v2.status_code == 200, activated_v2.text
    assert activated_v2.json()["version"] == 2
    assert activated_v2.json()["lifecycle"] == "ACTIVE"

    second = env.api.post(
        "/api/v1/requests",
        json=intake(env, policy["id"], external_id="active-v2"),
    )
    assert second.status_code == 202, second.text
    assert second.json()["policy_version"] == 2
    assert second.json()["deadline"] - second.json()["created_at"] <= 121

    preserved = env.api.get(f"/api/v1/requests/{first_row["id"]}")
    assert preserved.status_code == 200
    assert preserved.json()["policy_version"] == 1

    history = admin.get(f"/api/v1/profiles/{policy["id"]}/history")
    assert history.status_code == 200, history.text
    versions = history.json()["versions"]
    assert [(row["version"], row["lifecycle"]) for row in versions] == [
        (2, "ACTIVE"),
        (1, "DISABLED"),
    ]
    assert any(event["action"] == "profile.activated" for event in history.json()["events"])

    clone = admin.post(f"/api/v1/profiles/{policy["id"]}/clone")
    assert clone.status_code == 201, clone.text
    assert clone.json()["id"] != policy["id"]
    assert clone.json()["version"] == 1
    assert clone.json()["lifecycle"] == "DRAFT"


def test_runtime_and_preview_share_deterministic_matching(env):
    admin = env.human("admin")

    wildcard = admin.post(
        "/api/v1/profiles",
        json=policy_payload(env, action_kind="service.deploy", name="Deploy fallback"),
    ).json()
    assert admin.post(f"/api/v1/profiles/{wildcard["id"]}/test").status_code == 200
    assert admin.post(f"/api/v1/profiles/{wildcard["id"]}/activate").status_code == 200

    prod = admin.post(
        "/api/v1/profiles",
        json=policy_payload(
            env,
            action_kind="service.deploy",
            name="Deploy production",
            environment="prod",
            severity="high",
        ),
    ).json()
    assert admin.post(f"/api/v1/profiles/{prod["id"]}/test").status_code == 200
    assert admin.post(f"/api/v1/profiles/{prod["id"]}/activate").status_code == 200

    preview = admin.post(
        "/api/v1/profiles/preview",
        json=sample(
            env,
            action_kind="service.deploy",
            environment="prod",
            severity="high",
            risk_level="medium",
        ),
    )
    assert preview.status_code == 200, preview.text
    result = preview.json()
    assert result["policy"]["id"] == prod["id"]
    assert result["resolution"]["matched"] is True
    assert result["resolution"]["specificity"] == 2

    runtime = env.api.post(
        "/api/v1/requests",
        json=intake(
            env,
            prod["id"],
            external_id="matched-prod",
            action_kind="service.deploy",
            environment="prod",
            severity="high",
            risk_level="medium",
        ),
    )
    assert runtime.status_code == 202, runtime.text
    assert runtime.json()["profile_id"] == result["policy"]["id"]
    assert runtime.json()["policy_version"] == result["policy"]["version"]

    wrong = env.api.post(
        "/api/v1/requests",
        json=intake(
            env,
            wildcard["id"],
            external_id="cannot-pick-weaker",
            action_kind="service.deploy",
            environment="prod",
            severity="high",
        ),
    )
    assert wrong.status_code == 409
    assert wrong.json()["error"]["code"] == "PROFILE_SELECTION_MISMATCH"

    tie = admin.post(
        "/api/v1/profiles",
        json=policy_payload(
            env,
            action_kind="service.deploy",
            name="Deploy production duplicate",
            environment="prod",
            severity="high",
        ),
    ).json()
    assert admin.post(f"/api/v1/profiles/{tie["id"]}/test").status_code == 200
    assert admin.post(f"/api/v1/profiles/{tie["id"]}/activate").status_code == 200

    conflict_preview = admin.post(
        "/api/v1/profiles/preview",
        json=sample(env, action_kind="service.deploy", environment="prod", severity="high"),
    )
    assert conflict_preview.status_code == 409
    assert conflict_preview.json()["error"]["code"] == "POLICY_MATCH_CONFLICT"

    conflict_runtime = env.api.post(
        "/api/v1/requests",
        json=intake(
            env,
            prod["id"],
            external_id="runtime-conflict",
            action_kind="service.deploy",
            environment="prod",
            severity="high",
        ),
    )
    assert conflict_runtime.status_code == 409
    assert conflict_runtime.json()["error"]["code"] == "POLICY_MATCH_CONFLICT"
