"""ET-5 publication and rollback use disposable synthetic installation state."""
import json
from copy import deepcopy

from test_notification_center import activate, policy_payload, request_payload

from grant.email_design import EmailDesign
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES


def template(admin):
    result = admin.post("/api/v1/notification-template-sets", json={
        "name": "Publication sample", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
        "design": EmailDesign().model_dump(),
    })
    assert result.status_code == 201
    return result.json()


def publish(admin, ident, source_revision=None):
    prefix = "/api/v1/notification-template-sets/" + ident
    review = admin.post(prefix + "/publication-review", json={"source_revision": source_revision})
    assert review.status_code == 200, review.text
    data = review.json()
    return admin.post(prefix + "/publish", json={
        "source_revision": source_revision, "expected_updated_at": data["expected_updated_at"],
        "review_hash": data["review_hash"], "reason": "Synthetic qualification only",
    })


def test_publish_and_rollback_append_immutable_versions_and_preserve_request_bytes(env):
    admin = env.human("admin")
    saved = template(admin)
    first = publish(admin, saved["id"])
    assert first.status_code == 200, first.text
    assert first.json()["published_revision"] == 1
    policy = admin.post("/api/v1/profiles", json=policy_payload(env, saved["id"])).json()
    activate(admin, policy["id"])
    request = env.api.post("/api/v1/requests", json=request_payload(policy["id"], "before-publish"))
    assert request.status_code == 202, request.text
    with env.db.transaction(write=False) as conn:
        before = {table: [tuple(row) for row in conn.execute("SELECT * FROM " + table + " ORDER BY 1")]
                  for table in ("requests", "outbox", "decision_issuances", "decision_intents", "profile_versions")}
        snapshot_before = json.loads(conn.execute("SELECT mail_template FROM requests WHERE external_id='before-publish'").fetchone()[0])
    changed = {"name": saved["name"], "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
               "design": EmailDesign().model_dump(), "expected_updated_at": first.json()["updated_at"]}
    changed["design"]["styles"]["button_font_size"] = 20
    updated = admin.put("/api/v1/notification-template-sets/" + saved["id"], json=changed)
    assert updated.status_code == 200, updated.text
    second = publish(admin, saved["id"])
    assert second.status_code == 200, second.text
    assert second.json()["published_revision"] == 2
    with env.db.transaction(write=False) as conn:
        after = {table: [tuple(row) for row in conn.execute("SELECT * FROM " + table + " ORDER BY 1")] for table in before}
    assert after == before
    assert env.api.post("/api/v1/requests", json=request_payload(policy["id"], "after-publish")).status_code == 202
    with env.db.transaction(write=False) as conn:
        future = json.loads(conn.execute("SELECT mail_template FROM requests WHERE external_id='after-publish'").fetchone()[0])
    assert future["design"]["styles"]["button_font_size"] == 20
    assert snapshot_before["design"]["styles"]["button_font_size"] == 16
    rollback = publish(admin, saved["id"], 1)
    assert rollback.status_code == 200
    assert rollback.json()["published_revision"] == 3
    versions = admin.get("/api/v1/notification-template-sets/" + saved["id"] + "/versions").json()
    assert [row["revision"] for row in versions] == [3, 2, 1]
    assert versions[0]["snapshot_hash"] == versions[2]["snapshot_hash"]


def test_publication_review_is_readonly_and_stale_cas_is_rejected(env):
    admin = env.human("admin")
    saved = template(admin)
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    with env.db.transaction(write=False) as conn:
        before = conn.execute("SELECT COUNT(*) FROM audit").fetchone()[0]
    data = admin.post(prefix + "/publication-review", json={}).json()
    assert len(data["events"]) == 9
    assert data["execution_allowed"] is False
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT COUNT(*) FROM audit").fetchone()[0] == before
    body = {"expected_updated_at": data["expected_updated_at"], "review_hash": data["review_hash"], "reason": "Reviewed"}
    assert admin.post(prefix + "/publish", json=body).status_code == 200
    assert admin.post(prefix + "/publish", json=body).status_code == 409
    assert env.human("approver").get(prefix + "/versions").status_code == 403
    assert env.human("approver").post(prefix + "/publication-review", json={}).status_code == 403
    assert env.human("approver").post(prefix + "/publish", json=body).status_code == 403


def test_branding_change_invalidates_publication_review(env):
    admin = env.human("admin")
    saved = template(admin)
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    data = admin.post(prefix + "/publication-review", json={}).json()
    with env.db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='Changed brand' WHERE key='notification_brand_name'")
    response = admin.post(prefix + "/publish", json={"expected_updated_at": data["expected_updated_at"],
                                                    "review_hash": data["review_hash"], "reason": "Stale review"})
    assert response.status_code == 409


def test_active_policy_impact_change_invalidates_prior_publication_review(env):
    admin = env.human("admin")
    saved = template(admin)
    assert publish(admin, saved["id"]).status_code == 200
    policy = admin.post("/api/v1/profiles", json=policy_payload(env, saved["id"])).json()
    activate(admin, policy["id"])
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    review = admin.post(prefix + "/publication-review", json={}).json()
    assert len(review["active_policies"]) == 1
    with env.db.transaction() as conn:
        conn.execute("UPDATE profile_versions SET updated_at=updated_at+1 WHERE profile_id=? AND lifecycle='ACTIVE'", (policy["id"],))
    result = admin.post(prefix + "/publish", json={
        "expected_updated_at": review["expected_updated_at"], "review_hash": review["review_hash"], "reason": "Old impact review",
    })
    assert result.status_code == 409
    assert len(admin.get(prefix + "/versions").json()) == 1
