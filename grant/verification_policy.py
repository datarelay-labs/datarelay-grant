"""Trusted, customer-configured email approval verification levels.

A request may select a stronger policy, but never downgrade the installation
or its registered integration's minimum based on requester-supplied labels.
"""

from __future__ import annotations

import sqlite3

from .config import Settings

MODES = ("EMAIL_PIN", "EMAIL_PIN_PLUS_OTP", "EMAIL_PIN_PLUS_MFA")


def strongest(*modes: str) -> str:
    return max(modes, key=MODES.index)


def choose(settings: Settings, policy_override: str, integration_minimum: str) -> str:
    configured = (
        settings.decision_verification_default
        if policy_override == "INHERIT" else policy_override
    )
    return strongest(configured, integration_minimum)


def current_required(
    conn: sqlite3.Connection, request: sqlite3.Row,
) -> str:
    """Never silently weaken a request's snapshotted verification minimum."""
    current = conn.execute(
        "SELECT decision_verification_minimum FROM integrations WHERE id=?",
        (request["integration_id"],),
    ).fetchone()
    if not current:
        return "EMAIL_PIN_PLUS_MFA"  # Missing authority fails closed.
    return strongest(
        request["decision_verification_mode"],
        current["decision_verification_minimum"],
    )



def trusted_action_floor(
    conn: sqlite3.Connection, settings: Settings, *,
    integration_id: str, action_kind: str, integration_minimum: str,
) -> str:
    """Treat requester source risk/severity/environment as UNTRUSTED.

    Until verified source-side attestations are available, all ACTIVE policies
    for the same registered integration and immutable action kind contribute
    a security floor. Caller-supplied risk_level cannot select an easier tier.
    This is intentionally conservative when trusted asset risk is unknown.
    """
    policies = conn.execute(
        """SELECT pv.verification_mode FROM profile_versions pv
           JOIN profiles p ON p.id=pv.profile_id
           WHERE pv.lifecycle='ACTIVE' AND p.enabled=1
             AND pv.integration_id=? AND pv.action_kind=?""",
        (integration_id, action_kind),
    ).fetchall()
    return strongest(
        choose(settings, "INHERIT", integration_minimum),
        *(choose(settings, row["verification_mode"], integration_minimum) for row in policies),
    )
