"""ET-4 readonly draft preview and reviewed synthetic mail contracts."""
import json
from copy import deepcopy

import pytest
from test_email_renderer import CONTEXT

from grant.email_design import EmailDesign
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES


def draft_payload():
    return {"event": "requested", "sample": deepcopy(CONTEXT), "verification_mode": "EMAIL_PIN",
            "template": {"name": "Unsaved sample", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
                         "design": EmailDesign().model_dump()}}


def test_unsaved_preview_has_zero_writes_and_no_authorizing_material(env):
    admin = env.human("admin")
    with env.db.transaction(write=False) as conn:
        tables = ("requests", "outbox", "decision_issuances", "decision_intents", "email_templates", "audit")
        before = {table: conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in tables}
    payload = draft_payload()
    payload["template"]["design"]["styles"]["button_font_size"] = 20
    preview = admin.post("/api/v1/notification-template-drafts/preview", json=payload)
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["preview_kind"] == "unsaved_draft"
    assert "font-size:20px" in data["rendered"]["html"]
    assert "0000" in data["rendered"]["body"]
    assert "/api/v1/decision-intents/" not in json.dumps(data)
    assert data["transport_accepted"] is False and data["execution_allowed"] is False
    with env.db.transaction(write=False) as conn:
        after = {table: conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in tables}
    assert after == before


@pytest.mark.parametrize("mode", ["EMAIL_PIN", "EMAIL_PIN_PLUS_OTP", "EMAIL_PIN_PLUS_MFA"])
def test_draft_and_saved_preview_share_exact_renderer(env, mode):
    admin = env.human("admin")
    payload = draft_payload()
    payload["verification_mode"] = mode
    saved = admin.post("/api/v1/notification-template-sets", json=payload["template"]).json()
    draft = admin.post("/api/v1/notification-template-drafts/preview", json=payload)
    stored = admin.post("/api/v1/notification-template-sets/" + saved["id"] + "/preview", json={
        key: value for key, value in payload.items() if key != "template"
    })
    assert draft.status_code == stored.status_code == 200
    assert draft.json()["rendered"] == stored.json()["rendered"]
    assert stored.json()["template_updated_at"] == saved["updated_at"]
    assert len(stored.json()["preview_hash"]) == 64


def test_unsaved_preview_rejects_non_admin_and_invalid_design(env):
    payload = draft_payload()
    assert env.human("approver").post("/api/v1/notification-template-drafts/preview", json=payload).status_code == 403
    payload["template"]["design"]["styles"]["button_font_size"] = 0
    assert env.human("admin").post("/api/v1/notification-template-drafts/preview", json=payload).status_code == 422


def reviewed_test_send(env, admin, attempt_id="synthetic-once-001"):
    payload = draft_payload()
    saved = admin.post("/api/v1/notification-template-sets", json=payload["template"]).json()
    sample = {key: value for key, value in payload.items() if key != "template"}
    preview = admin.post("/api/v1/notification-template-sets/" + saved["id"] + "/preview", json=sample)
    assert preview.status_code == 200, preview.text
    result = preview.json()
    return saved, {**sample, "expected_updated_at": result["template_updated_at"],
                   "preview_hash": result["preview_hash"], "attempt_id": attempt_id}


