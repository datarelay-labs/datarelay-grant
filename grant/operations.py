"""Authoritative, read-only G7 operator summary over persisted Grant state."""

from __future__ import annotations

import time

from .auth import Principal, require_current_authority
from .db import Database


def operations_summary(db: Database, actor: Principal) -> dict:
    actor.require_admin()
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        now = time.time()
        aggregate = conn.execute(
            """SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN r.state IN ('AWAITING','HELD') THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN r.state='HELD' THEN 1 ELSE 0 END) AS held,
                SUM(CASE WHEN r.state='APPROVED' THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN r.state='DENIED' THEN 1 ELSE 0 END) AS denied,
                SUM(CASE WHEN r.state='EXPIRED' THEN 1 ELSE 0 END) AS expired,
                SUM(CASE WHEN r.state='CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN
                    (r.state='EXPIRED' AND r.decision IS NULL AND r.deadline<=?)
                    OR (r.state IN ('AWAITING','HELD') AND e.due_at<=?)
                    THEN 1 ELSE 0 END) AS overdue,
                SUM(CASE WHEN r.state='APPROVED' AND r.execution_state='NOT_STARTED'
                    THEN 1 ELSE 0 END) AS approved_unused,
                SUM(CASE WHEN r.execution_state='UNKNOWN'
                    THEN 1 ELSE 0 END) AS execution_unknown,
                SUM(CASE WHEN r.execution_state='REPORTED_FAILED'
                    THEN 1 ELSE 0 END) AS execution_failed,
                SUM(CASE WHEN EXISTS(
                    SELECT 1 FROM outbox o
                    WHERE o.request_id=r.id AND o.kind='email' AND o.state='FAILED')
                    THEN 1 ELSE 0 END) AS email_failed,
                SUM(CASE WHEN (
                    SELECT o.state FROM outbox o
                    WHERE o.request_id=r.id AND o.kind='webhook'
                    ORDER BY o.created_at DESC,o.id DESC LIMIT 1
                    )='FAILED' THEN 1 ELSE 0 END) AS webhook_failed,
                SUM(CASE WHEN (
                    EXISTS(SELECT 1 FROM outbox o
                      WHERE o.request_id=r.id AND o.kind='email' AND o.state='FAILED')
                    OR (SELECT o.state FROM outbox o
                      WHERE o.request_id=r.id AND o.kind='webhook'
                      ORDER BY o.created_at DESC,o.id DESC LIMIT 1)='FAILED'
                    ) THEN 1 ELSE 0 END) AS delivery_failed,
                AVG(CASE WHEN r.decision_at IS NOT NULL
                    THEN MAX(r.decision_at-r.created_at,0) ELSE NULL END)
                    AS approval_latency_seconds
              FROM requests r
              LEFT JOIN escalations e ON e.request_id=r.id""",
            (now, now),
        ).fetchone()
        counts = {
            field: int(aggregate[field] or 0)
            for field in (
                "total", "pending", "held", "approved", "denied",
                "expired", "cancelled", "overdue", "approved_unused",
                "execution_unknown", "execution_failed",
                "email_failed", "webhook_failed", "delivery_failed",
            )
        }
        # SQLite window ranking yields a true odd/even median, using the same
        # final-decision timestamps as the existing mean and the same snapshot.
        # The sorting/aggregation stays inside SQLite: no unbounded Python list.
        median = conn.execute(
            """SELECT AVG(elapsed_seconds) AS median_seconds,
                      MAX(sample_count) AS sample_count
               FROM (
                 SELECT MAX(decision_at-created_at,0) AS elapsed_seconds,
                        ROW_NUMBER() OVER (
                          ORDER BY MAX(decision_at-created_at,0),id
                        ) AS ordinal,
                        COUNT(*) OVER () AS sample_count
                   FROM requests WHERE decision_at IS NOT NULL
               )
               WHERE ordinal IN ((sample_count+1)/2,(sample_count+2)/2)"""
        ).fetchone()
        integration_rows = conn.execute(
            "SELECT id,name,kind,enabled FROM integrations ORDER BY name,id"
        ).fetchall()
        integrations = []
        for item in integration_rows:
            request_info = conn.execute(
                """SELECT COUNT(*) AS count,MAX(created_at) AS last_request
                   FROM requests WHERE integration_id=?""",
                (item["id"],),
            ).fetchone()
            delivery = conn.execute(
                """SELECT MAX(o.delivered_at) AS accepted_at
                   FROM outbox o JOIN requests r ON r.id=o.request_id
                   WHERE r.integration_id=? AND o.kind='webhook'
                     AND o.state='DELIVERED'""",
                (item["id"],),
            ).fetchone()
            # Match the request-level ops_webhook_failed queue: an earlier
            # FAILED callback ceases to be an unresolved failure after a
            # newer callback has been successfully delivered for that request.
            failed_callbacks = conn.execute(
                """SELECT COUNT(*) FROM requests r
                   WHERE r.integration_id=? AND (
                     SELECT o.state FROM outbox o
                     WHERE o.request_id=r.id AND o.kind='webhook'
                     ORDER BY o.created_at DESC,o.id DESC LIMIT 1
                   )='FAILED'""",
                (item["id"],),
            ).fetchone()[0]
            accepted_at = delivery["accepted_at"]
            health = (
                "disabled" if not item["enabled"]
                else "degraded" if failed_callbacks
                else "transport_accepted" if accepted_at is not None
                else "not_verified"
            )
            integrations.append(
                {
                    "id": item["id"],
                    "name": item["name"],
                    "kind": item["kind"],
                    "enabled": bool(item["enabled"]),
                    "request_count": int(request_info["count"]),
                    "last_request_at": request_info["last_request"],
                    "last_callback_accepted_at": accepted_at,
                    "failed_callback_events": failed_callbacks,
                    "health": health,
                }
            )
        # Scoped email-decision lifecycle metrics; counts only. This does
        # not expose mailboxes, issued bearer links, PIN/OTP digests or content.
        email_security = conn.execute(
            """SELECT
                 SUM(CASE WHEN x.state='ACTIVE' AND x.expires_at>?
                              AND r.state IN ('AWAITING','HELD')
                     THEN 1 ELSE 0 END) AS active_issuances,
                 SUM(CASE WHEN x.state='LOCKED'
                     THEN 1 ELSE 0 END) AS locked_issuances,
                 SUM(CASE WHEN x.state='REVOKED'
                     THEN 1 ELSE 0 END) AS revoked_issuances,
                 SUM(CASE WHEN x.state='CONSUMED'
                     THEN 1 ELSE 0 END) AS consumed_issuances,
                 SUM(CASE WHEN x.state='ACTIVE' AND x.expires_at<=?
                     THEN 1 ELSE 0 END) AS expired_issuances
               FROM decision_issuances x
               JOIN requests r ON r.id=x.request_id""",
            (now, now),
        ).fetchone()
        otp_security = conn.execute(
            """SELECT
                 SUM(CASE WHEN state='ACTIVE' AND expires_at>? THEN 1
                     ELSE 0 END) AS active_challenges,
                 SUM(CASE WHEN state='LOCKED' THEN 1 ELSE 0 END) AS locked_challenges,
                 SUM(CASE WHEN state='CONSUMED' THEN 1 ELSE 0 END)
                     AS verified_challenges
               FROM decision_otp_challenges""",
            (now,),
        ).fetchone()
        step_up_unavailable = conn.execute(
            """SELECT COUNT(*) FROM requests r JOIN integrations i
                 ON i.id=r.integration_id
               WHERE r.state IN ('AWAITING','HELD')
                 AND (r.decision_verification_mode='EMAIL_PIN_PLUS_MFA'
                      OR i.decision_verification_minimum='EMAIL_PIN_PLUS_MFA')"""
        ).fetchone()[0]
        paused = conn.execute(
            "SELECT value FROM runtime WHERE key='paused'"
        ).fetchone()[0] == "1"
    return {
        "as_of": now,
        "recovery_paused": paused,
        "counts": counts,
        "decision_email_security": {
            **{name: int(email_security[name] or 0) for name in (
                "active_issuances", "locked_issuances", "revoked_issuances",
                "consumed_issuances", "expired_issuances",
            )},
            **{name: int(otp_security[name] or 0) for name in (
                "active_challenges", "locked_challenges", "verified_challenges",
            )},
            "pending_fresh_mfa": step_up_unavailable,
            "mailbox_code_is_mfa": False,
            "recipient_receipt_verified": False,
        },
        "approval_latency_seconds": (
            round(aggregate["approval_latency_seconds"], 3)
            if aggregate["approval_latency_seconds"] is not None
            else None
        ),
        "approval_latency_median_seconds": (
            round(median["median_seconds"], 3)
            if median["median_seconds"] is not None
            else None
        ),
        "approval_latency_sample_count": int(median["sample_count"] or 0),
        "integrations": integrations,
        "semantics": {
            "counts": "Distinct requests, not delivery attempts.",
            "callback": "HTTP callback transport acceptance; not execution success or receipt verification.",
            "overdue": "Requests whose approval deadline expired or whose escalation is due.",
            "latency": (
                "Mean and median elapsed seconds from creation to final recorded "
                "decision, clamped nonnegative; samples count final decisions."
            ),
            "decision_email_security": (
                "Mail/PIN/OTP lifecycle counters only; email transport acceptance "
                "does not prove recipient receipt, a verified person or independent MFA."
            ),
        },
    }
