"""Focused remaining email WBS contracts; disposable/synthetic effects only."""
from copy import deepcopy

import pytest
from test_email_publication import publish, template
from test_email_renderer import CONTEXT
from test_notification_center import activate, policy_payload, request_payload

from grant.email_design import EmailDesign, validate_design
from grant.email_renderer import OUTCOMES, PREVIEW_ORIGIN, EmailSecurity, compose_email
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, normalize_snapshot, render_preview


def _security(mode="EMAIL_PIN"):
    return EmailSecurity(mode, "0000", {key: PREVIEW_ORIGIN + key.lower() for key in OUTCOMES}, True)


def _content(body="Synthetic **important**\n- first\n- second"):
    return {"subject": "Review {{request_title}}", "body": body,
            "brand_name": "DataRelay Grant", "sender_display_name": "DataRelay Grant"}


@pytest.mark.parametrize("field,value", [
    ("button_font_size", 13), ("button_font_size", 21),
    ("button_padding_x", 15), ("button_padding_x", 33),
    ("button_padding_y", 9), ("button_padding_y", 21),
    ("button_gap", 7), ("button_gap", 25),
    ("button_radius", -1), ("button_radius", 17),
])
def test_u3_02_server_rejects_button_dimensions_outside_editor_bounds(field, value):
    payload = {"shared_layout_revision": 5, "styles": {field: value}}
    with pytest.raises(ValueError):
        validate_design(payload)


def test_u3_04_action_identity_is_not_an_authoring_field_and_suffixes_stay_literal():
    for key in ("approve_label", "approve_url", "action_order", "details_url"):
        with pytest.raises(ValueError):
            validate_design({"shared_layout_revision": 5, key: "attacker controlled"})
    for suffix in ("{{request_url}}", "https://example.invalid", "line\nfeed", "bidi\u202e"):
        with pytest.raises(ValueError):
            validate_design({"shared_layout_revision": 5, "button_suffixes": {"approve": suffix}})
    design = EmailDesign(shared_layout_revision=5,
                         button_suffixes={"approve": "Scheduled window", "hold": "Need review",
                                          "deny": "Not allowed", "details": "Read context"}).model_dump()
    result = compose_email(_content("Review target."), CONTEXT, "requested",
                           security=_security(), design=design, sample=True)
    for canonical, suffix in (("Approve", "Scheduled window"), ("Hold", "Need review"),
                              ("Deny", "Not allowed"), ("View Details", "Read context")):
        assert canonical in result["html"] and suffix in result["html"]
    assert result["html"].count("grant-mail-block-actions") == 4
    assert result["text"].count(PREVIEW_ORIGIN + "details") == 1


@pytest.mark.parametrize("event", list(DEFAULT_EVENT_TEMPLATES))
def test_u3_05_only_requested_and_reminder_have_three_decisions(event):
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
                "design": EmailDesign(shared_layout_revision=5).model_dump()}
    result = render_preview(template, event, CONTEXT)
    eligible = event in {"requested", "reminder"}
    assert result["html"].count("grant-mail-block-actions") == (4 if eligible else 1)
    for outcome in ("approved", "held", "denied"):
        assert ((PREVIEW_ORIGIN + outcome) in result["text"]) is eligible
    assert PREVIEW_ORIGIN + "details" in result["text"]


@pytest.mark.parametrize("mode", ["EMAIL_PIN", "EMAIL_PIN_PLUS_OTP", "EMAIL_PIN_PLUS_MFA"])
def test_u3_06_verification_guidance_never_claims_link_opening_is_confirmation(mode):
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
                "design": EmailDesign(shared_layout_revision=5).model_dump()}
    result = render_preview(template, "requested", CONTEXT, verification_mode=mode)
    text = result["text"]
    assert "Opening a link never records a vote" in text
    assert "Confirm" in text and "0000" in text
    if mode == "EMAIL_PIN":
        assert "No account login is required" in text and "additional email OTP" not in text
    elif mode == "EMAIL_PIN_PLUS_OTP":
        assert "additional email OTP" in text and "not an independent MFA factor" in text
    else:
        assert "Sign in" in text and "fresh MFA" in text


def test_u3_07_safe_formatting_and_u4_01_one_renderer_contract_are_literal_and_reproducible():
    design = EmailDesign(shared_layout_revision=5, rich_text=True, paragraph_alignment="center").model_dump()
    hostile = "Before <script>alert(1)</script> **important**\n- alpha\n- beta"
    result = compose_email(_content(hostile), CONTEXT, "requested",
                           security=_security(), design=design, sample=True)
    assert "<script>" not in result["html"] and "&lt;script&gt;" in result["html"]
    assert "<strong>important</strong>" in result["html"] and "<ul " in result["html"]
    assert "text-align:center" in result["html"]
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design}
    preview = render_preview(template, "requested", CONTEXT)
    normalized = normalize_snapshot(template)
    assert render_preview(normalized, "requested", CONTEXT) == preview
    assert preview["renderer_revision"] == "mjml-5.4.1-layout-5"
    assert len(preview["layout_sha256"]) == 64


