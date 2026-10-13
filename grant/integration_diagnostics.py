"""Read-only integration management projections from authoritative Grant records."""

from __future__ import annotations

import json

from .auth import Principal, require_current_authority
from .db import Database
from .errors import GrantError


def diagnostics(db: Database, actor: Principal, ident: str) -> dict:
    actor.require_admin()
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        row = conn.execute(
            "SELECT id,name,kind,tenant,enabled FROM integrations WHERE id=?",
            (ident,),
        ).fetchone()
        if not row:
            raise GrantError("INTEGRATION_NOT_FOUND", 404)
        current = conn.execute(
            """SELECT COUNT(*) AS count,MAX(created_at) AS last_created_at
               FROM requests WHERE integration_id=?""",
            (ident,),
        ).fetchone()
        transport = conn.execute(
            """SELECT MAX(o.delivered_at) AS accepted
               FROM outbox o JOIN requests r ON r.id=o.request_id
               WHERE r.integration_id=? AND o.kind='webhook'
                 AND o.state='DELIVERED'""",
            (ident,),
        ).fetchone()
        # Same unresolved-failure definition as G7's Operations summary:
        # only the most recent webhook per request can remain failed.
        failed_events = conn.execute(
            """SELECT COUNT(*) FROM requests r
               WHERE r.integration_id=? AND (
                 SELECT o.state FROM outbox o
                 WHERE o.request_id=r.id AND o.kind='webhook'
                 ORDER BY o.created_at DESC,o.id DESC LIMIT 1
               )='FAILED'""",
            (ident,),
        ).fetchone()[0]
        # Outbox available_at is the *next retry time*, not a failure timestamp.
        # Worker audits record real attempt time without exposing destination data.
        failed_at = conn.execute(
            """SELECT MAX(a.at) FROM audit a
               JOIN requests r ON r.id=a.request_id
               WHERE r.integration_id=? AND a.action='delivery.failed'
                 AND json_extract(a.detail,'$.kind')='webhook'""",
            (ident,),
        ).fetchone()[0]
        latest = conn.execute(
            """SELECT o.state FROM outbox o JOIN requests r ON r.id=o.request_id
               WHERE r.integration_id=? AND o.kind='webhook'
               ORDER BY o.created_at DESC,o.id DESC LIMIT 1""",
            (ident,),
        ).fetchone()
        tokens = conn.execute(
            """SELECT id,scopes,enabled,created_at FROM api_tokens
               WHERE integration_id=? ORDER BY created_at DESC,id DESC""",
            (ident,),
        ).fetchall()
        credentials = []
        for token in tokens:
            scopes = json.loads(token["scopes"])
            produces = "request:create" in scopes
            observes = "request:read" in scopes
            executes = any(s in scopes for s in ("grant:consume", "result:write"))
            # request:read is a neutral scope used by both producer and
            # executor. It alone is an observer, not creation authority.
            role = (
                "mixed" if produces and executes
                else "producer" if produces
                else "executor" if executes
                else "observer" if observes
                else "unclassified"
            )
            credentials.append({
                "id": token["id"],
                "scopes": scopes,
                "role": role,
                "enabled": bool(token["enabled"]),
                "created_at": token["created_at"],
            })
        # Non-executing, administrator-scoped readiness of the INSTALLED
        # Grant configuration. Never elevate transport or test fixtures into
        # Control's actual atomic effect / Stellar receiver acceptance.
        active_policy = bool(row["enabled"]) and conn.execute(
            """SELECT 1 FROM profile_versions pv
               JOIN profiles p ON p.id=pv.profile_id
               WHERE pv.integration_id=? AND pv.lifecycle='ACTIVE'
                 AND p.enabled=1 LIMIT 1""",
            (ident,),
        ).fetchone() is not None
        enabled_tokens = [json.loads(token["scopes"]) for token in tokens if token["enabled"]]
        producer = any(
            "request:create" in scopes and
            "grant:consume" not in scopes and "result:write" not in scopes
            for scopes in enabled_tokens
        )
        executor = any(
            "request:create" not in scopes and
            {"request:read", "grant:consume", "result:write"}.issubset(scopes)
            for scopes in enabled_tokens
        )
        mixed = sum(
            "request:create" in scopes and
            bool({"grant:consume", "result:write"}.intersection(scopes))
            for scopes in enabled_tokens
        )
        stellar = row["kind"] == "stellar"
        external_readiness = {
            "schema_version": 1,
            "scope": "pre_live_configuration_only",
            "active_policy": active_policy,
            "separate_producer": producer,
            "separate_executor": None if stellar else executor,
            "mixed_credentials": mixed,
            "tenant_bound": bool(row["tenant"]) if stellar else None,
            "native_execution_guard": "not_applicable" if stellar else "not_verified",
            "receiver_readback": "not_verified" if stellar else "not_applicable",
            "independent_effect_readback": "not_verified",
            "live_effect_authorized": False,
        }
        audit_rows = conn.execute(
            """SELECT at,action,detail FROM audit
               WHERE action IN (
                 'integration.test_accepted','integration.test_failed',
                 'integration.token_created','integration.token_revoked')
                 AND (
                   json_extract(detail,'$.integration_id')=?
                   OR json_extract(detail,'$.token_id') IN (
                     SELECT id FROM api_tokens WHERE integration_id=?
                   )
                 )
               ORDER BY at DESC,id DESC LIMIT 200""",
            (ident, ident),
        ).fetchall()
        owned = {item["id"] for item in credentials}
        connection_tests, credential_history = [], []
        for event in audit_rows:
            detail = json.loads(event["detail"])
            if event["action"] in ("integration.test_accepted", "integration.test_failed"):
                if detail.get("integration_id") == ident:
                    connection_tests.append({
                        "at": event["at"],
                        "status": "accepted" if event["action"].endswith("accepted") else "failed",
                        "execution_allowed": False,
                    })
            elif (
                detail.get("integration_id") == ident
                or detail.get("token_id") in owned
            ):
                credential_history.append({
                    "at": event["at"],
                    "event": event["action"],
                    "credential_id": detail.get("token_id"),
                })
        failure_events = int(failed_events)
        health = (
            "disabled" if not row["enabled"]
            else "degraded" if failure_events
            else "transport_accepted" if transport["accepted"] is not None
            else "not_verified"
        )
        return {
            "integration": {
                "id": row["id"], "name": row["name"], "kind": row["kind"],
                "tenant": row["tenant"], "enabled": bool(row["enabled"]),
            },
            "request_activity": {
                "count": int(current["count"]),
                "last_created_at": current["last_created_at"],
            },
            "transport": {
                "last_accepted_at": transport["accepted"],
                "last_failure_at": failed_at,
                "latest_state": latest["state"] if latest else None,
                "last_success_is_execution": False,
                "failed_events": failure_events,
                "health": health,
            },
            "credentials": credentials,
            "external_readiness": external_readiness,
            "credential_history": credential_history[:100],
            "connection_tests": connection_tests[:100],
        }


