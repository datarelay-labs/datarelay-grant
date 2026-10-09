"""Currently eligible recipient mailboxes for durable approval seats.

This is an authority projection, not a second approval ledger. The original
and active delegate remain two delivery recipients for ONE represented seat.
"""

from __future__ import annotations

import json
import sqlite3


def eligible_recipients(conn: sqlite3.Connection, request: sqlite3.Row, now: float) -> list[dict]:
    if (
        request["state"] not in ("AWAITING", "HELD")
        or request["collaboration_state"] != "OPEN"
        or request["deadline"] <= now
    ):
        return []
    plan = json.loads(request["approval_plan"] or "{}")
    mode = plan.get("mode", "SINGLE")
    rows = conn.execute(
        """SELECT a.id,a.step_id,a.assignment_epoch,a.approver_id,a.position
           FROM approval_assignments a
           WHERE a.request_id=? ORDER BY a.position""",
        (request["id"],),
    ).fetchall()
    votes = {
        row["actor_id"]: row["decision"]
        for row in conn.execute(
            "SELECT actor_id,decision FROM request_decisions WHERE request_id=?",
            (request["id"],),
        ).fetchall()
    }
    waiting = [seat for seat in rows if votes.get(seat["approver_id"]) not in ("APPROVED", "DENIED")]
    if mode == "SEQUENTIAL":
        waiting = waiting[:1]
    result = []
    for seat in waiting:
        # A disabled original assignment cannot delegate durable authority.
        original = conn.execute(
            "SELECT id,email,enabled FROM users WHERE id=?", (seat["approver_id"],)
        ).fetchone()
        if not original or not original["enabled"]:
            continue
        result.append({
            "assignment_id": seat["id"], "step_id": seat["step_id"],
            "assignment_epoch": seat["assignment_epoch"],
            "original_id": seat["approver_id"], "recipient_id": original["id"],
            "email": original["email"], "delegation_id": None,
        })
        for delegate in conn.execute(
            """SELECT d.id AS delegation_id,u.id,u.email
               FROM delegations d JOIN users u ON u.id=d.substitute_id
               WHERE d.delegator_id=? AND d.revoked_at IS NULL
                 AND d.starts_at<=? AND d.ends_at>? AND u.enabled=1
               ORDER BY d.created_at,d.id""",
            (seat["approver_id"], now, now),
        ).fetchall():
            # Several windows for one substitute still produce one independent
            # mailbox, with the concrete delegation ID needed for final checks.
            if any(
                item["assignment_id"] == seat["id"] and item["recipient_id"] == delegate["id"]
                for item in result
            ):
                continue
            if delegate["id"] == request["requester_id"]:
                continue
            result.append({
                "assignment_id": seat["id"], "step_id": seat["step_id"],
                "assignment_epoch": seat["assignment_epoch"],
                "original_id": seat["approver_id"], "recipient_id": delegate["id"],
                "email": delegate["email"], "delegation_id": delegate["delegation_id"],
            })
    return result