def test_reviewed_test_send_binds_saved_review_and_exposes_durable_status(env, monkeypatch):
    admin = env.human("admin")
    saved, payload = reviewed_test_send(env, admin)
    sent = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: sent.append(args))
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    response = admin.post(prefix + "/test-send", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["transport_accepted"] is True
    assert response.json()["receipt_confirmed"] is False
    assert response.json()["attempt_id"] == payload["attempt_id"]
    assert admin.post(prefix + "/test-send", json=payload).status_code == 409
    status = admin.get(prefix + "/test-send-attempts/" + payload["attempt_id"])
    assert status.status_code == 200, status.text
    assert status.json()["state"] == "ACCEPTED"
    assert status.json()["transport_accepted"] is True
    assert status.json()["receipt_confirmed"] is False
    assert status.json()["execution_allowed"] is False
    assert len(sent) == 1
    assert "0000" in json.loads(sent[0][2])["body"]


def test_unreviewed_or_stale_test_send_rejects_before_transport_and_no_attempt_record(env, monkeypatch):
    admin = env.human("admin")
    saved, payload = reviewed_test_send(env, admin, "synthetic-stale-001")
    sent = []
    monkeypatch.setattr("grant.transport.send_email", lambda *args: sent.append(args))
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    missing = {key: value for key, value in payload.items() if key not in ("expected_updated_at", "preview_hash", "attempt_id")}
    assert admin.post(prefix + "/test-send", json=missing).status_code == 409
    changed = {**payload, "sample": {**payload["sample"], "target": "changed-after-review"}}
    assert admin.post(prefix + "/test-send", json=changed).status_code == 409
    result = admin.put(prefix, json={
        **draft_payload()["template"], "name": "Changed after review", "expected_updated_at": saved["updated_at"],
    })
    assert result.status_code == 200, result.text
    assert admin.post(prefix + "/test-send", json=payload).status_code == 409
    assert admin.get(prefix + "/test-send-attempts/" + payload["attempt_id"]).status_code == 404
    assert sent == []


def test_ambiguous_transport_is_durable_unknown_and_replay_is_refused(env, monkeypatch):
    admin = env.human("admin")
    saved, payload = reviewed_test_send(env, admin, "synthetic-unknown-001")
    sent = []

    def failed(*args):
        sent.append(args)
        raise RuntimeError("synthetic ambiguous transport")

    monkeypatch.setattr("grant.transport.send_email", failed)
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    assert admin.post(prefix + "/test-send", json=payload).status_code == 502
    assert admin.post(prefix + "/test-send", json=payload).status_code == 409
    status = admin.get(prefix + "/test-send-attempts/" + payload["attempt_id"])
    assert status.status_code == 200
    assert status.json()["state"] == "UNKNOWN"
    assert status.json()["transport_accepted"] is False
    assert status.json()["receipt_confirmed"] is False
    assert len(sent) == 1


def test_test_send_attempt_status_is_actor_and_template_scoped(env):
    admin = env.human("admin")
    saved, payload = reviewed_test_send(env, admin, "synthetic-scope-001")
    prefix = "/api/v1/notification-template-sets/" + saved["id"]
    with env.db.transaction() as conn:
        conn.execute(
            "INSERT INTO notification_test_attempts(actor_id,attempt_id,template_id,preview_hash,event_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            (env.users["admin"]["id"], payload["attempt_id"], saved["id"], payload["preview_hash"], "event-scope", "ACCEPTED", 1.0, 1.0),
        )
    assert env.human("approver").get(prefix + "/test-send-attempts/" + payload["attempt_id"]).status_code == 403
    other = admin.post("/api/v1/notification-template-sets", json={**draft_payload()["template"], "name": "Other"}).json()
    assert admin.get("/api/v1/notification-template-sets/" + other["id"] + "/test-send-attempts/" + payload["attempt_id"]).status_code == 404



def test_v13_to_v14_attempt_table_migration_preserves_existing_product_rows(env):
    from grant.db import Database

    admin = env.human("admin")
    admin.post("/api/v1/notification-template-sets", json=draft_payload()["template"])
    preserved = ("users", "email_templates", "email_template_revisions", "notification_assets", "audit")
    with env.db.transaction() as conn:
        before = {table: [tuple(row) for row in conn.execute("SELECT * FROM " + table + " ORDER BY 1")] for table in preserved}
        conn.execute("DROP TABLE notification_test_attempts")
        conn.execute("PRAGMA user_version=13")
    upgraded = Database(env.db.path)
    with upgraded.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 14
        columns = {row[1] for row in conn.execute("PRAGMA table_info(notification_test_attempts)")}
        assert {"actor_id","attempt_id","template_id","preview_hash","event_id","state","created_at","updated_at"} <= columns
        after = {table: [tuple(row) for row in conn.execute("SELECT * FROM " + table + " ORDER BY 1")] for table in preserved}
        assert after == before
