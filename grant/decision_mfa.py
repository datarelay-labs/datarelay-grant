"""Fresh, session-bound Grant TOTP step-up for optional approval MFA.

This path is *only* available to an already authenticated enabled Grant user
who is the current original/delegated recipient of a verified mailbox intent.
It re-verifies the user's configured TOTP and advances the globally one-use
TOTP step, independent of the earlier email PIN/optional same-mailbox OTP.
"""

from __future__ import annotations

import hmac
import time

import pyotp

from .auth import Principal, require_current_authority
from .config import Settings
from .db import Database, audit
from .decision_links import _active, _digest, _limit, _row_by_digest
from .errors import GrantError
from .verification_policy import current_required


class DecisionMfa:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings

    def verify(
        self, actor: Principal, token: str, confirmation_token: str, code: str,
    ) -> dict:
        actor_is_human_session = (
            actor.kind == "human" and bool(actor.session_id)
        )
        if not actor_is_human_session:
            raise GrantError("FRESH_IDENTITY_MFA_REQUIRED", 403)
        now, error = time.time(), None
        with self.db.transaction() as conn:
            require_current_authority(conn, actor)
            intent_digest = _digest(self.settings, "intent", token)
            state = _row_by_digest(conn, intent_digest)
            _active(conn, self.settings, state, now)
            if state["recipient_id"] != actor.id:
                raise GrantError("FRESH_IDENTITY_MFA_REQUIRED", 403)
            if current_required(conn, state) != "EMAIL_PIN_PLUS_MFA":
                raise GrantError("FRESH_IDENTITY_MFA_NOT_REQUIRED", 409)
            context_digest = _digest(
                self.settings, "confirmation", confirmation_token,
            )
            context = conn.execute(
                """SELECT * FROM decision_confirmations
                   WHERE context_digest=? AND intent_digest=?
                     AND consumed_at IS NULL AND expires_at>?""",
                (context_digest, intent_digest, now),
            ).fetchone()
            if not context:
                raise GrantError("CONFIRMATION_EXPIRED_OR_USED", 409)
            if context["mfa_verified_at"] is not None:
                raise GrantError("FRESH_IDENTITY_MFA_ALREADY_VERIFIED", 409)
            user = conn.execute(
                """SELECT enabled,totp_secret,totp_last_step,role FROM users
                   WHERE id=?""",
                (actor.id,),
            ).fetchone()
            if not user or not user["enabled"] or user["role"] != actor.role:
                raise GrantError("FRESH_IDENTITY_MFA_REQUIRED", 403)
            if not user["totp_secret"]:
                raise GrantError("FRESH_IDENTITY_MFA_UNAVAILABLE", 403)
            secret = self.settings.unseal(user["totp_secret"])
            if not isinstance(secret, str):
                raise GrantError("FRESH_IDENTITY_MFA_UNAVAILABLE", 403)
            totp = pyotp.TOTP(secret)
            current_step = int(now // 30)
            allowed = all((
                _limit(
                    conn, self.settings, "mfa-step-up-user:" + actor.id,
                    5, now, 300,
                ),
                _limit(
                    conn, self.settings, "mfa-step-up-session:" + actor.session_id,
                    5, now, 300,
                ),
                _limit(conn, self.settings, "mfa-step-up-installation", 500, now, 60),
            ))
            matching = [
                step for step in (
                    current_step - 1, current_step, current_step + 1,
                )
                if step > user["totp_last_step"]
                and hmac.compare_digest(totp.at(step * 30), code)
            ]
            if not allowed:
                error = GrantError("FRESH_MFA_RATE_LIMITED", 429)
            elif not matching:
                audit(conn, state["request_id"], actor.id, "decision.mfa_failed", {
                    "issuance_id": state["issuance_id"],
                    "approval_assignment_id": state["approval_assignment_id"],
                    "recipient_id": state["recipient_id"],
                    "verified_person_id": None,
                    "method": "TOTP",
                    "mfa": False,
                }, now)
                error = GrantError("INVALID_MFA_CODE", 401)
            else:
                # BEGIN IMMEDIATE serializes simultaneous verifies across
                # sessions; a TOTP timestep cannot be reused for another intent.
                conn.execute(
                    "UPDATE users SET totp_last_step=? WHERE id=?",
                    (max(matching), actor.id),
                )
                conn.execute(
                    """UPDATE decision_confirmations
                       SET mfa_verified_at=?,verified_user_id=?,mfa_session_id=?
                       WHERE context_digest=?""",
                    (now, actor.id, actor.session_id, context_digest),
                )
                audit(
                    conn, state["request_id"], actor.id, "decision.mfa_verified", {
                        "issuance_id": state["issuance_id"],
                        "approval_assignment_id": state["approval_assignment_id"],
                        "recipient_id": state["recipient_id"],
                        "verified_person_id": actor.id,
                        "actor_assurance": "EMAIL_LINK_PIN_PLUS_MFA",
                        "method": "TOTP",
                        "mfa": True,
                    }, now,
                )
        if error:
            raise error
        return {
            "fresh_mfa_verified": True,
            "verified_person_id": actor.id,
            "actor_assurance": "EMAIL_LINK_PIN_PLUS_MFA",
            "mfa": True, "execution_allowed": False,
        }
