"""Fail-closed, read-only G9 portability conflict preview; never imports a policy."""

from __future__ import annotations

from .auth import Principal, require_current_authority
from .db import Database
from .errors import GrantError

INTEGRATION_FIELDS = {"id", "name", "kind", "tenant", "enabled"}
POLICY_FIELDS = {
    "profile_id", "version", "name", "integration_id", "approval_mode",
    "approver_group_id", "approvals_required", "action_kind", "email_template_id",
    "lifecycle", "tenant_selector", "environment", "severity", "risk_level",
    "deadline_seconds", "reminder_seconds", "max_reminders", "grant_seconds",
}
TEMPLATE_FIELDS = {"id", "name", "enabled", "event_types"}
ROOT_FIELDS = {
    "schema_version", "secret_free", "import_supported",
    "executable_restore_bundle", "integrations", "policies",
    "templates", "warning",
}
MODES = {"SINGLE", "ANY_ONE", "ALL", "N_OF_M", "SEQUENTIAL"}
LIFECYCLES = {"DRAFT", "TESTING", "ACTIVE", "DISABLED"}


def _invalid() -> None:
    raise GrantError("CONFIGURATION_PREVIEW_UNSAFE", 422)


def _record(record: object, fields: set[str]) -> dict:
    if not isinstance(record, dict) or set(record) - fields or set(record) != fields:
        _invalid()
    for field, value in record.items():
        if field in {"enabled"}:
            if type(value) is not bool:
                _invalid()
        elif field in {"version", "deadline_seconds", "reminder_seconds", "max_reminders", "grant_seconds"}:
            if type(value) is not int or value < 0 or value > 86400000:
                _invalid()
        elif field in {"approvals_required"}:
            if value is not None and (
                type(value) is not int or value < 1 or value > 100
            ):
                _invalid()
        elif field in {"approver_group_id", "email_template_id"}:
            if value is not None and (not isinstance(value, str) or len(value) > 250):
                _invalid()
        elif field == "event_types":
            if not isinstance(value, list) or len(value) > 15 or any(
                not isinstance(item, str) or len(item) > 40 for item in value
            ):
                _invalid()
        elif (
            (not isinstance(value, str) or not value or len(value) > 250)
            and (
                field not in {"tenant", "tenant_selector", "environment", "severity", "risk_level"}
                or value != ""
            )
        ):
            _invalid()
    if record.get("kind", "datarelay") not in {"datarelay", "stellar"}:
        _invalid()
    if record.get("approval_mode", "SINGLE") not in MODES:
        _invalid()
    if record.get("lifecycle", "DRAFT") not in LIFECYCLES:
        _invalid()
    return record


def preview_configuration(db: Database, actor: Principal, payload: object) -> dict:
    actor.require_admin()
    if not isinstance(payload, dict) or set(payload) != ROOT_FIELDS:
        _invalid()
    if (
        type(payload["schema_version"]) is not int
        or payload["schema_version"] != 1
        or payload["secret_free"] is not True
        or payload["import_supported"] is not False
        or payload["executable_restore_bundle"] is not False
    ):
        _invalid()
    if not isinstance(payload["warning"], str) or len(payload["warning"]) > 500:
        _invalid()
    for key in ("integrations", "policies", "templates"):
        if not isinstance(payload[key], list) or len(payload[key]) > 100:
            _invalid()
    integrations = [
        _record(row, INTEGRATION_FIELDS) for row in payload["integrations"]
    ]
    policies = [_record(row, POLICY_FIELDS) for row in payload["policies"]]
    templates = [_record(row, TEMPLATE_FIELDS) for row in payload["templates"]]
    # Metadata from other installations is not a deployable source of truth.
    # Duplicate source names are ambiguous even when their IDs are distinct;
    # never infer which configuration a policy or notification refers to.
    for records, key in (
        (integrations, "id"), (policies, "profile_id"), (templates, "id"),
    ):
        if len({row[key] for row in records}) != len(records):
            _invalid()
        if len({row["name"].casefold() for row in records}) != len(records):
            _invalid()

    conflicts: list[dict[str, str]] = []
    requirements: list[dict[str, str]] = []

    def require(kind: str, name: str, reason: str, action: str) -> None:
        requirements.append({
            "kind": kind, "name": name,
            "reason": reason, "operator_action": action,
        })
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        for kind, table, id_key, records in (
            ("integration", "integrations", "id", integrations),
            ("policy", "profiles", "profile_id", policies),
            ("template", "email_templates", "id", templates),
        ):
            for row in records:
                collision = conn.execute(
                    f"SELECT id FROM {table} WHERE id=? OR name=? LIMIT 1",
                    (row[id_key], row["name"]),
                ).fetchone()
                if collision:
                    conflicts.append({
                        "kind": kind, "name": row["name"],
                        "reason": "existing_identity_or_name",
                    })
                    require(
                        kind, row["name"], "existing_identity_or_name",
                        "Review the destination record and choose an explicit "
                        "identity mapping or rename before any future import.",
                    )
        # Unmapped identities would require a deliberately reviewed operator
        # mapping and cannot be assigned automatically.
        known = {
            item["id"] for item in conn.execute("SELECT id FROM integrations")
        }
        expected = {item["id"] for item in integrations}
        for integration in integrations:
            require(
                "integration", integration["name"],
                "connection_and_credential_setup_required",
                "Register or review the integration destination, callback "
                "configuration and scoped credentials with an administrator; "
                "this metadata file contains none of those private settings.",
            )
        for policy in policies:
            require(
                "policy", policy["name"], "approver_mapping_required",
                "Select authorized local approvers and verify the approval "
                "plan before saving a new policy draft.",
            )
            if policy["approver_group_id"]:
                require(
                    "policy", policy["name"], "approver_group_mapping_required",
                    "Select an existing local approver group and verify "
                    "membership; source group IDs cannot be reused.",
                )
            if policy["integration_id"] not in known | expected:
                conflicts.append({
                    "kind": "policy", "name": policy["name"],
                    "reason": "integration_mapping_required",
                })
                require(
                    "policy", policy["name"], "integration_mapping_required",
                    "Map this policy to an existing permitted local integration "
                    "before configuring a policy draft.",
                )
            elif policy["integration_id"] not in known:
                require(
                    "policy", policy["name"], "integration_configuration_required",
                    "Complete the referenced integration's destination and "
                    "credentials before an imported policy can be configured.",
                )
            if policy["email_template_id"] is not None:
                require(
                    "policy", policy["name"], "notification_template_mapping_required",
                    "Map the notification template to a local complete event "
                    "template set with reviewed message content.",
                )
            if policy["lifecycle"] == "ACTIVE":
                require(
                    "policy", policy["name"], "active_policy_requires_explicit_reapproval",
                    "Create a non-active policy draft, test its approvers "
                    "and rules, then require explicit administrator activation.",
                )
        for template in templates:
            require(
                "template", template["name"], "notification_content_required",
                "Provide and review every notification event body and allowed "
                "variables; the exported manifest contains event names only.",
            )
    return {
        "schema_version": 1,
        "preview_only": True,
        "can_apply": False,
        "readiness": {
            "automatic_apply_available": False,
            "manual_review_only": True,
            "required_actions": len(requirements),
        },
        "requirements": requirements,
        "summary": {
            "integrations": len(integrations),
            "policies": len(policies),
            "templates": len(templates),
        },
        "conflicts": conflicts,
        "warnings": [
            "Review mapped approvers, callback destinations and templates before any import.",
            "This endpoint never creates, activates, disables, or modifies configuration.",
            "No credentials, message bodies, secrets or external actions are imported.",
        ],
    }
