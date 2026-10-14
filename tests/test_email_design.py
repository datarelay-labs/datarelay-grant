"""ET-2 bounded design/CAS/snapshot contracts; disposable or pure inputs only."""
from copy import deepcopy

import pytest
from pydantic import ValidationError
from test_email_renderer import CONTEXT

from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, normalize_snapshot, render_from_context


def test_protected_design_schema_and_styles():
    from grant.email_design import EmailDesign

    design = EmailDesign().model_dump()
    assert design["schema_version"] == 1
    for change in ({"blocks": ["message"]}, {"approve_url": "https://evil.invalid"},
                   {"schema_version": 2}, {"locale": "unknown"}, {"html": "<script/>"},
                   {"styles": {"button_font_size": 0}}, {"styles": {"button_padding_y": -1}},
                   {"styles": {"approve_color": "#ffffff"}},
                   {"styles": {"button_radius": True}}, {"logo_asset_id": "https://evil.invalid/pixel"}):
        with pytest.raises(ValidationError):
            EmailDesign.model_validate({**design, **change})


def test_rendered_design_is_bounded_and_protected():
    from grant.email_design import EmailDesign
    from grant.mail_templates import render_preview

    design = EmailDesign().model_dump()
    design["styles"].update(button_font_size=20, button_padding_y=18, button_radius=12)
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design}
    output = render_preview(template, "requested", CONTEXT)
    assert "font-size:20px" in output["html"]
    assert "border-radius:12px" in output["html"]
    for label in ("Approve", "Hold", "Deny", "View Details"):
        assert label in output["body"] and label in output["html"]


def test_design_snapshot_is_deep_and_pins_immutable_renderer():
    from grant.email_design import EmailDesign

    design = EmailDesign().model_dump()
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design}
    old = normalize_snapshot(template)
    design["styles"]["font_size"] = 20
    assert old["design"]["styles"]["font_size"] == 16
    assert len(old["renderer"]["layout_sha256"]) == 64
    tampered = deepcopy(old)
    tampered["renderer"]["layout_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="renderer"):
        render_from_context(tampered, "requested", CONTEXT)


def test_design_api_cas_and_legacy_omission_preserves_design(env):
    from grant.email_design import EmailDesign

    admin = env.human("admin")
    payload = {"name": "Design contract", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
               "design": EmailDesign().model_dump()}
    created = admin.post("/api/v1/notification-template-sets", json=payload)
    assert created.status_code == 201, created.text
    saved = created.json()
    assert saved["draft_revision"] == 1
    assert saved["published_revision"] is None
    payload["design"]["styles"]["font_size"] = 20
    updated = admin.put("/api/v1/notification-template-sets/" + saved["id"],
                        json={**payload, "expected_updated_at": saved["updated_at"]})
    assert updated.status_code == 200, updated.text
    assert updated.json()["draft_revision"] == 2
    stale = admin.put("/api/v1/notification-template-sets/" + saved["id"],
                      json={**payload, "expected_updated_at": saved["updated_at"]})
    assert stale.status_code == 409
    payload.pop("design")
    updated2 = admin.put("/api/v1/notification-template-sets/" + saved["id"],
                         json={**payload, "expected_updated_at": updated.json()["updated_at"]})
    assert updated2.status_code == 200
    assert updated2.json()["design"]["styles"]["font_size"] == 20
    forged = {**payload, "design": {"schema_version": 1, "actions": []}}
    assert admin.post("/api/v1/notification-template-sets", json=forged).status_code == 422
    assert env.human("approver").get("/api/v1/notification-template-sets").status_code == 403


def test_v12_upgrade_keeps_legacy_snapshot_and_mail_bytes(tmp_path):
    import hashlib
    import sqlite3

    from grant.db import SCHEMA, Database

    # Exact preceding table layout, populated with synthetic legacy content.
    old_schema = SCHEMA.replace(
        " design_json TEXT, draft_revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER,", ""
    ).replace("PRAGMA user_version=14;", "PRAGMA user_version=12;")
    path = tmp_path / "legacy.sqlite"
    with sqlite3.connect(path) as conn:
        conn.executescript(old_schema)
        conn.execute("INSERT INTO runtime(key,value) VALUES('et2-fixture',?)", ('legacy bytes unchanged',))
        conn.execute("CREATE TABLE et2_legacy_payloads(snapshot TEXT, payload TEXT)")
        conn.execute("INSERT INTO et2_legacy_payloads VALUES(?,?)", ('{"body":"old 승인"}', 'sealed-fixture-only'))
        before = hashlib.sha256(repr(conn.execute("SELECT * FROM et2_legacy_payloads").fetchall()).encode()).hexdigest()
    db = Database(path)
    with db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 14
        columns = {row[1] for row in conn.execute("PRAGMA table_info(email_templates)")}
        assert {"design_json", "draft_revision", "published_revision"} <= columns
        after = hashlib.sha256(repr([tuple(row) for row in conn.execute("SELECT * FROM et2_legacy_payloads")]).encode()).hexdigest()
        assert after == before
    assert Database.inspect_existing(path)[0] == 14
    backup = tmp_path / "backup.sqlite"
    db.backup(backup)
    assert Database.inspect_existing(backup)[0] == 14


def test_legacy_design_opt_in_preserves_future_published_baseline(env):
    from grant.core import Core
    from grant.email_design import EmailDesign

    admin = env.human("admin")
    payload = {"name": "Legacy baseline", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES)}
    saved = admin.post("/api/v1/notification-template-sets", json=payload).json()
    with env.db.transaction(write=False) as conn:
        core = Core(env.db, env.settings)
        before = core._notification_snapshot(conn, {"email_template_id": saved["id"]})
    new = admin.put("/api/v1/notification-template-sets/" + saved["id"], json={
        **payload, "design": EmailDesign().model_dump(), "expected_updated_at": saved["updated_at"],
    })
    assert new.status_code == 200, new.text
    assert new.json()["published_revision"] == 1
    with env.db.transaction(write=False) as conn:
        after = core._notification_snapshot(conn, {"email_template_id": saved["id"]})
    assert after == before


