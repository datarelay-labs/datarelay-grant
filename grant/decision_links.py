"""Email-only, decision-scoped capabilities; no account or execution grants.

All opaque tokens and four-digit codes live only in encrypted pending mail.
Persistent lookup and PIN material are domain-separated, keyed HMAC digests.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import secrets
import sqlite3
import time
from collections.abc import Callable
from typing import Any

from .approval_mail import eligible_recipients
from .auth import Principal, require_current_authority
from .config import Settings
from .db import Database, audit, uid
from .errors import GrantError
from .mail_templates import render_notification

OUTCOMES = ("APPROVED", "HELD", "DENIED")
MAX_PIN_FAILURES = 5
CONFIRM_SECONDS = 300


def _digest(settings: Settings, purpose: str, value: str) -> str:
    return hmac.new(
        settings.encryption_key.encode(), f"grant:{purpose}:{value}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _code_digest(settings: Settings, issuance_id: str, pin: str) -> str:
    return _digest(settings, "pin", issuance_id + ":" + pin)


def _message(
    settings: Settings, request: sqlite3.Row, event: str,
    pin: str, tokens: dict[str, str],
) -> dict:
    content = render_notification(
        json.loads(request["mail_template"]), request, settings.origin, event=event,
    )
    # The same PIN is tied to one mailbox issuance, not the three independent
    # answer tokens. PIN never appears inside a URL, analytics, or query string.
    links = {
        outcome: f"{settings.origin}/api/v1/decision-intents/{token}"
        for outcome, token in tokens.items()
    }
    labels = {"APPROVED": "Approve", "HELD": "Hold", "DENIED": "Deny"}
    actions = "\n".join(
        f"{labels[outcome]}: {links[outcome]}" for outcome in OUTCOMES
    )
    content["body"] = (
        f"{content['body']}\n\n"
        "Decision links (each opens read-only; verify the email PIN and confirm):\n"
        f"{actions}\n\n"
        f"Four-digit confirmation PIN: {pin}\n"
        "The PIN in this same email does not prove personal identity or MFA.\n"
        "Do not forward this message."
    )
    content["html"] = (
        "<!doctype html><html><body>"
        f"<p>{html.escape(content['body'].split('Decision links (')[0]).replace(chr(10), '<br>')}</p>"
        "<p>Choose a decision (opening a link never records a vote):</p>"
        + "".join(
            f'<p><a href="{html.escape(links[outcome], quote=True)}">'
            f'{html.escape(labels[outcome])}</a></p>'
            for outcome in OUTCOMES
        )
        + f"<p>Four-digit confirmation PIN: <strong>{html.escape(pin)}</strong></p>"
        "<p>Same-email PIN does not independently verify a named person or MFA.</p>"
        "</body></html>"
    )
    # Reissue/reminder source material stays inside encrypted outbox only.
    content["_decision_tokens"] = tokens
    content["_decision_pin"] = pin
    return content


def queue_choice_mail(
    conn: sqlite3.Connection, request: sqlite3.Row, settings: Settings,
    now: float, event: str, *, recipient_filter: str | None = None,
) -> None:
    """Issue or reuse a valid recipient generation under the request write lock."""
    if request["email_pin_enabled"] != 1:
        raise ValueError("secure notification requires email PIN enabled")
    for recipient in eligible_recipients(conn, request, now):
        if recipient_filter and recipient["recipient_id"] != recipient_filter:
            continue
        # A locked 4-digit issuance MUST NOT be silently renewed by reminders.
        # Only a separately authenticated administrator can safely reissue.
        locked = conn.execute(
            """SELECT id FROM decision_issuances
               WHERE approval_assignment_id=? AND recipient_id=?
                 AND assignment_epoch=? AND state='LOCKED' LIMIT 1""",
            (recipient["assignment_id"], recipient["recipient_id"],
             recipient["assignment_epoch"]),
        ).fetchone()
        if locked:
            continue
        previous = conn.execute(
            """SELECT * FROM decision_issuances
               WHERE approval_assignment_id=? AND recipient_id=? AND state='ACTIVE'
                 AND delegation_id IS ? AND assignment_epoch=?
                 AND expires_at>? ORDER BY generation DESC LIMIT 1""",
            (recipient["assignment_id"], recipient["recipient_id"],
             recipient["delegation_id"], recipient["assignment_epoch"], now),
        ).fetchone()
        email_digest = _digest(
            settings, "recipient-email", recipient["email"].strip().lower(),
        )
        if previous and not hmac.compare_digest(
            previous["recipient_email_digest"], email_digest,
        ):
            conn.execute(
                "UPDATE decision_issuances SET state='REVOKED' WHERE id=?",
                (previous["id"],),
            )
            previous = None
        encrypted = None
        if previous:
            # A reminder reuses exactly the same protected token/PIN generation.
            old = conn.execute(
                """SELECT payload FROM outbox
                   WHERE issuance_id=? AND sealed_payload=1
                   ORDER BY created_at DESC,id DESC LIMIT 1""",
                (previous["id"],),
            ).fetchone()
            if old:
                material = settings.unseal(old["payload"])
                encrypted = settings.seal(_message(
                    settings, request, event,
                    material["_decision_pin"], material["_decision_tokens"],
                ))
        if encrypted is None:
            prior_generation = conn.execute(
                "SELECT COALESCE(MAX(generation),0) FROM decision_issuances "
                "WHERE approval_assignment_id=? AND recipient_id=?",
                (recipient["assignment_id"], recipient["recipient_id"]),
            ).fetchone()[0]
            issuance_id = uid()
            pin = f"{secrets.randbelow(10000):04d}"
            expires = min(request["deadline"], now + request["decision_link_ttl_seconds"])
            if expires <= now:
                continue
            conn.execute(
                """INSERT INTO decision_issuances(
                   id,request_id,approval_assignment_id,recipient_id,
                   recipient_email_digest,delegation_id,
                   generation,assignment_epoch,pin_digest,issued_at,expires_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (issuance_id, request["id"], recipient["assignment_id"],
                 recipient["recipient_id"], email_digest, recipient["delegation_id"],
                 prior_generation + 1, recipient["assignment_epoch"],
                 _code_digest(settings, issuance_id, pin), now, expires),
            )
            tokens: dict[str, str] = {}
            for outcome in OUTCOMES:
                token = secrets.token_urlsafe(32)
                tokens[outcome] = token
                conn.execute(
                    """INSERT INTO decision_intents(
                       token_digest,issuance_id,outcome,approval_step_id,
                       assignment_epoch,action_hash,expires_at
                    ) VALUES(?,?,?,?,?,?,?)""",
                    (_digest(settings, "intent", token), issuance_id, outcome,
                     recipient["step_id"], recipient["assignment_epoch"],
                     request["action_hash"], expires),
                )
            encrypted = settings.seal(_message(settings, request, event, pin, tokens))
            audit(conn, request["id"], "policy", "decision.issuance_created", {
                "issuance_id": issuance_id, "approval_assignment_id": recipient["assignment_id"],
                "recipient_id": recipient["recipient_id"],
                "delegation_id": recipient["delegation_id"],
                "assignment_epoch": recipient["assignment_epoch"],
                "expires_at": expires, "actor_assurance": "EMAIL_LINK_PIN",
            }, now)
        else:
            issuance_id = previous["id"]
        conn.execute(
            """INSERT INTO outbox(
               id,request_id,kind,event_type,revision,payload,destination,
               available_at,created_at,sealed_payload,recipient_id,
               approval_assignment_id,delegation_id,issuance_id
            ) VALUES(?,?,'email',?,?,?,?,?,?,1,?,?,?,?)""",
            (uid(), request["id"], event, request["revision"], encrypted,
             settings.seal({"email": recipient["email"]}), now, now,
             recipient["recipient_id"], recipient["assignment_id"],
             recipient["delegation_id"], issuance_id),
        )


