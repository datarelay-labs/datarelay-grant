"""Product-owned, read-only M5/PF-RC41 operational fact projections.

No policy editor, backup registry, SIEM transport, rotation key store, host
firewall or trusted recovery-drill evidence exists in Grant 1.0. Distinguish
that absence from healthy execution rather than create synthetic authority.
"""
from __future__ import annotations

from .auth import Principal, require_current_authority
from .db import Database


def operational_readiness(db: Database, actor: Principal) -> dict:
    """Show only genuine current Grant rows; never perform any operation."""
    actor.require_admin()
    with db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        token_rows = conn.execute(
            "SELECT enabled,COUNT(*) AS total FROM api_tokens GROUP BY enabled"
        ).fetchall()
        tokens = {bool(row["enabled"]): int(row["total"]) for row in token_rows}
        paused_row = conn.execute(
            "SELECT value FROM runtime WHERE key='paused'"
        ).fetchone()
        # Never treat a missing or malformed recovery sentinel as unpaused.
        paused = paused_row is not None and paused_row["value"] == "1"
        pause_verified = paused_row is not None and paused_row["value"] in ("0", "1")
    return {
        "schema_version": 1,
        "scope": "stored_grant_facts_only",
        "allows_execution": False,
        # Grant has a local audit trail, but no installed outbound audit sink
        # or durable forwarding queue. An absent queue is NOT zero pending.
        "audit_forwarding": {"state": "disabled"},
        # Grant provides an operator-only private CLI backup/restore, not a
        # registered, encrypted evidence ledger or verified production drill.
        "backup_recovery": {
            "registered_evidence": "unavailable",
            "restore_drill": "not_verified",
            "recovery_paused": paused if pause_verified else None,
            "restore_authorized": False,
        },
        "retention": {"policy": "not_configured", "approval_record_deletion_enabled": False},
        # Only token metadata exists. No expiry/rotation history or approved
        # rotation policy is stored; current enabled does not mean healthy.
        "secret_lifecycle": {
            "rotation_policy": "not_configured",
            "active_integration_tokens": tokens.get(True, 0),
            "revoked_integration_tokens": tokens.get(False, 0),
            "material_exposed": False,
            "rotation_authorized": False,
        },
        # Host allowlists must be enforced at ingress and the host itself;
        # neither deployment policy nor firewall readback is present here.
        "management_ingress": {
            "web_allowlist": "not_configured",
            "host_ssh_enforcement": "not_verified",
            "access_rule_change_authorized": False,
        },
    }
