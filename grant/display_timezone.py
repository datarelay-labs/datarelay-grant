"""Authenticated display-timezone preferences; persisted timestamps remain UTC."""

from __future__ import annotations

import re
import sqlite3
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .db import audit
from .errors import GrantError

_ZONE = re.compile(r"^[A-Za-z][A-Za-z0-9._+-]*(?:/[A-Za-z0-9._+-]+)+$")


def validate_timezone(value: str) -> str:
    if value == "UTC":
        return value
    if len(value) > 128 or not _ZONE.fullmatch(value):
        raise GrantError("DISPLAY_TIMEZONE_INVALID", 422)
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise GrantError("DISPLAY_TIMEZONE_INVALID", 422) from None
    return value


def _default(conn: sqlite3.Connection) -> str:
    row = conn.execute(
        "SELECT value FROM runtime WHERE key='display_timezone_default'"
    ).fetchone()
    if not row:
        raise GrantError("DISPLAY_TIMEZONE_UNAVAILABLE", 503)
    return validate_timezone(row[0])


def user_projection(conn: sqlite3.Connection, user_id: str) -> dict:
    row = conn.execute(
        "SELECT display_timezone FROM users WHERE id=?", (user_id,)
    ).fetchone()
    if not row:
        raise GrantError("AUTHENTICATION_REQUIRED", 401)
    default = _default(conn)
    override = row["display_timezone"]
    if override is not None:
        override = validate_timezone(override)
    return {
        "override": override,
        "default": default,
        "effective": override or default,
        "storage_timezone": "UTC",
    }


def update_user(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    timezone: str | None,
    expected_timezone: str | None,
) -> dict:
    current = conn.execute(
        "SELECT display_timezone FROM users WHERE id=?", (user_id,)
    ).fetchone()
    if not current:
        raise GrantError("AUTHENTICATION_REQUIRED", 401)
    current_value = current["display_timezone"]
    if current_value != expected_timezone:
        raise GrantError("STALE_DISPLAY_TIMEZONE", 409)
    normalized = None if timezone is None else validate_timezone(timezone)
    conn.execute(
        "UPDATE users SET display_timezone=? WHERE id=?",
        (normalized, user_id),
    )
    audit(
        conn,
        None,
        user_id,
        "display_timezone.user_updated",
        {"timezone": normalized, "previous_timezone": current_value},
    )
    return user_projection(conn, user_id)


def admin_projection(conn: sqlite3.Connection) -> dict:
    default = _default(conn)
    return {"default": default, "storage_timezone": "UTC"}


def update_default(
    conn: sqlite3.Connection,
    *,
    actor_id: str,
    timezone: str,
    expected_timezone: str,
) -> dict:
    current = _default(conn)
    if current != expected_timezone:
        raise GrantError("STALE_DISPLAY_TIMEZONE", 409)
    normalized = validate_timezone(timezone)
    conn.execute(
        "UPDATE runtime SET value=? WHERE key='display_timezone_default'",
        (normalized,),
    )
    audit(
        conn,
        None,
        actor_id,
        "display_timezone.default_updated",
        {"timezone": normalized, "previous_timezone": current},
    )
    return {"default": normalized, "storage_timezone": "UTC"}