def configuration_manifest(db: Database, actor: Principal) -> dict:
    """Describe portable policy structure, not a deployable backup or import payload."""
    actor.require_admin()
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        integrations = [
            {
                "id": row["id"],
                "name": row["name"],
                "kind": row["kind"],
                "tenant": row["tenant"],
                "enabled": bool(row["enabled"]),
            }
            for row in conn.execute(
                "SELECT id,name,kind,tenant,enabled FROM integrations ORDER BY name,id"
            ).fetchall()
        ]
        policy_rows = conn.execute(
            """SELECT
                 pv.profile_id,pv.version,pv.name,pv.integration_id,
                 pv.approval_mode,pv.approver_group_id,pv.approvals_required,
                 pv.action_kind,pv.email_template_id,pv.lifecycle,
                 pv.tenant_selector,pv.environment,pv.severity,pv.risk_level,
                 pv.deadline_seconds,pv.reminder_seconds,pv.max_reminders,
                 pv.grant_seconds
               FROM profile_versions pv
               WHERE pv.version=(
                 SELECT MAX(version) FROM profile_versions
                 WHERE profile_id=pv.profile_id
               )
               ORDER BY pv.name,pv.profile_id"""
        ).fetchall()
        templates = []
        for row in conn.execute(
            "SELECT id,name,enabled,event_templates FROM email_templates ORDER BY name,id"
        ).fetchall():
            templates.append({
                "id": row["id"],
                "name": row["name"],
                "enabled": bool(row["enabled"]),
                "event_types": sorted(json.loads(row["event_templates"])),
            })
        return {
            "schema_version": 1,
            "secret_free": True,
            "import_supported": False,
            "executable_restore_bundle": False,
            "integrations": integrations,
            "policies": [dict(row) for row in policy_rows],
            "templates": templates,
            "warning": (
                "Read-only planning manifest, not a restorable configuration. "
                "No connection destinations, authentication materials, or message bodies "
                "are included. Import requires explicit validation and owner approval."
            ),
        }