def _row_by_digest(conn: sqlite3.Connection, digest: str) -> sqlite3.Row | None:
    return conn.execute(
        """SELECT i.token_digest,i.outcome,i.approval_step_id,i.assignment_epoch,
                  i.action_hash,i.expires_at,i.used_at,
                  x.id AS issuance_id,x.request_id,x.approval_assignment_id,
                  x.recipient_id,x.recipient_email_digest,x.delegation_id,
                  x.state AS issuance_state,
                  x.pin_digest,x.failed_attempts,x.assignment_epoch AS issuance_epoch,
                  x.expires_at AS issuance_expiry,
                  a.step_id AS current_step,a.approver_id AS original_id,
                  a.assignment_epoch AS current_epoch,
                  r.action_hash AS current_action_hash,r.state AS request_state,
                  r.email_pin_enabled,r.deadline,r.collaboration_state,
                  r.approval_plan,r.requester_id,r.integration_id,
                  r.decision_verification_mode
           FROM decision_intents i
           JOIN decision_issuances x ON x.id=i.issuance_id
           JOIN approval_assignments a ON a.id=x.approval_assignment_id
           JOIN requests r ON r.id=x.request_id
           WHERE i.token_digest=?""",
        (digest,),
    ).fetchone()


def _active(conn: sqlite3.Connection, settings: Settings, state: sqlite3.Row | None, now: float) -> None:
    if not state or (
        state["issuance_state"] != "ACTIVE" or state["used_at"] is not None
        or state["expires_at"] <= now or state["issuance_expiry"] <= now
        or state["deadline"] <= now or state["request_state"] not in ("AWAITING", "HELD")
        or state["collaboration_state"] != "OPEN" or state["email_pin_enabled"] != 1
        or state["assignment_epoch"] != state["current_epoch"]
        or state["issuance_epoch"] != state["current_epoch"]
        or state["approval_step_id"] != state["current_step"]
        or state["action_hash"] != state["current_action_hash"]
        or state["recipient_id"] == state["requester_id"]
    ):
        raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
    if conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1":
        raise GrantError("RECOVERY_RECONCILIATION_REQUIRED", 409)
    integration = conn.execute(
        "SELECT enabled FROM integrations WHERE id=?", (state["integration_id"],),
    ).fetchone()
    if not integration or not integration["enabled"]:
        raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
    users = conn.execute(
        "SELECT id,enabled FROM users WHERE id IN (?,?)",
        (state["original_id"], state["recipient_id"]),
    ).fetchall()
    if len(users) != len({state["original_id"], state["recipient_id"]}) or not all(
        user["enabled"] for user in users
    ):
        raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
    email = conn.execute(
        "SELECT email FROM users WHERE id=?", (state["recipient_id"],),
    ).fetchone()
    if not email or not hmac.compare_digest(
        _digest(settings, "recipient-email", email["email"].strip().lower()),
        state["recipient_email_digest"],
    ):
        raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
    if state["delegation_id"]:
        valid = conn.execute(
            """SELECT id FROM delegations WHERE id=? AND delegator_id=?
               AND substitute_id=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>?""",
            (state["delegation_id"], state["original_id"],
             state["recipient_id"], now, now),
        ).fetchone()
        if not valid:
            raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
    elif state["recipient_id"] != state["original_id"]:
        raise GrantError("DECISION_LINK_UNAVAILABLE", 404)
    prior = conn.execute(
        "SELECT decision FROM request_decisions WHERE request_id=? AND actor_id=?",
        (state["request_id"], state["original_id"]),
    ).fetchone()
    if prior and prior["decision"] in ("APPROVED", "DENIED"):
        raise GrantError("DECISION_ALREADY_RECORDED", 409)
    plan = json.loads(state["approval_plan"] or "{}")
    if plan.get("mode") == "SEQUENTIAL":
        waiting = conn.execute(
            """SELECT a.id FROM approval_assignments a
               LEFT JOIN request_decisions v
                 ON v.request_id=a.request_id AND v.actor_id=a.approver_id
               WHERE a.request_id=? AND (v.decision IS NULL OR v.decision='HELD')
               ORDER BY a.position LIMIT 1""",
            (state["request_id"],),
        ).fetchone()
        if not waiting or waiting["id"] != state["approval_assignment_id"]:
            raise GrantError("APPROVAL_STEP_NOT_CURRENT", 409)


