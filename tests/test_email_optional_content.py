"""U1.05 bounded optional content; pure rendering and disposable API only."""
from copy import deepcopy

import pytest
from test_email_renderer import CONTEXT

from grant.email_design import BLOCKS, validate_design
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, render_preview


def optional_design():
    return {"shared_layout_revision": 7,
            "blocks": BLOCKS[:3] + ["content_2", "content_1"] + BLOCKS[3:],
            "optional_content": {"content_1": "First {{target}}", "content_2": "Second explanation"}}


def test_optional_blocks_render_in_saved_order_before_protected_context():
    design = validate_design(optional_design())
    rendered = render_preview({"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design}, "requested", CONTEXT)
    assert rendered["html"].index("Second explanation") < rendered["html"].index("First " + CONTEXT["target"])
    assert rendered["html"].index("First " + CONTEXT["target"]) < rendered["html"].index("grant-mail-block-request_context")
    assert "grant-mail-block-content_1" in rendered["html"]
    assert rendered["text"].index("Second explanation") < rendered["text"].index("First " + CONTEXT["target"])
    for label in ("Approve", "Hold", "Deny", "View Details", "Confirm"):
        assert label in rendered["html"] and label in rendered["text"]


@pytest.mark.parametrize("blocks", [
    BLOCKS[:2] + ["content_1", "content_2"] + BLOCKS[2:],
    BLOCKS + ["content_1", "content_2"],
    BLOCKS[:3] + ["content_1", "content_1"] + BLOCKS[3:],
    BLOCKS[:3] + ["content_1", "content_2", "content_4"] + BLOCKS[3:],
    [block for block in BLOCKS if block != "actions"],
    BLOCKS[:3] + ["content_1", "content_2", "actions"] + BLOCKS[3:],
    BLOCKS[:3] + ["content_1", "content_2"] + list(reversed(BLOCKS[3:])),
])
def test_optional_controls_cannot_move_duplicate_remove_or_rebind_required_blocks(blocks):
    with pytest.raises(ValueError):
        validate_design({**optional_design(), "blocks": blocks})


@pytest.mark.parametrize("content", [
    {"content_1": "text"}, {"content_1": "", "content_2": "text"},
    {"content_1": "x" * 2001, "content_2": "text"},
    {"content_1": "{{password}}", "content_2": "text"},
    {"content_1": "text\u0000", "content_2": "text"},
    {"content_1": "text", "content_2": "text", "actions": "hide"},
])
def test_optional_content_bijection_limits_and_safe_variables(content):
    with pytest.raises(ValueError):
        validate_design({**optional_design(), "optional_content": content})


def test_optional_content_is_escaped_and_cannot_reinterpret_old_layouts():
    value = optional_design()
    value["optional_content"]["content_1"] = '<script>alert(1)</script>@@GRANT_APPROVE_URL@@'
    rendered = render_preview({"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": value}, "requested", CONTEXT)
    assert "<script>" not in rendered["html"]
    assert "@@GRANT_APPROVE_URL@@" in rendered["html"]
    for revision in (1, 2, 3, 4, 5, 6):
        with pytest.raises(ValueError):
            validate_design({**value, "shared_layout_revision": revision})


def test_optional_content_save_reopen_and_crafted_api_rejection(env):
    admin = env.human("admin")
    payload = {"name": "Optional content", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": optional_design()}
    response = admin.post("/api/v1/notification-template-sets", json=payload)
    assert response.status_code == 201, response.text
    saved = response.json()
    reopened = next(row for row in admin.get("/api/v1/notification-template-sets").json() if row["id"] == saved["id"])
    assert reopened["design"] == saved["design"]
    assert reopened["published_revision"] is None
    invalid = deepcopy(payload)
    invalid["design"]["blocks"].remove("verification")
    rejected = admin.put("/api/v1/notification-template-sets/" + saved["id"], json={**invalid, "expected_updated_at": saved["updated_at"]})
    assert rejected.status_code == 422
    after = next(row for row in admin.get("/api/v1/notification-template-sets").json() if row["id"] == saved["id"])
    assert after["design"] == reopened["design"]
