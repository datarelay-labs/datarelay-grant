"""Deterministic bounded approval-policy version and matching helpers."""

from __future__ import annotations

import sqlite3
from typing import Any

from .errors import GrantError

SELECTOR_FIELDS = ("tenant_selector", "environment", "severity", "risk_level")


def source_selectors(source: dict[str, Any]) -> dict[str, str]:
    tenant = source.get("tenant_id", source.get("customer_id", source.get("tenant", "")))
    risk = source.get("risk_level", source.get("risk", ""))
    return {
        "tenant_selector": str(tenant) if tenant is not None else "",
        "environment": str(source.get("environment", "") or ""),
        "severity": str(source.get("severity", "") or ""),
        "risk_level": str(risk) if risk is not None else "",
    }


def selector_evaluation(
    row: sqlite3.Row, source: dict[str, Any]
) -> tuple[bool, dict[str, dict[str, Any]], int]:
    actual = source_selectors(source)
    details: dict[str, dict[str, Any]] = {}
    specificity = 0
    matched = True
    for field in SELECTOR_FIELDS:
        expected = row[field] or ""
        if expected:
            specificity += 1
            ok = actual[field] == expected
        else:
            ok = True
        details[field] = {
            "configured": expected or None,
            "actual": actual[field] or None,
            "matched": ok,
            "wildcard": not bool(expected),
        }
        matched = matched and ok
    return matched, details, specificity


def _active_candidates(
    conn: sqlite3.Connection, integration_id: str, action_kind: str
) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT pv.*, t.name AS email_template_name
           FROM profile_versions pv
           JOIN profiles p ON p.id=pv.profile_id
           JOIN integrations i ON i.id=pv.integration_id
           LEFT JOIN email_templates t ON t.id=pv.email_template_id
           WHERE pv.lifecycle='ACTIVE'
             AND pv.integration_id=?
             AND pv.action_kind=?
             AND i.enabled=1
           ORDER BY pv.profile_id,pv.version""",
        (integration_id, action_kind),
    ).fetchall()


def resolve_policy(
    conn: sqlite3.Connection,
    *,
    integration_id: str,
    action_kind: str,
    source: dict[str, Any],
) -> tuple[sqlite3.Row, dict[str, Any]]:
    evaluated: list[tuple[sqlite3.Row, dict[str, dict[str, Any]], int]] = []
    for row in _active_candidates(conn, integration_id, action_kind):
        matched, details, specificity = selector_evaluation(row, source)
        if matched:
            evaluated.append((row, details, specificity))
    if not evaluated:
        raise GrantError("POLICY_NO_MATCH", 404)
    best_score = max(item[2] for item in evaluated)
    best = [item for item in evaluated if item[2] == best_score]
    if len(best) != 1:
        raise GrantError("POLICY_MATCH_CONFLICT", 409)
    row, details, specificity = best[0]
    return row, {
        "matched": True,
        "specificity": specificity,
        "selectors": details,
        "candidate_count": len(evaluated),
        "resolution": "unique-most-specific",
    }


def latest_version(conn: sqlite3.Connection, profile_id: str) -> sqlite3.Row:
    row = conn.execute(
        """SELECT pv.*, t.name AS email_template_name
           FROM profile_versions pv
           LEFT JOIN email_templates t ON t.id=pv.email_template_id
           WHERE pv.profile_id=?
           ORDER BY pv.version DESC LIMIT 1""",
        (profile_id,),
    ).fetchone()
    if not row:
        raise GrantError("PROFILE_NOT_FOUND", 404)
    return row


def active_version(conn: sqlite3.Connection, profile_id: str) -> sqlite3.Row | None:
    return conn.execute(
        """SELECT pv.*, t.name AS email_template_name
           FROM profile_versions pv
           LEFT JOIN email_templates t ON t.id=pv.email_template_id
           WHERE pv.profile_id=? AND pv.lifecycle='ACTIVE'
           ORDER BY pv.version DESC LIMIT 1""",
        (profile_id,),
    ).fetchone()


def version_view(row: sqlite3.Row) -> dict[str, Any]:
    keys = set(row.keys())
    return {
        "id": row["profile_id"],
        "version_id": row["id"],
        "version": row["version"],
        "name": row["name"],
        "integration_id": row["integration_id"],
        "approver_id": row["approver_id"],
        "action_kind": row["action_kind"],
        "email_template_id": row["email_template_id"],
        "notification_template_set_id": row["email_template_id"],
        "email_template_name": row["email_template_name"] if "email_template_name" in keys else None,
        "deadline_seconds": row["deadline_seconds"],
        "reminder_seconds": row["reminder_seconds"],
        "max_reminders": row["max_reminders"],
        "grant_seconds": row["grant_seconds"],
        "tenant_selector": row["tenant_selector"],
        "environment": row["environment"],
        "severity": row["severity"],
        "risk_level": row["risk_level"],
        "lifecycle": row["lifecycle"],
        "enabled": row["lifecycle"] == "ACTIVE",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "activated_at": row["activated_at"],
        "disabled_at": row["disabled_at"],
    }


def preview_policy(
    conn: sqlite3.Connection,
    *,
    integration_id: str,
    action_kind: str,
    source: dict[str, Any],
) -> dict[str, Any]:
    row, resolution = resolve_policy(
        conn,
        integration_id=integration_id,
        action_kind=action_kind,
        source=source,
    )
    return {"policy": version_view(row), "resolution": resolution}


def history(conn: sqlite3.Connection, profile_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT pv.*, t.name AS email_template_name
           FROM profile_versions pv
           LEFT JOIN email_templates t ON t.id=pv.email_template_id
           WHERE pv.profile_id=?
           ORDER BY pv.version DESC""",
        (profile_id,),
    ).fetchall()
    if not rows:
        raise GrantError("PROFILE_NOT_FOUND", 404)
    return [version_view(row) for row in rows]
