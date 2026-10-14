"""Review-bound future-only email publication. No policy or issued-mail mutation."""
import hashlib
import hmac
import json
import math
import time

from pydantic import BaseModel, ConfigDict, Field

from .auth import require_current_authority
from .db import audit, json_text
from .errors import GrantError
from .mail_templates import normalize_snapshot, render_preview, snapshot


class PublicationReview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source_revision: int | None = Field(default=None, ge=1)


class PublicationCommit(PublicationReview):
    expected_updated_at: float = Field(ge=0, allow_inf_nan=False)
    review_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    reason: str = Field(min_length=1, max_length=500)


def digest(value):
    return hashlib.sha256(json_text(value).encode()).hexdigest()


def candidate(core, conn, actor, ident, source_revision):
    row = conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone()
    if not row:
        raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
    if not row["enabled"]:
        raise GrantError("EMAIL_TEMPLATE_DISABLED", 409)
    if source_revision is None:
        if not row["design_json"]:
            raise GrantError("VISUAL_DRAFT_OPT_IN_REQUIRED", 409)
        value = snapshot(row, branding=core._branding(conn))
    else:
        source = conn.execute("SELECT snapshot,snapshot_hash FROM email_template_revisions WHERE template_id=? AND revision=?",
                              (ident, source_revision)).fetchone()
        if not source:
            raise GrantError("EMAIL_REVISION_NOT_FOUND", 404)
        value = json.loads(source["snapshot"])
        if digest(value) != source["snapshot_hash"]:
            raise GrantError("EMAIL_REVISION_INTEGRITY", 409)
    # Validate reproduction against the immutable renderer without rewriting the
    # stored representation: a rollback must preserve the original snapshot hash.
    try:
        normalize_snapshot(value)
    except ValueError as exc:
        raise GrantError("EMAIL_REVISION_INTEGRITY", 409) from exc
    policies = [dict(item) for item in conn.execute(
        "SELECT id,profile_id,version,name,updated_at FROM profile_versions "
        "WHERE lifecycle='ACTIVE' AND email_template_id=? ORDER BY id LIMIT 501", (ident,),
    )]
    if len(policies) > 500:
        raise GrantError("PUBLICATION_IMPACT_TOO_LARGE", 409)
    proof = {"actor": actor.id, "template_id": ident, "expected_updated_at": row["updated_at"],
             "published_revision": row["published_revision"], "source_revision": source_revision,
             "snapshot_hash": digest(value), "active_policies": policies}
    return row, value, proof


SAMPLE = {"request_title": "Sample approval request", "request_url": "https://example.invalid/requests/sample",
          "external_id": "SAMPLE-PUBLISH", "action_kind": "service.change", "target": "sample-target",
          "reason": "Publication review only", "deadline": "2030-01-01T00:00:00Z",
          "decision_state": "AWAITING", "execution_state": "NOT_STARTED"}


def render_checked(value, event):
    try:
        return render_preview(value, event, SAMPLE)
    except ValueError as exc:
        raise GrantError("NOTIFICATION_RENDER_INVALID", 422) from exc


def review_publication(core, actor, ident, body):
    actor.require_admin()
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        _, value, proof = candidate(core, conn, actor, ident, body.source_revision)
    rendered = {event: render_checked(value, event) for event in value["templates"]}
    return {**proof, "review_hash": digest(proof), "future_requests_only": True,
            "execution_allowed": False, "rendered": rendered["requested"],
            "events": [{"event": event, "subject": item["subject"], "html_bytes": len(item["html"].encode())}
                       for event, item in rendered.items()]}


def commit_publication(core, actor, ident, body):
    actor.require_admin()
    if not body.reason.strip():
        raise GrantError("PUBLICATION_REASON_REQUIRED", 422)
    with core.db.transaction() as conn:
        require_current_authority(conn, actor)
        row, value, proof = candidate(core, conn, actor, ident, body.source_revision)
        if row["updated_at"] != body.expected_updated_at or not hmac.compare_digest(digest(proof), body.review_hash):
            raise GrantError("PUBLICATION_CHANGED_REVIEW_REQUIRED", 409)
        # Do not allow direct POST to publish a template the full event renderer rejects.
        for event in value["templates"]:
            render_checked(value, event)
        revision = conn.execute("SELECT COALESCE(MAX(revision),0)+1 FROM email_template_revisions WHERE template_id=?",
                                (ident,)).fetchone()[0]
        now = max(time.time(), math.nextafter(row["updated_at"], math.inf))
        conn.execute("INSERT INTO email_template_revisions VALUES(?,?,?,?,?,?,?)", (
            ident, revision, json_text(value), digest(value), actor.id, now, body.reason.strip(),
        ))
        conn.execute("UPDATE email_templates SET published_revision=?,updated_at=? WHERE id=? AND updated_at=?",
                     (revision, now, ident, body.expected_updated_at))
        audit(conn, None, actor.id, "notification_template.published", {
            "template_set_id": ident, "revision": revision, "source_revision": body.source_revision,
            "snapshot_hash": digest(value), "reason": body.reason.strip(),
            "active_policy_count": len(proof["active_policies"]), "future_requests_only": True,
        })
        return core._template_set_view(conn.execute("SELECT * FROM email_templates WHERE id=?", (ident,)).fetchone())


def publication_history(core, actor, ident):
    actor.require_admin()
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        if not conn.execute("SELECT 1 FROM email_templates WHERE id=?", (ident,)).fetchone():
            raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
        return [dict(row) for row in conn.execute(
            "SELECT revision,snapshot_hash,created_by,created_at,reason FROM email_template_revisions "
            "WHERE template_id=? ORDER BY revision DESC LIMIT 50", (ident,),
        )]
