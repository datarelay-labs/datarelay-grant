"""Self-only reviewed sample mail with durable at-most-once transport attempts."""
import hmac
import time

from .auth import require_current_authority
from .db import audit, json_text, uid
from .errors import GrantError
from .mail_templates import render_preview, snapshot


def _reviewed_snapshot(core, conn, row):
    from .email_assets import snapshot_logo

    return snapshot_logo(conn, snapshot(row, branding=core._branding(conn)))


def send_reviewed_sample(core, actor, ident, body):
    from .transport import require_transport_unpaused, send_email

    actor.require_admin()
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        require_transport_unpaused(conn)
        row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
        if not row:
            raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
        if body.recipient_user_id and body.recipient_user_id != actor.id:
            raise GrantError("TEST_RECIPIENT_NOT_ALLOWED", 403)
        recipient = conn.execute("SELECT id,email,enabled FROM users WHERE id=?", (actor.id,)).fetchone()
        if not recipient or not recipient["enabled"]:
            raise GrantError("TEST_RECIPIENT_NOT_FOUND", 404)
        template = _reviewed_snapshot(core, conn, row)
    try:
        rendered = render_preview(template, body.event, body.sample.model_dump(),
                                  verification_mode=body.verification_mode)
    except ValueError as exc:
        raise GrantError("NOTIFICATION_RENDER_INVALID", 422) from exc
    event_id, now = uid(), time.time()
    with core.db.transaction() as conn:
        require_current_authority(conn, actor)
        require_transport_unpaused(conn)
        if not body.preview_hash or body.expected_updated_at is None or not body.attempt_id:
            raise GrantError("TEST_SEND_REVIEW_REQUIRED", 409)
        current = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
        current_recipient = conn.execute("SELECT email,enabled FROM users WHERE id=?", (actor.id,)).fetchone()
        if not current or not current_recipient or not current_recipient["enabled"]:
            raise GrantError("TEST_SEND_CHANGED_REVIEW_REQUIRED", 409)
        current_template = _reviewed_snapshot(core, conn, current)
        if (current["updated_at"] != body.expected_updated_at
                or current_template != template or current_recipient["email"] != recipient["email"]):
            raise GrantError("TEST_SEND_CHANGED_REVIEW_REQUIRED", 409)
        expected = core._notification_review_hash(actor, ident, current["updated_at"], body,
                                                   rendered, recipient["email"])
        if not hmac.compare_digest(expected, body.preview_hash):
            raise GrantError("TEST_SEND_CHANGED_REVIEW_REQUIRED", 409)
        if conn.execute("SELECT 1 FROM notification_test_attempts WHERE actor_id=? AND attempt_id=?",
                        (actor.id, body.attempt_id)).fetchone():
            raise GrantError("TEST_SEND_ALREADY_ATTEMPTED", 409)
        recent = conn.execute("SELECT COUNT(*) FROM notification_test_attempts WHERE actor_id=? AND created_at>?",
                              (actor.id, now - 60)).fetchone()[0]
        if recent >= 5:
            raise GrantError("TEST_SEND_RATE_LIMIT", 429)
        conn.execute("INSERT INTO notification_test_attempts VALUES(?,?,?,?,?,?,?,?)", (
            actor.id, body.attempt_id, ident, body.preview_hash, event_id, "ATTEMPTED", now, now,
        ))
        audit(conn, None, actor.id, "notification.test_attempted", {
            "template_set_id": ident, "event_id": event_id, "preview_hash": body.preview_hash,
            "attempt_id": body.attempt_id,
        })
    # Commit the claim before transport. A timeout/crash never grants a replay
    # of this reviewed attempt ID.
    try:
        send_email(core.settings, {"email": recipient["email"]}, json_text(rendered), event_id)
    except Exception as exc:
        changed = time.time()
        with core.db.transaction() as conn:
            conn.execute("UPDATE notification_test_attempts SET state='UNKNOWN',updated_at=? WHERE actor_id=? AND attempt_id=?",
                         (changed, actor.id, body.attempt_id))
            audit(conn, None, actor.id, "notification.test_unknown", {
                "template_set_id": ident, "event_id": event_id, "attempt_id": body.attempt_id,
            })
        raise GrantError("TEST_SEND_OUTCOME_UNKNOWN", 502) from exc
    changed = time.time()
    with core.db.transaction() as conn:
        conn.execute("UPDATE notification_test_attempts SET state='ACCEPTED',updated_at=? WHERE actor_id=? AND attempt_id=?",
                     (changed, actor.id, body.attempt_id))
        audit(conn, None, actor.id, "notification.test_accepted", {
            "template_set_id": ident, "event": body.event, "recipient_user_id": actor.id,
            "event_id": event_id, "attempt_id": body.attempt_id,
        })
    return {"attempt_id": body.attempt_id, "state": "ACCEPTED", "transport_accepted": True,
            "receipt_confirmed": False, "execution_allowed": False, "event_id": event_id}


def test_send_attempt_status(core, actor, ident: str, attempt_id: str) -> dict:
    actor.require_admin()
    if not 16 <= len(attempt_id) <= 64:
        raise GrantError("TEST_SEND_ATTEMPT_NOT_FOUND", 404)
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        row = conn.execute(
            "SELECT attempt_id,template_id,event_id,state,created_at,updated_at "
            "FROM notification_test_attempts WHERE actor_id=? AND attempt_id=? AND template_id=?",
            (actor.id, attempt_id, ident),
        ).fetchone()
        if not row:
            raise GrantError("TEST_SEND_ATTEMPT_NOT_FOUND", 404)
    state = row["state"]
    return {**dict(row), "transport_accepted": state == "ACCEPTED",
            "receipt_confirmed": False, "execution_allowed": False,
            "outcome_ambiguous": state == "UNKNOWN"}
