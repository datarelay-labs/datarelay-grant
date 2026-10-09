"""G9 version-2 portable policy/template configuration, reviewed Draft imports only.

This is deliberately NOT the legacy schema-v1 secret-free metadata preview.
It never imports integration destinations, credentials, users or groups, and
never activates an imported approval policy or sends external notifications.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .auth import Principal, require_current_authority
from .core import Core
from .db import Database, audit, json_text, uid
from .errors import GrantError
from .models import (
    Input,
    NotificationEvent,
    NotificationEventTemplate,
    NotificationTemplateSet,
    Profile,
)

MAX_PACKAGE_BYTES = 400_000
MAX_ITEMS = 30


class V2Integration(Input):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["datarelay", "stellar"]
    tenant: str = Field(default="", max_length=200)


class V2Template(Input):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    templates: dict[NotificationEvent, NotificationEventTemplate]

    @model_validator(mode="after")
    def complete(self):
        NotificationTemplateSet(name=self.name, templates=self.templates)
        return self


class V2Policy(Input):
    id: str = Field(min_length=1, max_length=100)
    source_lifecycle: Literal["DRAFT", "TESTING", "ACTIVE", "DISABLED"]
    config: Profile


class V2Package(Input):
    schema_version: Literal[2]
    format: Literal["grant.configuration"]
    credential_material_included: Literal[False]
    integrations: list[V2Integration] = Field(max_length=MAX_ITEMS)
    templates: list[V2Template] = Field(max_length=MAX_ITEMS)
    policies: list[V2Policy] = Field(max_length=MAX_ITEMS)

    @model_validator(mode="after")
    def consistent_source(self):
        if not self.templates and not self.policies:
            raise ValueError("A portable bundle needs templates or policies")
        for collection, name in (
            (self.integrations, "integration"),
            (self.templates, "template"),
            (self.policies, "policy"),
        ):
            ids = [item.id for item in collection]
            names = [item.name if name != "policy" else item.config.name for item in collection]
            if len(set(ids)) != len(ids) or len({v.casefold() for v in names}) != len(names):
                raise ValueError("Ambiguous source identity/name")
        integrations = {i.id for i in self.integrations}
        templates = {i.id for i in self.templates}
        for p in self.policies:
            if p.config.integration_id not in integrations:
                raise ValueError("Policy references unexported integration")
            if p.config.email_template_id and p.config.email_template_id not in templates:
                raise ValueError("Policy references unexported notification templates")
            if p.config.approval_mode == "SINGLE" and p.config.approver_group_id is not None:
                raise ValueError("SINGLE policy may not reference approver group")
        return self


class V2Mappings(Input):
    integrations: dict[str, str] = Field(default_factory=dict, max_length=MAX_ITEMS)
    approvers: dict[str, str] = Field(default_factory=dict, max_length=MAX_ITEMS)
    groups: dict[str, str] = Field(default_factory=dict, max_length=MAX_ITEMS)

    @field_validator("integrations", "approvers", "groups")
    @classmethod
    def bounded_ids(cls, value: dict[str, str]) -> dict[str, str]:
        if any(
            not 1 <= len(key) <= 100 or not 1 <= len(ident) <= 100
            or any(ord(c) < 32 for c in key + ident)
            for key, ident in value.items()
        ):
            raise ValueError("Mappings require bounded source and local IDs")
        return value


class V2PreviewInput(Input):
    bundle: V2Package
    mappings: V2Mappings


class V2ImportInput(V2PreviewInput):
    preview_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    confirmation: Literal["IMPORT_DRAFTS_ONLY"]


def _json(value: object) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _bound(payload: object) -> None:
    if len(_json(payload).encode("utf-8")) > MAX_PACKAGE_BYTES:
        raise GrantError("CONFIGURATION_V2_TOO_LARGE", 413)


def _deny(actor: Principal) -> None:
    actor.require_admin()
    if actor.kind != "human":
        raise GrantError("HUMAN_REQUIRED", 403)


def export_v2(db: Database, actor: Principal) -> dict:
    _deny(actor)
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        rows = conn.execute(
            """SELECT v.* FROM profile_versions v
               WHERE version=(SELECT MAX(version) FROM profile_versions
                              WHERE profile_id=v.profile_id)
               ORDER BY name,profile_id"""
        ).fetchall()
        policies = []
        for row in rows:
            settings = {
                key: (bool(row[key]) if key == "denial_reason_required" else row[key])
                for key in Profile.model_fields
            }
            policy = V2Policy.model_validate({
                "id": row["profile_id"],
                "source_lifecycle": row["lifecycle"],
                "config": settings,
            })
            policies.append(policy.model_dump())
        used_integrations = {item["config"]["integration_id"] for item in policies}
        integrations = [
            dict(row)
            for row in conn.execute(
                "SELECT id,name,kind,tenant FROM integrations ORDER BY name,id"
            ).fetchall()
            if row["id"] in used_integrations
        ]
        templates = []
        for row in conn.execute(
            "SELECT id,name,event_templates FROM email_templates ORDER BY name,id"
        ).fetchall():
            template = V2Template.model_validate({
                "id": row["id"], "name": row["name"],
                "templates": json.loads(row["event_templates"]),
            })
            templates.append(template.model_dump())
    artifact = V2Package.model_validate({
        "schema_version": 2,
        "format": "grant.configuration",
        "credential_material_included": False,
        "integrations": integrations,
        "templates": templates,
        "policies": policies,
    }).model_dump()
    _bound(artifact)
    return artifact


def _build_plan(conn, actor: Principal, request: V2PreviewInput) -> dict:
    """Compute entire digest and mapping/conflict plan from CURRENT target state."""
    require_current_authority(conn, actor)
    package = request.bundle
    mappings = request.mappings
    issues: list[dict] = []
    observed: list[dict] = []

    def error(kind: str, name: str, reason: str) -> None:
        issues.append({"kind": kind, "name": name, "reason": reason})

    def source_map(kind: str, actual_sources: set[str], supplied: dict[str, str]) -> None:
        if set(supplied) != actual_sources or len(set(supplied.values())) != len(supplied):
            error(kind, kind, "source_identity_mapping_invalid")

    source_map("integration", {x.id for x in package.integrations}, mappings.integrations)
    source_map("approver", {x.config.approver_id for x in package.policies}, mappings.approvers)
    source_map(
        "group",
        {x.config.approver_group_id for x in package.policies if x.config.approval_mode != "SINGLE"},
        mappings.groups,
    )

    for integration in package.integrations:
        dest = mappings.integrations.get(integration.id)
        row = conn.execute(
            "SELECT id,kind,tenant,enabled FROM integrations WHERE id=?", (dest,),
        ).fetchone()
        observable = dict(row) if row else None
        observed.append({"kind": "integration", "source": integration.id, "target": observable})
        if not row or not row["enabled"]:
            error("integration", integration.name, "integration_mapping_unavailable")
        elif row["kind"] != integration.kind or row["tenant"] != integration.tenant:
            error("integration", integration.name, "integration_kind_or_tenant_mismatch")

    for source, dest in sorted(mappings.approvers.items()):
        row = conn.execute("SELECT id,enabled FROM users WHERE id=?", (dest,)).fetchone()
        observed.append({"kind": "approver", "source": source, "target": dict(row) if row else None})
        if not row or not row["enabled"]:
            error("approver", source, "approver_mapping_unavailable")

    for source, dest in sorted(mappings.groups.items()):
        row = conn.execute(
            "SELECT id,enabled FROM approver_groups WHERE id=?", (dest,),
        ).fetchone()
        members = conn.execute(
            """SELECT m.user_id,u.enabled FROM approver_group_members m
               JOIN users u ON u.id=m.user_id WHERE m.group_id=?
               ORDER BY m.position""", (dest,),
        ).fetchall() if row else []
        observed.append({
            "kind": "group", "source": source,
            "target": dict(row) if row else None,
            "members": [dict(m) for m in members],
        })
        if not row or not row["enabled"] or not members or any(not m["enabled"] for m in members):
            error("group", source, "group_mapping_unavailable")

    existing_policies = [
        x[0].casefold() for x in conn.execute("SELECT name FROM profiles").fetchall()
    ]
    existing_templates = [
        x[0].casefold() for x in conn.execute("SELECT name FROM email_templates").fetchall()
    ]
    observed.append({"existing_policy_names": sorted(existing_policies)})
    observed.append({"existing_template_names": sorted(existing_templates)})

    for template in package.templates:
        if template.name.casefold() in existing_templates:
            error("template", template.name, "name_collision")
    for policy in package.policies:
        body = policy.config
        if body.name.casefold() in existing_policies:
            error("policy", body.name, "name_collision")
        if body.integration_id not in mappings.integrations:
            error("policy", body.name, "integration_mapping_required")
        if body.approver_id not in mappings.approvers:
            error("policy", body.name, "approver_mapping_required")
        if body.approval_mode != "SINGLE":
            mapped_group_id = mappings.groups.get(body.approver_group_id or "")
            if not mapped_group_id:
                error("policy", body.name, "group_mapping_required")
            else:
                members = next(
                    (ref.get("members", []) for ref in observed
                     if ref.get("kind") == "group" and ref.get("source") == body.approver_group_id),
                    [],
                )
                if body.approval_mode == "N_OF_M" and (
                    body.approvals_required is None or
                    body.approvals_required > len(members)
                ):
                    error("policy", body.name, "approval_quorum_invalid")
    serialized = {
        "actor_id": actor.id,
        "bundle": package.model_dump(mode="json"),
        "mappings": mappings.model_dump(mode="json"),
        "destination_state": observed,
    }
    digest = hashlib.sha256(_json(serialized).encode("utf-8")).hexdigest()
    return {
        "schema_version": 2,
        "preview_only": True,
        "can_import_drafts": not issues,
        "will_activate": False,
        "preview_digest": digest,
        "summary": {
            "integrations": len(package.integrations),
            "policies": len(package.policies),
            "templates": len(package.templates),
        },
        "conflicts": issues,
        "warnings": [
            "This preview does not authorize an import or policy activation.",
            "Integration credentials, SMTP and callback destinations never migrate.",
            "All policy imports will remain disabled DRAFT until separately tested and activated.",
            "Complete message text must be reviewed before import.",
        ],
    }


def preview_v2(db: Database, actor: Principal, request: V2PreviewInput) -> dict:
    _deny(actor)
    _bound(request.model_dump(mode="json"))
    with db.transaction(write=False) as conn:
        return _build_plan(conn, actor, request)


def import_v2(db: Database, core: Core, actor: Principal, request: V2ImportInput) -> dict:
    _deny(actor)
    _bound(request.model_dump(mode="json"))
    try:
        with db.transaction(write=True) as conn:
            plan = _build_plan(conn, actor, request)
            if not plan["can_import_drafts"]:
                raise GrantError("CONFIGURATION_V2_CONFLICT", 409)
            if plan["preview_digest"] != request.preview_digest:
                raise GrantError("CONFIGURATION_V2_PREVIEW_STALE", 409)

            template_ids: dict[str, str] = {}
            now = time.time()
            for incoming in request.bundle.templates:
                ident = uid()
                serialized = {
                    event: data.model_dump() for event, data in incoming.templates.items()
                }
                conn.execute(
                    """INSERT INTO email_templates(
                       id,name,subject_template,body_template,reminder_subject_template,
                       reminder_body_template,event_templates,sender_display_name,
                       enabled,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,?,1,?,?)""",
                    (
                        ident, incoming.name,
                        serialized["requested"]["subject"], serialized["requested"]["body"],
                        serialized["reminder"]["subject"], serialized["reminder"]["body"],
                        json_text(serialized), "DataRelay Grant", now, now,
                    ),
                )
                template_ids[incoming.id] = ident

            policy_ids = []
            for incoming in request.bundle.policies:
                source = incoming.config
                body = Profile.model_validate({
                    **source.model_dump(),
                    "integration_id": request.mappings.integrations[source.integration_id],
                    "approver_id": request.mappings.approvers[source.approver_id],
                    "approver_group_id": (
                        request.mappings.groups[source.approver_group_id]
                        if source.approval_mode != "SINGLE" else None
                    ),
                    "email_template_id": (
                        template_ids[source.email_template_id]
                        if source.email_template_id else None
                    ),
                })
                core._validate_profile_refs(conn, body)
                ident = uid()
                conn.execute(
                    """INSERT INTO profiles(
                       id,name,integration_id,approver_id,approval_mode,approver_group_id,
                       approvals_required,action_kind,email_template_id,deadline_seconds,
                       reminder_seconds,max_reminders,grant_seconds,enabled
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
                    (
                        ident, body.name, body.integration_id, body.approver_id,
                        body.approval_mode, body.approver_group_id, body.approvals_required,
                        body.action_kind, body.email_template_id,
                        body.deadline_seconds, body.reminder_seconds,
                        body.max_reminders, body.grant_seconds,
                    ),
                )
                core._insert_profile_version(conn, ident, 1, body, lifecycle="DRAFT")
                policy_ids.append(ident)
            audit(
                conn, None, actor.id, "configuration.v2_drafts_imported",
                {
                    "policies": len(policy_ids), "templates": len(template_ids),
                    "preview_digest": plan["preview_digest"],
                    "activated": False,
                },
            )
    except sqlite3.IntegrityError:
        raise GrantError("CONFIGURATION_V2_CONFLICT", 409) from None
    return {
        "schema_version": 2,
        "imported": {
            "policies": len(policy_ids),
            "templates": len(template_ids),
        },
        "policy_ids": policy_ids,
        "template_ids": list(template_ids.values()),
        "all_policies_draft": True,
        "activated": False,
    }
