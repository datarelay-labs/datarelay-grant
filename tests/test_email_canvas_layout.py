"""New preview markers/event headings must never change historic mail output."""
import pytest
from test_email_renderer import CONTEXT

from grant.email_design import EmailDesign, validate_design
from grant.email_renderer import OUTCOMES, PREVIEW_ORIGIN, EmailSecurity, compose_email


def test_canvas_layout_has_server_owned_markers_and_event_scoped_heading():
    design = EmailDesign(shared_layout_revision=3, event_headings={"requested": "Change {{target}}"}).model_dump()
    result = compose_email({"subject":"Test", "body":"Synthetic body", "brand_name":"Grant"}, CONTEXT, "requested", design=design,
        security=EmailSecurity("EMAIL_PIN", "0000", {key:PREVIEW_ORIGIN+key.lower() for key in OUTCOMES}, True), sample=True)
    for block in ("brand", "heading", "message", "request_context", "actions", "verification", "footer"):
        assert "grant-mail-block-" + block in result["html"]
    assert "Change " + CONTEXT["target"] in result["body"]
    assert "<script" not in result["html"]
    assert "/decision-intents/" not in result["html"]
    notice = compose_email({"subject":"Done", "body":"Finished", "brand_name":"Grant"}, CONTEXT, "approved", design=design, sample=True)
    assert "Change " + CONTEXT["target"] not in notice["body"]
    assert "grant-mail-block-verification" not in notice["html"]


@pytest.mark.parametrize("bad", [{"unknown":"Text"},{"requested":"{{password}}"},{"requested":"x"*251}])
def test_event_heading_map_is_strict_and_safe(bad):
    with pytest.raises(ValueError):
        validate_design({"shared_layout_revision":3,"event_headings":bad})


def test_event_headings_cannot_reinterpret_old_layout_versions():
    for revision in (1, 2):
        with pytest.raises(ValueError):
            EmailDesign(shared_layout_revision=revision, event_headings={"requested":"Changed"})
