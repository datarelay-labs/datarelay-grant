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
    if len({row["id"] for row in integrations}) != len(integrations):
        _invalid()
    if len({row["profile_id"] for row in policies}) != len(policies):
        _invalid()
    if len({row["id"] for row in templates}) != len(templates):
        _invalid()

    conflicts = []
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
        # Unmapped identities would require a deliberately reviewed operator
        # mapping and cannot be assigned automatically.
        known = {
            item["id"] for item in conn.execute("SELECT id FROM integrations")
        }
        expected = {item["id"] for item in integrations}
        for policy in policies:
            if policy["integration_id"] not in known | expected:
                conflicts.append({
                    "kind": "policy", "name": policy["name"],
                    "reason": "integration_mapping_required",
                })
    return {
        "schema_version": 1,
        "preview_only": True,
        "can_apply": False,
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
