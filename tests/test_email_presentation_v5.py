"""U3.01/03 recipient-only presentation, not a change to approval authority."""
from copy import deepcopy

import pytest
from test_email_renderer import CONTEXT

from grant.email_design import BLOCKS, validate_design
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, render_preview

DARK = {"page_background": "#030712", "content_background": "#111827",
        "body_text": "#f9fafb", "brand_text": "#cbd5e1"}
EVENTS = {
    "requested": ("Approval requested", "승인 요청"), "reminder": ("Approval reminder", "승인 알림"),
    "approved": ("Approved", "승인됨"), "denied": ("Denied", "거부됨"),
    "expired": ("Expired", "만료됨"), "cancelled": ("Cancelled", "취소됨"),
    "execution_succeeded": ("Execution reported successful", "실행 성공 보고"),
    "execution_failed": ("Execution reported failed", "실행 실패 보고"),
    "execution_unknown": ("Execution status unknown", "실행 상태 확인 필요"),
}


@pytest.mark.parametrize("event", list(EVENTS))
@pytest.mark.parametrize("locale", ["en", "ko"])
def test_current_event_status_and_required_order_are_authoritative(event, locale):
    design = {"shared_layout_revision": 5, "locale": locale, "palette": DARK}
    result = render_preview({"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design}, event, CONTEXT)
    label = EVENTS[event][locale == "ko"]
    assert label in result["html"] and label in result["text"]
    blocks = ["brand", "heading", "message", "request_context", "actions"]
    if event in ("requested", "reminder"):
        blocks.append("verification")
    blocks.append("footer")
    positions = [result["html"].index("grant-mail-block-" + block) for block in blocks]
    assert positions == sorted(positions)
    assert result["html"].index("grant-mail-block-brand") < result["html"].index("grant-mail-event-status") < result["html"].index("grant-mail-block-heading")
    assert result["html"].count("grant-mail-block-actions") == (4 if event in ("requested", "reminder") else 1)
    assert all(value in result["html"] for value in DARK.values())
    if event in ("requested", "reminder"):
        approve_label, details_label = ("승인", "상세 보기") if locale == "ko" else ("Approve", "View Details")
        approve_index = result["text"].index("\n\n" + approve_label + ": https://example.invalid/grant-preview/approved")
        details_index = result["text"].index("\n\n" + details_label + ": https://example.invalid/grant-preview/details")
        pin_label = "4자리 확인 PIN" if locale == "ko" else "Four-digit confirmation PIN"
        assert approve_index < details_index < result["text"].index("\n\n" + pin_label)
    assert validate_design(design)["blocks"] == BLOCKS


@pytest.mark.parametrize("palette", [
    {**DARK, "body_text": "#111827"}, {**DARK, "brand_text": "#111827"},
    {**DARK, "body_text": "rgb(0,0,0)"}, {**DARK, "display": "none"},
    {**DARK, "content_background": "url(https://example.invalid)"},
])
def test_invalid_or_unreadable_palette_is_rejected_at_the_server(palette):
    with pytest.raises(ValueError):
        validate_design({"shared_layout_revision": 5, "palette": palette})


@pytest.mark.parametrize("revision", [1, 2, 3, 4])
def test_legacy_layout_cannot_silently_ignore_new_palette(revision):
    with pytest.raises(ValueError):
        validate_design({"shared_layout_revision": revision, "palette": DARK})


def test_palette_and_preheader_round_trip_without_downgrade_or_publication(env):
    admin = env.human("admin")
    response = admin.post("/api/v1/notification-template-sets", json={
        "name": "Dark readable draft", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
        "design": {"shared_layout_revision": 5, "palette": DARK, "event_preheaders": {"requested": "Review {{target}}"}},
    })
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["published_revision"] is None
    row = next(row for row in admin.get("/api/v1/notification-template-sets").json() if row["id"] == saved["id"])
    assert row["design"]["palette"] == DARK
    assert row["design"]["shared_layout_revision"] == 5
    assert row["design"]["event_preheaders"]["requested"] == "Review {{target}}"
