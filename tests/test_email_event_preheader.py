"""U2.03 optional inbox summary is event-scoped and cannot change mail authority."""
import hashlib
from copy import deepcopy
from importlib.resources import files

import pytest
from test_email_renderer import CONTEXT

from grant.email_design import BLOCKS, validate_design
from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, render_preview


def design():
    return {"shared_layout_revision": 4, "event_preheaders": {
        "requested": "Please review {{target}}", "reminder": "Reminder 한국어",
    }}


def test_versioned_event_preheader_is_escaped_scoped_and_not_required_content():
    value = design()
    value["event_preheaders"]["requested"] = '<b>{{target}}</b>@@GRANT_APPROVE_URL@@'
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": value}
    requested = render_preview(template, "requested", CONTEXT)
    assert requested["preheader"] == '<b>sample-target</b>@@GRANT_APPROVE_URL@@'
    assert "&lt;b&gt;sample-target&lt;/b&gt;@@GRANT_APPROVE_URL@@" in requested["html"]
    assert "grant-mail-preheader" in requested["html"]
    assert '<b>sample-target</b>' not in requested["html"]
    assert render_preview(template, "reminder", CONTEXT)["preheader"] == "Reminder 한국어"
    assert render_preview(template, "approved", CONTEXT)["preheader"] == ""
    assert "Confirm" in requested["text"]
    assert requested["html"].count("grant-mail-block-actions") == 4
    assert validate_design(value)["blocks"] == BLOCKS


@pytest.mark.parametrize("values", [
    {"unknown": "Unsupported event"}, {"requested": "x" * 201},
    {"requested": "Header\r\nBcc: someone"}, {"requested": "{{password}}"},
    {"requested": "Invisible\u202e text"}, {"requested": "Null\u0000"},
])
def test_invalid_preheader_fails_closed(values):
    with pytest.raises(ValueError):
        validate_design({"shared_layout_revision": 4, "event_preheaders": values})


@pytest.mark.parametrize("revision", [1, 2, 3])
def test_preheader_cannot_reinterpret_existing_layout_versions(revision):
    with pytest.raises(ValueError):
        validate_design({**design(), "shared_layout_revision": revision})


def test_old_artifacts_are_byte_identical():
    for revision, digest in {
        1: "96af3f444ca3045e439b10f51c197cc9f44c5125a1f964eb8b3e1f1abea62241",
        2: "7e797fa9b3f30516ee01cb454a7c732750ea3b9bd47c7d2486455439bffd0cf7",
        3: "b0ef2a6895872104538c0872dec51bc01436ecfb3fcac45af6055698d078c35f",
        4: "b6f460c4bb88150866e5e9977649023e7f6070fe16fee835a72e577dd3847274",
    }.items():
        assert hashlib.sha256(files("grant").joinpath(f"email_layout_v{revision}.json").read_bytes()).hexdigest() == digest


def test_preheader_save_reopen_preserves_event_boundaries_and_is_unpublished(env):
    admin = env.human("admin")
    response = admin.post("/api/v1/notification-template-sets", json={
        "name": "Preheader draft", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design(),
    })
    assert response.status_code == 201, response.text
    created = response.json()
    reopened = next(row for row in admin.get("/api/v1/notification-template-sets").json() if row["id"] == created["id"])
    assert reopened["design"]["event_preheaders"] == design()["event_preheaders"]
    assert reopened["published_revision"] is None