def test_v12_upgrade_preserves_actual_synthetic_request_outbox_and_issuance(env):
    from test_notification_center import activate, policy_payload, request_payload

    from grant.db import Database

    admin = env.human("admin")
    saved = admin.post("/api/v1/notification-template-sets", json={
        "name": "Migration preservation", "templates": deepcopy(DEFAULT_EVENT_TEMPLATES),
    }).json()
    policy = admin.post("/api/v1/profiles", json=policy_payload(env, saved["id"])).json()
    activate(admin, policy["id"])
    response = env.api.post("/api/v1/requests", json=request_payload(policy["id"], "et2-migration"))
    assert response.status_code == 202
    with env.db.transaction() as conn:
        before = {
            table: [tuple(row) for row in conn.execute("SELECT * FROM " + table + " ORDER BY 1")]
            for table in ("requests", "outbox", "decision_issuances", "decision_intents")
        }
        conn.execute("DROP TABLE email_template_revisions")
        conn.execute("DROP TABLE notification_assets")
        for column in ("design_json", "draft_revision", "published_revision"):
            conn.execute("ALTER TABLE email_templates DROP COLUMN " + column)
        conn.execute("PRAGMA user_version=12")
    upgraded = Database(env.db.path)
    with upgraded.transaction(write=False) as conn:
        after = {
            table: [tuple(row) for row in conn.execute("SELECT * FROM " + table + " ORDER BY 1")]
            for table in before
        }
    assert after == before


def test_canonical_suffix_rich_text_and_full_width_never_accept_html_or_hidden_controls():
    from grant.email_design import EmailDesign
    from grant.mail_templates import render_preview

    design = EmailDesign(rich_text=True, paragraph_alignment="center").model_dump()
    design["button_suffixes"]["approve"] = "scheduled change"
    template = {"templates": deepcopy(DEFAULT_EVENT_TEMPLATES), "design": design}
    template["templates"]["requested"]["body"] = "**Review** _carefully_\n- First item\n<script>alert(1)</script>"
    rendered = render_preview(template, "requested", CONTEXT)
    assert "Approve · scheduled change" in rendered["body"]
    assert "<strong>Review</strong>" in rendered["html"]
    assert "<em>carefully</em>" in rendered["html"]
    assert "<li>First item</li>" in rendered["html"]
    assert "<script>" not in rendered["html"]
    assert "display:block;background:" in rendered["html"]
    assert "text-align:center" in rendered["html"]
    with pytest.raises(ValidationError):
        EmailDesign(button_suffixes={"deny": "\u202eApprove"})
    with pytest.raises(ValidationError):
        EmailDesign(shared_layout_revision=1, rich_text=True)


@pytest.mark.parametrize("field", ["schema_version", "renderer_contract_version", "shared_layout_revision"])
def test_schema_versions_require_integer_not_boolean(field):
    from grant.email_design import EmailDesign

    with pytest.raises(ValidationError):
        EmailDesign.model_validate({field: True})
