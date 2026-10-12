"""Grant-owned, current-authority RC41 notification snapshots from the real outbox.

Neither the Foundation UI nor this read endpoint sends, retries, authenticates
external recipients or confirms any downstream business effect.
"""

from __future__ import annotations

from hashlib import sha256

from .auth import Principal, require_current_authority
from .db import Database


def notification_destinations(db: Database, actor: Principal, *, smtp_configured: bool) -> list[dict]:
    """Bounded code-only destination summaries; no raw target, user or payload."""
    actor.require_admin()
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        integrations = conn.execute(
            "SELECT id,enabled FROM integrations ORDER BY id"
        ).fetchall()
        # Every count comes from durable outbox state. Superseded deliveries
        # and successful sends aren't retried. Never count transport accepted
        # as an independent mailbox receipt or integration business effect.
        aggregates = conn.execute(
            """SELECT o.kind,r.integration_id,o.state,
                      CASE WHEN o.attempts>0 THEN 1 ELSE 0 END attempted,
                      COUNT(*) AS total
                 FROM outbox o JOIN requests r ON r.id=o.request_id
                WHERE o.kind IN ('email','webhook')
                GROUP BY o.kind,r.integration_id,o.state,attempted"""
        ).fetchall()
        # The most recently finished transport event for each kind/destination
        # can truthfully report SMTP/HTTP acceptance or final delivery failure.
        # Current PENDING attempts must not overwrite a previous final result.
        terminal = conn.execute(
            """SELECT kind,integration_id,state FROM (
                  SELECT o.kind,r.integration_id,o.state,
                         ROW_NUMBER() OVER (
                            PARTITION BY o.kind,CASE WHEN o.kind='email'
                              THEN '' ELSE r.integration_id END
                            ORDER BY o.created_at DESC,o.id DESC
                         ) rank
                    FROM outbox o JOIN requests r ON r.id=o.request_id
                   WHERE o.kind IN ('email','webhook')
                     AND o.state IN ('FAILED','DELIVERED')
                ) WHERE rank=1"""
        ).fetchall()

    def key(kind: str, integration: str) -> tuple[str, str]:
        return (kind, "" if kind == "email" else integration)

    counts: dict[tuple[str, str], dict[str, int]] = {}
    for row in aggregates:
        identity = key(row["kind"], row["integration_id"])
        bucket = counts.setdefault(identity, {"queued": 0, "retryPending": 0, "deadLetter": 0})
        if row["state"] == "PENDING":
            bucket["retryPending" if row["attempted"] else "queued"] += int(row["total"])
        elif row["state"] == "SENDING":
            bucket["retryPending"] += int(row["total"])
        elif row["state"] == "FAILED":
            bucket["deadLetter"] += int(row["total"])

    outcomes = {
        key(row["kind"], row["integration_id"]):
            "accepted" if row["state"] == "DELIVERED" else "dead_letter"
        for row in terminal
    }

    def display(kind: str, integration: str, *, enabled: bool) -> dict:
        identity = key(kind, integration)
        reference = "grant.smtp" if kind == "email" else (
            "grant.webhook." + sha256(integration.encode("utf-8")).hexdigest()[:24]
        )
        result = {
            "reference": reference,
            # Purely a snapshot format revision: no action may consume it as
            # a source version or race-proof mutation CAS token.
            "revision": "snapshot.v1",
            "kind": "smtp" if kind == "email" else "webhook",
            "enabled": enabled,
            "queue": counts.get(identity, {"queued": 0, "retryPending": 0, "deadLetter": 0}),
        }
        if identity in outcomes:
            result["lastOutcome"] = outcomes[identity]
        return result

    return [
        display("email", "", enabled=smtp_configured),
        *(display("webhook", row["id"], enabled=bool(row["enabled"])) for row in integrations),
    ]
