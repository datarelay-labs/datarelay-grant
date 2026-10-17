"""U5 event diffs and immutable historical read; only disposable test state."""
from copy import deepcopy

from test_email_publication import publish

from grant.email_design import EmailDesign
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES


def create(admin):
    payload = {"name": "Inspect history", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
               "design": EmailDesign(shared_layout_revision=5).model_dump()}
    row = admin.post("/api/v1/notification-template-sets", json=payload)
    assert row.status_code == 201, row.text
    return payload, row.json()


def test_preheader_diff_is_event_scoped_and_palette_diff_is_field_scoped(env):
    admin = env.human("admin")
    payload, row = create(admin)
    saved = publish(admin, row["id"]).json()
    payload["design"]["event_preheaders"] = {"reminder": "Reminder-only summary"}
    payload["design"]["palette"]["page_background"] = "#e5e7eb"
    prefix = "/api/v1/notification-template-sets/" + row["id"]
    updated = admin.put(prefix, json={**payload, "expected_updated_at": saved["updated_at"]})
    assert updated.status_code == 200, updated.text
    result = admin.post(prefix + "/publication-review", json={}).json()["comparison"]
    assert result["changed_events"] == ["reminder"]
    assert result["event_changes"] == {"reminder": ["preheader"]}
    assert result["shared_fields"] == ["palette.page_background"]


def test_historical_preview_is_readonly_exact_and_authorized(env):
    admin = env.human("admin")
    approver = env.human("approver")  # Complete synthetic login before the no-write baseline.
    payload, row = create(admin)
    saved = publish(admin, row["id"]).json()
    prefix = "/api/v1/notification-template-sets/" + row["id"]
    payload["templates"]["requested"]["body"] = "New draft only"
    assert admin.put(prefix, json={**payload, "expected_updated_at": saved["updated_at"]}).status_code == 200
    tables = ("email_templates", "email_template_revisions", "requests", "outbox", "audit", "decision_issuances")
    with env.db.transaction(write=False) as conn:
        before = {table: [tuple(value) for value in conn.execute("SELECT * FROM " + table)] for table in tables}
    result = admin.get(prefix + "/versions/1/preview?event=requested")
    assert result.status_code == 200, result.text
    value = result.json()
    assert value["template_id"] == row["id"] and value["revision"] == 1
    assert value["read_only"] is True and value["execution_allowed"] is False
    assert value["event"] == "requested" and value["created_by"]
    assert value["created_at"] > 0 and len(value["snapshot_hash"]) == 64
    assert "New draft only" not in value["rendered"]["body"]
    assert "0000" in value["rendered"]["body"]
    for suffix, code in (("/versions/999/preview", 404), ("/versions/1/preview?event=invalid", 422)):
        assert admin.get(prefix + suffix).status_code == code
    assert approver.get(prefix + "/versions/1/preview").status_code == 403
    with env.db.transaction(write=False) as conn:
        after = {table: [tuple(value) for value in conn.execute("SELECT * FROM " + table)] for table in tables}
    assert before == after


def test_corrupted_historical_snapshot_is_not_rendered(env):
    admin = env.human("admin")
    _, row = create(admin)
    assert publish(admin, row["id"]).status_code == 200
    with env.db.transaction() as conn:
        conn.execute("UPDATE email_template_revisions SET snapshot_hash=? WHERE template_id=?", ("0" * 64, row["id"]))
    result = admin.get("/api/v1/notification-template-sets/" + row["id"] + "/versions/1/preview")
    assert result.status_code == 409
    assert "EMAIL_REVISION_INTEGRITY" in result.text
