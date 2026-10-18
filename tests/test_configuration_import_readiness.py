"""G9 configuration migration-readiness contract: metadata-only, never writes."""

from __future__ import annotations

import copy

import pytest


def manifest_for_external_policy(env):
    exported = env.human("admin").get("/api/v1/integrations/configuration-export")
    assert exported.status_code == 200
    source = copy.deepcopy(exported.json())
    source["integrations"] = [
        {
            "id": "foreign-integration",
            "name": "Source integration not configured here",
            "kind": "datarelay",
            "tenant": "",
            "enabled": True,
        },
    ]
    policy = source["policies"][0]
    policy.update(
        profile_id="foreign-policy",
        name="Imported payment approval policy",
        integration_id="foreign-integration",
        approval_mode="ALL",
        approver_group_id="foreign-approval-group",
        email_template_id="foreign-template",
        lifecycle="ACTIVE",
    )
    source["policies"] = [policy]
    source["templates"] = [{
        "id": "foreign-template",
        "name": "Imported notification without body",
        "enabled": True,
        "event_types": ["requested"],
    }]
    return source


def requirements_for(result, kind):
    return [item for item in result["requirements"] if item["kind"] == kind]


def test_import_preview_produces_manual_prerequisite_plan_without_mutation(env):
    admin = env.human("admin")
    before = admin.get("/api/v1/integrations/configuration-export").json()
    incoming = manifest_for_external_policy(env)

    response = admin.post("/api/v1/admin/configuration/preview", json=incoming)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["preview_only"] is True
    assert result["can_apply"] is False
    assert result["readiness"] == {
        "automatic_apply_available": False,
        "manual_review_only": True,
        "required_actions": len(result["requirements"]),
    }
    integration_reasons = {item["reason"] for item in requirements_for(result, "integration")}
    assert "connection_and_credential_setup_required" in integration_reasons
    policy_reasons = {item["reason"] for item in requirements_for(result, "policy")}
    assert "approver_mapping_required" in policy_reasons
    assert "approver_group_mapping_required" in policy_reasons
    assert "integration_configuration_required" in policy_reasons
    assert "notification_template_mapping_required" in policy_reasons
    assert "active_policy_requires_explicit_reapproval" in policy_reasons
    template_reasons = {item["reason"] for item in requirements_for(result, "template")}
    assert "notification_content_required" in template_reasons
    for item in result["requirements"]:
        assert set(item) == {"kind", "name", "reason", "operator_action"}
        assert len(item["operator_action"]) >= 10

    # This endpoint never creates source IDs, alters live policies or logs approvals.
    after = admin.get("/api/v1/integrations/configuration-export").json()
    assert after == before
    assert "foreign-integration" not in repr(after)
    assert "foreign-policy" not in repr(after)
    assert "foreign-template" not in repr(after)


def test_local_existing_metadata_is_explicitly_reported_as_conflicting(env):
    admin = env.human("admin")
    manifest = admin.get("/api/v1/integrations/configuration-export").json()
    response = admin.post("/api/v1/admin/configuration/preview", json=manifest)
    assert response.status_code == 200
    result = response.json()
    assert result["conflicts"]
    assert any(item["reason"] == "existing_identity_or_name" for item in result["requirements"])
    assert result["readiness"]["automatic_apply_available"] is False
    assert result["can_apply"] is False


@pytest.mark.parametrize("category,id_key", [
    ("integrations", "id"),
    ("policies", "profile_id"),
    ("templates", "id"),
])
@pytest.mark.parametrize("different_case", [False, True])
def test_source_duplicate_names_with_different_ids_are_rejected(
    env, category, id_key, different_case,
):
    admin = env.human("admin")
    source = manifest_for_external_policy(env)
    first = source[category][0]
    duplicate = {
        **first,
        id_key: "different-source-id",
        "name": first["name"].upper() if different_case else first["name"],
    }
    source[category].append(duplicate)
    response = admin.post("/api/v1/admin/configuration/preview", json=source)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "CONFIGURATION_PREVIEW_UNSAFE"


def test_unmapped_integration_never_becomes_auto_creatable_policy(env):
    admin = env.human("admin")
    source = manifest_for_external_policy(env)
    source["integrations"] = []
    source["policies"][0]["integration_id"] = "totally-unknown-source"
    response = admin.post("/api/v1/admin/configuration/preview", json=source)
    assert response.status_code == 200, response.text
    result = response.json()
    assert any(row["reason"] == "integration_mapping_required" for row in result["conflicts"])
    assert any(row["reason"] == "integration_mapping_required" for row in result["requirements"])
    assert result["can_apply"] is False


def test_only_current_administrator_may_obtain_migration_plan(env):
    source = manifest_for_external_policy(env)
    assert env.human("requester").post("/api/v1/admin/configuration/preview", json=source).status_code == 403
    assert env.api.post("/api/v1/admin/configuration/preview", json=source).status_code == 403


def test_no_policy_auto_activation_even_if_source_claims_active(env):
    admin = env.human("admin")
    source = manifest_for_external_policy(env)
    source["policies"][0]["lifecycle"] = "ACTIVE"
    result = admin.post("/api/v1/admin/configuration/preview", json=source).json()
    assert result["can_apply"] is False
    assert any(row["reason"] == "active_policy_requires_explicit_reapproval" for row in result["requirements"])
    assert admin.get("/api/v1/integrations/configuration-export").json()["policies"][0]["lifecycle"] != "IMPORTED_AUTO_ACTIVE"
