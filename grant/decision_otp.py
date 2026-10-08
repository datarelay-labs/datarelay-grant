"""Deliberate, time-bounded extra email OTP step for a scoped decision.

This provides proof of continuing access to the SAME mailbox. It is not a
second factor and cannot satisfy EMAIL_PIN_PLUS_MFA. No GET causes OTP mail.
"""

from __future__ import annotations

import hmac
import secrets
import sqlite3
import time

from .config import Settings
from .db import Database, audit, uid
from .decision_links import _active, _digest, _limit, _row_by_digest
from .errors import GrantError
from .verification_policy import current_required

OTP_LIFETIME_SECONDS = 300
OTP_REISSUE_SECONDS = 60
MAX_OTP_ERRORS = 3


def _context(
    conn: sqlite3.Connection, settings: Settings, token: str,
    confirmation_token: str, now: float,
) -> tuple[sqlite3.Row, sqlite3.Row, str, str]:
    intent_digest = _digest(settings, "intent", token)
    state = _row_by_digest(conn, intent_digest)
    _active(conn, settings, state, now)
    context_digest = _digest(settings, "confirmation", confirmation_token)
    context = conn.execute(
        """SELECT * FROM decision_confirmations
           WHERE context_digest=? AND intent_digest=? AND consumed_at IS NULL
             AND expires_at>?""",
        (context_digest, intent_digest, now),
    ).fetchone()
    if not context:
        raise GrantError("CONFIRMATION_EXPIRED_OR_USED", 409)
    if current_required(conn, state) != "EMAIL_PIN_PLUS_OTP":
        raise GrantError("EMAIL_OTP_NOT_REQUIRED", 409)
    return state, context, context_digest, intent_digest


def otp_deliverable(
    conn: sqlite3.Connection, settings: Settings, challenge_id: str, now: float,
) -> bool:
    challenge = conn.execute(
        """SELECT x.*,c.expires_at AS confirmation_expiry,c.consumed_at
           FROM decision_otp_challenges x JOIN decision_confirmations c
             ON c.context_digest=x.context_digest
           WHERE x.id=?""",
        (challenge_id,),
    ).fetchone()
    if not challenge or (
        challenge["state"] != "ACTIVE" or challenge["expires_at"] <= now
        or challenge["confirmation_expiry"] <= now or challenge["consumed_at"] is not None
    ):
        return False
    intent = _row_by_digest(conn, challenge["intent_digest"])
    try:
        _active(conn, settings, intent, now)
        return current_required(conn, intent) == "EMAIL_PIN_PLUS_OTP"
    except GrantError:
        return False


