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