def deliverable(conn: sqlite3.Connection, settings: Settings, issuance_id: str, now: float) -> bool:
    row = conn.execute(
        "SELECT token_digest FROM decision_intents WHERE issuance_id=? AND used_at IS NULL LIMIT 1",
        (issuance_id,),
    ).fetchone()
    if not row:
        return False
    try:
        _active(conn, settings, _row_by_digest(conn, row["token_digest"]), now)
        return True
    except GrantError:
        return False


def _limit(conn: sqlite3.Connection, settings: Settings, key: str,
           limit: int, now: float, seconds: int) -> bool:
    hashed = _digest(settings, "attempt", key)
    row = conn.execute("SELECT hits,until FROM rate_limits WHERE key=?", (hashed,)).fetchone()
    if row and row["until"] > now:
        if row["hits"] >= limit:
            return False
        conn.execute("UPDATE rate_limits SET hits=hits+1 WHERE key=?", (hashed,))
    else:
        conn.execute(
            "INSERT INTO rate_limits(key,hits,until) VALUES(?,1,?) "
            "ON CONFLICT(key) DO UPDATE SET hits=1,until=excluded.until",
            (hashed, now + seconds),
        )
    return True


class DecisionLinks:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings

    def preview(self, token: str) -> dict[str, Any]:
        with self.db.transaction(write=False) as conn:
            state = _row_by_digest(conn, _digest(self.settings, "intent", token))
            _active(conn, self.settings, state, time.time())
            from .verification_policy import current_required

            return {
                "outcome": state["outcome"],
                "verification_mode": current_required(conn, state),
                "pin_digits": 4,
                "pin_required": True, "requires_login": False,
                "confirmation_required": True,
                "details_visible": False, "execution_allowed": False,
                "assurance": "EMAIL_LINK_PIN",
            }

    def verify(self, token: str, pin: str, peer: str) -> dict[str, Any]:
        now, context, error = time.time(), None, None
        with self.db.transaction() as conn:
            digest = _digest(self.settings, "intent", token)
            state = _row_by_digest(conn, digest)
            _active(conn, self.settings, state, now)
            if not all((
                _limit(conn, self.settings, "source:" + peer, 30, now, 60),
                _limit(conn, self.settings, "recipient:" + state["recipient_id"], 15, now, 300),
                _limit(conn, self.settings, "installation", 600, now, 60),
            )):
                error = GrantError("PIN_RATE_LIMITED", 429)
            elif not hmac.compare_digest(
                state["pin_digest"], _code_digest(self.settings, state["issuance_id"], pin)
            ):
                new_attempts = state["failed_attempts"] + 1
                conn.execute(
                    "UPDATE decision_issuances SET failed_attempts=?,state=? WHERE id=?",
                    (new_attempts, "LOCKED" if new_attempts >= MAX_PIN_FAILURES else "ACTIVE",
                     state["issuance_id"]),
                )
                audit(conn, state["request_id"], "email-capability",
                      "decision.pin_failed", {
                          "issuance_id": state["issuance_id"],
                          "approval_assignment_id": state["approval_assignment_id"],
                          "failed_attempts": new_attempts,
                          "locked": new_attempts >= MAX_PIN_FAILURES,
                      }, now)
                error = GrantError("PIN_VERIFICATION_FAILED", 403)
            else:
                context = secrets.token_urlsafe(32)
                conn.execute(
                    """INSERT INTO decision_confirmations
                       (context_digest,intent_digest,expires_at,created_at)
                       VALUES(?,?,?,?)""",
                    (_digest(self.settings, "confirmation", context), digest,
                     now + CONFIRM_SECONDS, now),
                )
                audit(conn, state["request_id"], "email-capability",
                      "decision.pin_verified", {
                          "issuance_id": state["issuance_id"],
                          "approval_assignment_id": state["approval_assignment_id"],
                          "recipient_id": state["recipient_id"],
                          "assurance": "EMAIL_LINK_PIN",
                          "verified_person_id": None,
                      }, now)
        if error:
            raise error
        with self.db.transaction(write=False) as conn:
            from .verification_policy import current_required

            item = conn.execute(
                "SELECT * FROM requests WHERE id=?", (state["request_id"],),
            ).fetchone()
            effective_mode = current_required(conn, item)
        action = json.loads(item["action"])
        return {
            "confirmation_token": context, "expires_in": CONFIRM_SECONDS,
            "outcome": state["outcome"],
            "request": {
                "title": item["title"],
                "action_kind": action["kind"],
                "target": action["target"],
                "deadline": item["deadline"],
                "denial_reason_required": bool(item["denial_reason_required"]),
            },
            "assurance": "EMAIL_LINK_PIN",
            "verification_mode": effective_mode,
            "verified_person_id": None,
            "execution_allowed": False,
        }

    def confirm(
        self, token: str, context: str, reason: str,
        actor: Principal | None = None,
        resolve_actor: Callable[[], Principal] | None = None,
    ) -> dict[str, Any]:
        from .core import Core

        now = time.time()
        with self.db.transaction() as conn:
            intent_digest = _digest(self.settings, "intent", token)
            state = _row_by_digest(conn, intent_digest)
            _active(conn, self.settings, state, now)
            checked = conn.execute(
                """SELECT * FROM decision_confirmations
                   WHERE context_digest=? AND intent_digest=? AND consumed_at IS NULL
                     AND expires_at>?""",
                (_digest(self.settings, "confirmation", context), intent_digest, now),
            ).fetchone()
            if not checked:
                raise GrantError("CONFIRMATION_EXPIRED_OR_USED", 409)
            request = conn.execute(
                "SELECT * FROM requests WHERE id=?", (state["request_id"],)
            ).fetchone()
            from .verification_policy import current_required

            effective = current_required(conn, request)
            verified_person_id = None
            if effective == "EMAIL_PIN_PLUS_MFA":
                # Resolve and verify the product session only when the trusted,
                # server-side effective policy requires actual independent MFA.
                # A stale incidental cookie cannot defeat a loginless PIN/OTP
                # capability or incorrectly attribute a mailbox-only action.
                if actor is None and resolve_actor is not None:
                    actor = resolve_actor()
                if not actor or actor.kind != "human" or not actor.session_id:
                    raise GrantError("FRESH_IDENTITY_MFA_REQUIRED", 403)
                require_current_authority(conn, actor)
                if (
                    actor.id != state["recipient_id"]
                    or checked["mfa_verified_at"] is None
                    or checked["verified_user_id"] != actor.id
                    or checked["mfa_session_id"] != actor.session_id
                    or checked["mfa_verified_at"] > now
                    or now - checked["mfa_verified_at"] > 300
                ):
                    raise GrantError("FRESH_IDENTITY_MFA_REQUIRED", 403)
                verified_mfa_user = conn.execute(
                    "SELECT enabled,totp_secret FROM users WHERE id=?",
                    (actor.id,),
                ).fetchone()
                if not verified_mfa_user or (
                    not verified_mfa_user["enabled"]
                    or not verified_mfa_user["totp_secret"]
                ):
                    raise GrantError("FRESH_IDENTITY_MFA_REQUIRED", 403)
                verified_person_id = actor.id
            if effective == "EMAIL_PIN_PLUS_OTP" and not checked["otp_verified_at"]:
                raise GrantError("EMAIL_OTP_REQUIRED", 403)
            if state["outcome"] == "DENIED" and request["denial_reason_required"] and not reason.strip():
                raise GrantError("DENIAL_REASON_REQUIRED", 422)
            assurance = (
                "EMAIL_LINK_PIN_PLUS_MFA"
                if verified_person_id is not None
                else "EMAIL_LINK_PIN_PLUS_OTP"
                if checked["otp_verified_at"] is not None
                else "EMAIL_LINK_PIN"
            )
            Core(self.db, self.settings)._record_vote(
                conn, request, now=now, represented=state["original_id"],
                actual_actor_id=state["recipient_id"], decision=state["outcome"],
                reason=reason, issuance_id=state["issuance_id"],
                actor_assurance=assurance, verified_actor_id=verified_person_id,
            )
            conn.execute(
                "UPDATE decision_confirmations SET consumed_at=? WHERE context_digest=?",
                (now, _digest(self.settings, "confirmation", context)),
            )
            conn.execute(
                "UPDATE decision_intents SET used_at=? WHERE token_digest=?",
                (now, intent_digest),
            )
            if state["outcome"] in ("APPROVED", "DENIED"):
                conn.execute(
                    "UPDATE decision_issuances SET state='CONSUMED' WHERE id=?",
                    (state["issuance_id"],),
                )
            new_state = conn.execute(
                "SELECT state FROM requests WHERE id=?", (state["request_id"],)
            ).fetchone()["state"]
        return {
            "recorded": True, "decision": state["outcome"], "state": new_state,
            "actor_assurance": assurance,
            "verified_person_id": verified_person_id,
            "mfa_verified": verified_person_id is not None,
            "execution_allowed": False,
        }
