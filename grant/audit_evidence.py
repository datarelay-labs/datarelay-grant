"""Bounded, admin-only audit evidence without raw event payload material."""

from __future__ import annotations

import csv
import io
import json
import math
import re
import sqlite3
from collections.abc import Mapping

from .auth import Principal, require_current_authority
from .db import Database
from .errors import GrantError

SAFE_ENUMS: dict[str, set[str]] = {
    "decision": {"APPROVED", "DENIED", "HELD"},
    "state": {"AWAITING", "HELD", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"},
    "final_state": {"AWAITING", "HELD", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"},
    "status": {"RUNNING", "UNKNOWN", "REPORTED_SUCCEEDED", "REPORTED_FAILED"},
    "kind": {"email", "webhook", "datarelay", "stellar"},
    "mode": {"SINGLE", "ANY_ONE", "ALL", "N_OF_M", "SEQUENTIAL"},
    "event_type": {
        "requested", "reminder", "approved", "denied", "expired", "cancelled",
        "execution_succeeded", "execution_failed", "execution_unknown",
    },
}
SAFE_NUMBERS = {"approvals", "required", "revision", "policy_version", "version"}
SAFE_BOOLEAN = {"committed", "replay", "enabled"}
SAFE_IDENTIFIER = re.compile(r"^[a-zA-Z0-9_-]{1,100}$")
SAFE_IDS = {
    "event_id", "token_id", "integration_id", "profile_id", "request_id",
    "group_id", "execution_id", "delegation_id", "action_hash",
}


def sanitized_detail(value: str | dict) -> dict:
    """Allow known typed evidence fields; exclude arbitrary free-text/reasons."""
    try:
        data = json.loads(value) if isinstance(value, str) else value
    except (ValueError, TypeError):
        return {}
    if not isinstance(data, Mapping):
        return {}
    safe = {}
    for key, item in data.items():
        if (
            (key in SAFE_ENUMS and isinstance(item, str) and item in SAFE_ENUMS[key])
            or (
                key in SAFE_NUMBERS
                and type(item) in (int, float)
                and math.isfinite(item)
                and abs(item) <= 1_000_000_000
            )
            or (key in SAFE_BOOLEAN and isinstance(item, bool))
            or (key in SAFE_IDS and isinstance(item, str) and SAFE_IDENTIFIER.fullmatch(item))
        ):
            safe[key] = item
    return safe


def _conditions(
    *,
    request_id: str | None = None,
    action: str | None = None,
    actor: str | None = None,
    search: str = "",
    since: float | None = None,
    until: float | None = None,
) -> tuple[str, list]:
    if since is not None and until is not None and since > until:
        raise GrantError("AUDIT_TIME_RANGE_INVALID", 422)
    parts, args = [], []
    for column, value in (
        ("a.request_id", request_id),
        ("a.action", action),
        ("a.actor", actor),
    ):
        if value is not None:
            parts.append(f"{column}=?")
            args.append(value)
    if since is not None:
        parts.append("a.at>=?")
        args.append(since)
    if until is not None:
        parts.append("a.at<=?")
        args.append(until)
    if search:
        term = search.lower().replace("!", "!!").replace("%", "!%").replace("_", "!_")
        parts.append(
            """(LOWER(a.action) LIKE ? ESCAPE '!'
                OR LOWER(a.actor) LIKE ? ESCAPE '!'
                OR LOWER(COALESCE(a.request_id,'')) LIKE ? ESCAPE '!')"""
        )
        args.extend([f"%{term}%"] * 3)
    return (" WHERE " + " AND ".join(parts) if parts else ""), args


def _project(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "at": row["at"],
        "action": row["action"],
        "actor": row["actor"],
        "request_id": row["request_id"],
        "details": sanitized_detail(row["detail"]),
    }


def audit_search(
    db: Database,
    principal: Principal,
    *,
    limit: int = 50,
    offset: int = 0,
    **filters,
) -> dict:
    principal.require_admin()
    if limit < 1 or limit > 100 or offset < 0 or offset > 100000:
        raise GrantError("AUDIT_PAGE_INVALID", 422)
    clause, args = _conditions(**filters)
    with db.transaction(write=False) as conn:
        require_current_authority(conn, principal)
        total = conn.execute("SELECT COUNT(*) FROM audit a" + clause, args).fetchone()[0]
        rows = conn.execute(
            "SELECT a.* FROM audit a" + clause +
            " ORDER BY a.at DESC,a.id DESC LIMIT ? OFFSET ?",
            (*args, limit, offset),
        ).fetchall()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
        "items": [_project(row) for row in rows],
    }


def audit_export(
    db: Database,
    principal: Principal,
    *,
    fmt: str,
    limit: int = 1000,
    offset: int = 0,
    **filters,
) -> str:
    principal.require_admin()
    if fmt not in ("json", "csv") or limit < 1 or limit > 1000 or offset < 0 or offset > 100000:
        raise GrantError("AUDIT_EXPORT_INVALID", 422)
    clause, args = _conditions(**filters)
    with db.transaction(write=False) as conn:
        require_current_authority(conn, principal)
        rows = conn.execute(
            "SELECT a.* FROM audit a" + clause +
            " ORDER BY a.at DESC,a.id DESC LIMIT ? OFFSET ?",
            (*args, limit, offset),
        ).fetchall()
    events = [_project(row) for row in rows]
    if fmt == "json":
        return json.dumps(
            {"export_schema": 1, "bounded": True, "limit": limit,
             "offset": offset, "events": events},
            sort_keys=True, ensure_ascii=False, allow_nan=False,
        )
    stream = io.StringIO()
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(("id", "at", "action", "actor", "request_id", "details"))
    for event in events:
        values = (
            event["id"], str(event["at"]), event["action"], event["actor"],
            event["request_id"] or "",
            json.dumps(event["details"], sort_keys=True, ensure_ascii=False),
        )
        # Spreadsheet programs may evaluate untrusted text beginning with
        # formula operators. Prefix a quote for export-only neutralization.
        writer.writerow([
            (
                "'" + item
                if item and (
                    item[0] in "\t\r\n"
                    or item.lstrip(" \t\r\n").startswith(("=", "+", "-", "@"))
                )
                else item
            )
            for item in values
        ])
    return stream.getvalue()


def request_chain(db: Database, actor: Principal, ident: str) -> dict:
    actor.require_admin()
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        row = conn.execute(
            """SELECT id,integration_id,profile_id,profile_version_id,
                      action_hash,requester_id,approver_id,state,decision,decision_at,
                      execution_id,execution_state,committed_at,created_at,deadline,
                      revision
               FROM requests WHERE id=?""",
            (ident,),
        ).fetchone()
        if not row:
            raise GrantError("REQUEST_NOT_FOUND", 404)
        total = conn.execute(
            "SELECT COUNT(*) FROM audit WHERE request_id=?", (ident,)
        ).fetchone()[0]
        events = conn.execute(
            """SELECT * FROM audit WHERE request_id=?
               ORDER BY at ASC,id ASC LIMIT 1000""",
            (ident,),
        ).fetchall()
        decisions = conn.execute(
            """SELECT actor_id,decision,decided_at FROM request_decisions
               WHERE request_id=? ORDER BY decided_at,actor_id""",
            (ident,),
        ).fetchall()
        comments = conn.execute(
            """SELECT id,author_id,kind,created_at FROM request_comments
               WHERE request_id=? ORDER BY created_at,id""",
            (ident,),
        ).fetchall()
        delivery = conn.execute(
            """SELECT id,kind,event_type,state,attempts,created_at,delivered_at
               FROM outbox WHERE request_id=? ORDER BY created_at,id LIMIT 1000""",
            (ident,),
        ).fetchall()
    return {
        "request": dict(row),
        "total_events": total,
        "events_truncated": total > len(events),
        "events": [_project(event) for event in events],
        "decisions": [dict(item) for item in decisions],
        "comments": [dict(item) for item in comments],
        "deliveries": [dict(item) for item in delivery],
        "current_is_execution_verified": False,
    }