class DecisionOtp:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings

    def request(self, token: str, confirmation_token: str, peer: str) -> dict:
        now = time.time()
        with self.db.transaction() as conn:
            state, context, context_digest, intent_digest = _context(
                conn, self.settings, token, confirmation_token, now,
            )
            if context["otp_verified_at"] is not None:
                raise GrantError("EMAIL_OTP_ALREADY_VERIFIED", 409)
            previous = conn.execute(
                """SELECT * FROM decision_otp_challenges
                   WHERE context_digest=? ORDER BY issued_at DESC,id DESC LIMIT 1""",
                (context_digest,),
            ).fetchone()
            if previous and now - previous["issued_at"] < OTP_REISSUE_SECONDS:
                raise GrantError("EMAIL_OTP_REISSUE_COOLDOWN", 429)
            if not all((
                _limit(conn, self.settings, "otp-request-peer:" + peer, 30, now, 300),
                _limit(
                    conn, self.settings,
                    "otp-request-recipient:" + state["recipient_id"], 5, now, 3600,
                ),
                _limit(conn, self.settings, "otp-request-install", 600, now, 300),
            )):
                raise GrantError("EMAIL_OTP_RATE_LIMITED", 429)
            if previous and previous["state"] == "ACTIVE":
                conn.execute(
                    "UPDATE decision_otp_challenges SET state='REVOKED' WHERE id=?",
                    (previous["id"],),
                )
            challenge_id = uid()
            otp = f"{secrets.randbelow(1000000):06d}"
            expires_at = min(now + OTP_LIFETIME_SECONDS, context["expires_at"])
            if expires_at <= now + 5:
                raise GrantError("CONFIRMATION_EXPIRED_OR_USED", 409)
            conn.execute(
                """INSERT INTO decision_otp_challenges(
                   id,context_digest,intent_digest,otp_digest,issued_at,expires_at
                ) VALUES(?,?,?,?,?,?)""",
                (challenge_id, context_digest, intent_digest,
                 _digest(self.settings, "otp", challenge_id + ":" + otp),
                 now, expires_at),
            )
            recipient = conn.execute(
                "SELECT email FROM users WHERE id=? AND enabled=1",
                (state["recipient_id"],),
            ).fetchone()
            if not recipient:
                raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
            contents = {
                "subject": "[Grant] Additional decision verification code",
                "body": (
                    "Your additional decision verification code is: " + otp
                    + "\nThis code is valid only for this decision and expires shortly."
                    + "\nThe code is sent to your same email mailbox and is NOT MFA."
                    + "\nDo not forward it."
                ),
            }
            conn.execute(
                """INSERT INTO outbox(
                   id,request_id,kind,event_type,revision,payload,destination,
                   available_at,created_at,sealed_payload,otp_challenge_id,
                   recipient_id,approval_assignment_id,delegation_id,issuance_id
                ) VALUES(?,?,'email','decision_otp',?,?,?,?,?,1,?,?,?,?,?)""",
                (uid(), state["request_id"], conn.execute(
                    "SELECT revision FROM requests WHERE id=?", (state["request_id"],)
                ).fetchone()["revision"],
                 self.settings.seal(contents),
                 self.settings.seal({"email": recipient["email"]}),
                 now, now, challenge_id,
                 state["recipient_id"], state["approval_assignment_id"],
                 state["delegation_id"], state["issuance_id"]),
            )
            audit(conn, state["request_id"], "email-capability", "decision.otp_queued", {
                "challenge_id": challenge_id,
                "issuance_id": state["issuance_id"],
                "recipient_id": state["recipient_id"],
                "expires_at": expires_at,
                "actor_assurance": "EMAIL_LINK_PIN",
                "mfa": False,
                "verified_person_id": None,
            }, now)
        return {
            "otp_queued": True, "expires_in": int(expires_at - now),
            "delivery": "QUEUED", "verification_mode": "EMAIL_PIN_PLUS_OTP",
            "mfa": False, "execution_allowed": False,
        }

    def verify(
        self, token: str, confirmation_token: str, otp: str, peer: str,
    ) -> dict:
        now, error = time.time(), None
        with self.db.transaction() as conn:
            state, context, context_digest, _ = _context(
                conn, self.settings, token, confirmation_token, now,
            )
            if context["otp_verified_at"] is not None:
                raise GrantError("EMAIL_OTP_ALREADY_VERIFIED", 409)
            challenge = conn.execute(
                """SELECT * FROM decision_otp_challenges
                   WHERE context_digest=? ORDER BY issued_at DESC,id DESC LIMIT 1""",
                (context_digest,),
            ).fetchone()
            if not challenge or challenge["state"] != "ACTIVE" or challenge["expires_at"] <= now:
                raise GrantError("EMAIL_OTP_EXPIRED_OR_USED", 409)
            if not all((
                _limit(conn, self.settings, "otp-verify-peer:" + peer, 30, now, 300),
                _limit(conn, self.settings,
                       "otp-verify-recipient:" + state["recipient_id"], 20, now, 300),
                _limit(conn, self.settings, "otp-verify-install", 600, now, 300),
            )):
                error = GrantError("EMAIL_OTP_RATE_LIMITED", 429)
            elif not hmac.compare_digest(
                challenge["otp_digest"],
                _digest(self.settings, "otp", challenge["id"] + ":" + otp),
            ):
                attempts = challenge["failed_attempts"] + 1
                conn.execute(
                    "UPDATE decision_otp_challenges SET failed_attempts=?,state=? WHERE id=?",
                    (attempts, "LOCKED" if attempts >= MAX_OTP_ERRORS else "ACTIVE",
                     challenge["id"]),
                )
                error = GrantError("EMAIL_OTP_VERIFICATION_FAILED", 403)
            else:
                conn.execute(
                    """UPDATE decision_otp_challenges
                       SET verified_at=?,state='CONSUMED' WHERE id=?""",
                    (now, challenge["id"]),
                )
                conn.execute(
                    "UPDATE decision_confirmations SET otp_verified_at=? WHERE context_digest=?",
                    (now, context_digest),
                )
                audit(conn, state["request_id"], "email-capability", "decision.otp_verified", {
                    "challenge_id": challenge["id"], "issuance_id": state["issuance_id"],
                    "actor_assurance": "EMAIL_LINK_PIN_PLUS_OTP",
                    "mfa": False, "verified_person_id": None,
                }, now)
        if error:
            raise error
        return {
            "otp_verified": True, "actor_assurance": "EMAIL_LINK_PIN_PLUS_OTP",
            "verified_person_id": None, "mfa": False, "execution_allowed": False,
        }