@pytest.mark.parametrize("bad", ["Header\rBcc: x", "Header\nBcc: x", "bad\u0000", "bad\ud800"])
def test_u3_07_malformed_subject_or_design_text_fails_closed(bad):
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
                "design": EmailDesign(shared_layout_revision=5).model_dump()}
    template["templates"]["requested"]["subject"] = bad
    with pytest.raises((ValueError, UnicodeEncodeError)):
        normalize_snapshot(template)


def test_u4_06_unsaved_preview_is_admin_only_and_does_not_write_product_state(env):
    admin = env.human("admin")
    approver = env.human("approver")
    payload = {"event": "requested", "sample": deepcopy(CONTEXT), "verification_mode": "EMAIL_PIN",
               "template": {"name": "Readonly draft", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
                            "design": EmailDesign(shared_layout_revision=5).model_dump()}}
    tables = ("requests", "outbox", "decision_issuances", "decision_intents",
              "email_templates", "email_template_revisions", "notification_test_attempts", "audit")
    with env.db.transaction(write=False) as conn:
        before = {name: conn.execute("SELECT COUNT(*) FROM " + name).fetchone()[0] for name in tables}
    response = admin.post("/api/v1/notification-template-drafts/preview", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["transport_accepted"] is False and body["receipt_confirmed"] is False
    assert body["execution_allowed"] is False and "0000" in body["rendered"]["body"]
    assert "/api/v1/decision-intents/" not in str(body)
    assert approver.post("/api/v1/notification-template-drafts/preview", json=payload).status_code == 403
    with env.db.transaction(write=False) as conn:
        after = {name: conn.execute("SELECT COUNT(*) FROM " + name).fetchone()[0] for name in tables}
    assert before == after


def test_u5_01_save_draft_does_not_change_published_pointer_or_revision_snapshot(env):
    admin = env.human("admin")
    saved = template(admin)
    published = publish(admin, saved["id"])
    assert published.status_code == 200
    row = published.json()
    with env.db.transaction(write=False) as conn:
        immutable_before = [tuple(item) for item in conn.execute(
            "SELECT revision,snapshot,snapshot_hash FROM email_template_revisions WHERE template_id=? ORDER BY revision",
            (saved["id"],))]
    changed = deepcopy(DEFAULT_EVENT_TEMPLATES)
    changed["requested"]["body"] = "Saved draft only"
    updated = admin.put("/api/v1/notification-template-sets/" + saved["id"], json={
        "name": saved["name"], "templates": changed, "enabled": True,
        "design": EmailDesign(shared_layout_revision=5).model_dump(), "expected_updated_at": row["updated_at"],
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["published_revision"] == 1 and updated.json()["draft_revision"] == 2
    with env.db.transaction(write=False) as conn:
        immutable_after = [tuple(item) for item in conn.execute(
            "SELECT revision,snapshot,snapshot_hash FROM email_template_revisions WHERE template_id=? ORDER BY revision",
            (saved["id"],))]
    assert immutable_after == immutable_before


def test_u5_05_and_u5_07_new_publication_and_rollback_never_rewrite_old_request_or_history(env):
    admin = env.human("admin")
    saved = template(admin)
    first = publish(admin, saved["id"]).json()
    policy = admin.post("/api/v1/profiles", json=policy_payload(env, saved["id"])).json()
    activate(admin, policy["id"])
    assert env.api.post("/api/v1/requests", json=request_payload(policy["id"], "wbs-before")).status_code == 202
    with env.db.transaction(write=False) as conn:
        request_before = conn.execute("SELECT mail_template FROM requests WHERE external_id='wbs-before'").fetchone()[0]
        history_before = [tuple(row) for row in conn.execute("SELECT revision,snapshot_hash FROM email_template_revisions WHERE template_id=? ORDER BY revision", (saved["id"],))]
    design = EmailDesign(shared_layout_revision=5).model_dump()
    design["styles"]["button_radius"] = 12
    updated = admin.put("/api/v1/notification-template-sets/" + saved["id"], json={
        "name": saved["name"], "templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "enabled": True,
        "design": design, "expected_updated_at": first["updated_at"],
    })
    assert updated.status_code == 200
    assert publish(admin, saved["id"]).json()["published_revision"] == 2
    rollback = publish(admin, saved["id"], 1)
    assert rollback.status_code == 200 and rollback.json()["published_revision"] == 3
    with env.db.transaction(write=False) as conn:
        assert conn.execute("SELECT mail_template FROM requests WHERE external_id='wbs-before'").fetchone()[0] == request_before
        history = [tuple(row) for row in conn.execute("SELECT revision,snapshot_hash FROM email_template_revisions WHERE template_id=? ORDER BY revision", (saved["id"],))]
    assert history[:len(history_before)] == history_before
    assert history[0][1] == history[-1][1]


def test_u6_01_brand_and_footer_are_presentation_only_and_mandatory_notice_remains():
    design = EmailDesign(shared_layout_revision=5, footer="Operations team footer").model_dump()
    content = {"subject": "Synthetic", "body": "Review this request", "brand_name": "Example Operations",
               "sender_display_name": "Different SMTP display"}
    rendered = compose_email(content, CONTEXT, "requested", security=_security(), design=design, sample=True)
    assert "Example Operations" in rendered["html"]
    assert "Operations team footer" in rendered["html"]
    assert "View Details requires the existing account read access" in rendered["text"]
    assert "Different SMTP display" not in rendered["html"]
