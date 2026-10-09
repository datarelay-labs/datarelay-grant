"""G9 v2: explicit reviewed import of only new, non-active policy Drafts.

Every test uses conftest's per-test disposable Grant SQLite and synthetic users.
No imported artifact can carry SMTP, API credentials or external destinations.
"""
from __future__ import annotations

from copy import deepcopy

import pytest

from grant.mail_templates import DEFAULT_EVENT_TEMPLATES
from grant.models import NotificationTemplateSet


def sample(env, *, with_template: bool = False):
    admin = env.human("admin")
    if with_template:
        env.core.create_notification_template_set(
            env.admin,
            NotificationTemplateSet(
                name="Original template",
                templates=deepcopy(DEFAULT_EVENT_TEMPLATES),
            ),
        )
    r = admin.get("/api/v1/admin/configuration/export-v2")
    assert r.status_code == 200, r.text
    package = r.json()
    # Import creates new local identities. Existing source names must not overwrite.
    for item in package["policies"]:
        item["config"]["name"] = "Imported " + item["config"]["name"]
    for item in package["templates"]:
        item["name"] = "Imported " + item["name"]
    mapping = {
        "integrations": {
            item["id"]: env.integration["id"] for item in package["integrations"]
        },
        "approvers": {
            row["config"]["approver_id"]: env.users["approver"]["id"]
            for row in package["policies"]
        },
        "groups": {},
    }
    return admin, package, mapping


def proposed(package, mapping):
    return {"bundle": package, "mappings": mapping}


def preview(admin, package, mapping):
    return admin.post("/api/v1/admin/configuration/preview-v2", json=proposed(package, mapping))


def imported(admin, package, mapping, reviewed):
    return admin.post("/api/v1/admin/configuration/import-v2", json={
        **proposed(package, mapping),
        "preview_digest": reviewed,
        "confirmation": "IMPORT_DRAFTS_ONLY",
    })


def snapshot(env):
    with env.db.transaction(write=False) as conn:
        return {
            table: conn.execute("SELECT count(*) FROM " + table).fetchone()[0]
            for table in (
                "integrations", "users", "api_tokens", "approver_groups",
                "profiles", "profile_versions", "email_templates",
                "requests", "outbox",
            )
        }


def test_complete_export_keeps_credentials_and_callback_out_of_artifact(env):
    admin = env.human("admin")
    env.core.create_notification_template_set(
        env.admin,
        NotificationTemplateSet(name="Event body bundle", templates=deepcopy(DEFAULT_EVENT_TEMPLATES)),
    )
    response = admin.get("/api/v1/admin/configuration/export-v2")
    assert response.status_code == 200, response.text
    artifact = response.json()
    assert artifact["schema_version"] == 2
    assert artifact["format"] == "grant.configuration"
    assert artifact["credential_material_included"] is False
    assert artifact["integrations"][0]["id"] == env.integration["id"]
    assert artifact["policies"][0]["config"]["approver_id"] == env.users["approver"]["id"]
    assert artifact["policies"][0]["source_lifecycle"] == "ACTIVE"
    assert len(artifact["templates"][0]["templates"]) == 9
    assert "requested" in artifact["templates"][0]["templates"]
    assert response.headers["cache-control"] == "no-store"
    body = response.text.lower()
    for forbidden in (
        "callback_url", "destination", "token_hash", "totp_secret",
        "private_key", "password_hash", "api_tokens", "encryption_key",
    ):
        assert forbidden not in body
    assert admin.get("/api/v1/integrations/configuration-export").json()["schema_version"] == 1


def test_mapping_preview_is_read_only_and_issues_transaction_bound_digest(env):
    admin, package, mapping = sample(env)
    before = snapshot(env)
    response = preview(admin, package, mapping)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["schema_version"] == 2
    assert result["can_import_drafts"] is True
    assert result["will_activate"] is False
    assert result["summary"]["policies"] >= 1
    assert len(result["preview_digest"]) == 64
    assert result["conflicts"] == []
    assert snapshot(env) == before


def test_explicit_v2_import_creates_new_disabled_drafts_and_complete_templates(env):
    admin, package, mapping = sample(env, with_template=True)
    template_source_id = package["templates"][0]["id"]
    package["policies"][0]["config"]["email_template_id"] = template_source_id
    first = preview(admin, package, mapping)
    assert first.status_code == 200, first.text
    result = imported(admin, package, mapping, first.json()["preview_digest"])
    assert result.status_code == 201, result.text
    data = result.json()
    assert data["imported"]["policies"] == len(package["policies"])
    assert data["imported"]["templates"] == len(package["templates"])
    assert data["all_policies_draft"] is True
    assert data["activated"] is False
    with env.db.transaction(write=False) as conn:
        policy = conn.execute(
            "SELECT * FROM profiles WHERE id=?", (data["policy_ids"][0],)
        ).fetchone()
        version = conn.execute(
            "SELECT * FROM profile_versions WHERE profile_id=?",
            (data["policy_ids"][0],),
        ).fetchone()
        template = conn.execute(
            "SELECT * FROM email_templates WHERE id=?", (data["template_ids"][0],)
        ).fetchone()
        assert policy["enabled"] == 0
        assert version["lifecycle"] == "DRAFT"
        assert version["version"] == 1
        assert version["approver_id"] == env.users["approver"]["id"]
        assert version["integration_id"] == env.integration["id"]
        assert version["email_template_id"] == template["id"]
        assert "execution_unknown" in template["event_templates"]
        assert conn.execute(
            "SELECT count(*) FROM audit WHERE action='configuration.v2_drafts_imported'"
        ).fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM requests").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM outbox").fetchone()[0] == 0
    assert imported(admin, package, mapping, first.json()["preview_digest"]).status_code == 409
    # An administrator must explicitly move the new DRAFT through Testing
    # before the separate existing Activate action can enable it.
    assert admin.post(
        "/api/v1/profiles/" + data["policy_ids"][0] + "/activate"
    ).status_code == 409


def test_wrong_confirmation_or_unpreviewed_artifact_cannot_write(env):
    admin, package, mapping = sample(env)
    before = snapshot(env)
    reviewed = preview(admin, package, mapping).json()["preview_digest"]
    assert admin.post("/api/v1/admin/configuration/import-v2", json={
        **proposed(package, mapping),
        "preview_digest": reviewed,
        "confirmation": "APPLY",
    }).status_code == 422
    assert imported(admin, package, mapping, "0" * 64).status_code == 409
    tampered = deepcopy(package)
    tampered["policies"][0]["config"]["name"] = "Tampered draft"
    assert imported(admin, tampered, mapping, reviewed).status_code == 409
    assert snapshot(env) == before


@pytest.mark.parametrize("target", ["integrations", "approvers"])
def test_missing_local_mapping_fails_without_partial_state(env, target):
    admin, package, mapping = sample(env)
    before = snapshot(env)
    mapping[target] = {}
    result = preview(admin, package, mapping)
    assert result.status_code == 200
    assert result.json()["can_import_drafts"] is False
    assert imported(admin, package, mapping, result.json()["preview_digest"]).status_code == 409
    assert snapshot(env) == before


def test_wrong_local_integration_identity_rejected_even_if_existing(env):
    admin, package, mapping = sample(env)
    with env.db.transaction() as conn:
        conn.execute("UPDATE integrations SET kind='stellar' WHERE id=?", (env.integration["id"],))
    before = snapshot(env)
    result = preview(admin, package, mapping)
    assert result.status_code == 200
    assert result.json()["can_import_drafts"] is False
    assert any(x["reason"] == "integration_kind_or_tenant_mismatch" for x in result.json()["conflicts"])
    assert imported(admin, package, mapping, result.json()["preview_digest"]).status_code == 409
    assert snapshot(env) == before


def test_changes_after_preview_are_revalidated_before_commit(env):
    admin, package, mapping = sample(env)
    reviewed = preview(admin, package, mapping).json()["preview_digest"]
    with env.db.transaction() as conn:
        conn.execute("UPDATE users SET enabled=0 WHERE id=?", (env.users["approver"]["id"],))
    before = snapshot(env)
    assert imported(admin, package, mapping, reviewed).status_code == 409
    assert snapshot(env) == before


def test_existing_name_conflict_blocks_overwrite_and_duplicate_second_import(env):
    admin, package, mapping = sample(env)
    package["policies"][0]["config"]["name"] = "Test approval"
    result = preview(admin, package, mapping)
    assert result.status_code == 200
    assert result.json()["can_import_drafts"] is False
    assert any(x["reason"] == "name_collision" for x in result.json()["conflicts"])
    assert imported(admin, package, mapping, result.json()["preview_digest"]).status_code == 409


def test_forbidden_source_credentials_and_legacy_metadata_v1_never_import(env):
    admin, package, mapping = sample(env)
    for dangerous in (
        {"api_token": "fake-secret"}, {"callback_url": "https://outside.invalid"},
        {"password": "fake-secret"}, {"smtp_host": "example.invalid"},
    ):
        invalid = {**deepcopy(package), **dangerous}
        assert preview(admin, invalid, mapping).status_code == 422
    legacy = admin.get("/api/v1/integrations/configuration-export").json()
    assert preview(admin, legacy, mapping).status_code == 422


def test_incomplete_template_or_unsafe_notification_variable_rejected(env):
    admin, package, mapping = sample(env, with_template=True)
    incomplete = deepcopy(package)
    incomplete["templates"][0]["templates"].pop("denied")
    assert preview(admin, incomplete, mapping).status_code == 422
    unsafe = deepcopy(package)
    unsafe["templates"][0]["templates"]["requested"]["body"] = "{{password}}"
    assert preview(admin, unsafe, mapping).status_code == 422


def test_only_authorized_current_human_administrator_may_import(env):
    admin, package, mapping = sample(env)
    payload = proposed(package, mapping)
    for client in (env.human("requester"), env.api):
        assert client.get("/api/v1/admin/configuration/export-v2").status_code == 403
        assert client.post("/api/v1/admin/configuration/preview-v2", json=payload).status_code == 403
        assert client.post("/api/v1/admin/configuration/import-v2", json={
            **payload, "preview_digest": "0" * 64, "confirmation": "IMPORT_DRAFTS_ONLY",
        }).status_code == 403
    # The ordinary administrative session remains the sole authority.
    assert admin.post("/api/v1/admin/configuration/preview-v2", json=payload).status_code == 200


def test_local_group_mapping_and_quorum_import_only_as_draft(env):
    from grant.models import ApproverGroup
    admin, package, mapping = sample(env)
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="Recipient committee",
            member_ids=[env.users["approver"]["id"], env.users["requester"]["id"]],
        ),
    )
    config = package["policies"][0]["config"]
    config["approval_mode"] = "N_OF_M"
    config["approver_group_id"] = "source-group-id"
    config["approvals_required"] = 2
    mapping["groups"] = {"source-group-id": group["id"]}
    valid = preview(admin, package, mapping)
    assert valid.status_code == 200, valid.text
    assert valid.json()["can_import_drafts"] is True
    result = imported(admin, package, mapping, valid.json()["preview_digest"])
    assert result.status_code == 201, result.text
    with env.db.transaction(write=False) as conn:
        version = conn.execute(
            "SELECT approver_group_id,approvals_required,lifecycle "
            "FROM profile_versions WHERE profile_id=?",
            (result.json()["policy_ids"][0],),
        ).fetchone()
        assert version["approver_group_id"] == group["id"]
        assert version["approvals_required"] == 2
        assert version["lifecycle"] == "DRAFT"


def test_import_quorum_exceeding_local_group_fails_without_writes(env):
    from grant.models import ApproverGroup
    admin, package, mapping = sample(env)
    group = env.core.create_approver_group(
        env.admin,
        ApproverGroup(
            name="One member committee", member_ids=[env.users["approver"]["id"]],
        ),
    )
    config = package["policies"][0]["config"]
    config["approval_mode"] = "N_OF_M"
    config["approver_group_id"] = "source-group"
    config["approvals_required"] = 2
    mapping["groups"] = {"source-group": group["id"]}
    before = snapshot(env)
    result = preview(admin, package, mapping)
    assert result.status_code == 200
    assert result.json()["can_import_drafts"] is False
    assert any(item["reason"] == "approval_quorum_invalid" for item in result.json()["conflicts"])
    assert imported(admin, package, mapping, result.json()["preview_digest"]).status_code == 409
    assert snapshot(env) == before


def test_v2_import_rollback_is_atomic_if_second_insert_fails(env, monkeypatch):
    admin, package, mapping = sample(env, with_template=True)
    second = deepcopy(package["policies"][0])
    second["id"] = "other-source-policy-id"
    second["config"]["name"] = "Second imported draft"
    package["policies"].append(second)
    reviewed = preview(admin, package, mapping)
    assert reviewed.status_code == 200
    assert reviewed.json()["can_import_drafts"] is True
    original = type(env.core)._insert_profile_version
    inserted = 0

    def fail_second(self, *args, **kwargs):
        nonlocal inserted
        inserted += 1
        if inserted == 2:
            raise RuntimeError("injected transaction failure")
        return original(self, *args, **kwargs)

    monkeypatch.setattr(type(env.core), "_insert_profile_version", fail_second)
    before = snapshot(env)
    with pytest.raises(RuntimeError, match="injected transaction failure"):
        imported(admin, package, mapping, reviewed.json()["preview_digest"])
    assert snapshot(env) == before


def test_current_admin_authority_revoked_after_preview_never_imports(env):
    admin, package, mapping = sample(env)
    reviewed = preview(admin, package, mapping).json()["preview_digest"]
    with env.db.transaction() as conn:
        conn.execute("UPDATE users SET role='member' WHERE id=?", (env.users["admin"]["id"],))
    before = snapshot(env)
    assert imported(admin, package, mapping, reviewed).status_code in (401, 403)
    assert snapshot(env) == before


def test_policy_import_does_not_autorun_existing_active_source(env):
    admin, package, mapping = sample(env)
    assert package["policies"][0]["source_lifecycle"] == "ACTIVE"
    plan = preview(admin, package, mapping).json()
    assert plan["can_import_drafts"]
    created = imported(admin, package, mapping, plan["preview_digest"])
    assert created.status_code == 201
    imported_id = created.json()["policy_ids"][0]
    with env.db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT enabled FROM profiles WHERE id=?", (imported_id,)
        ).fetchone()["enabled"] == 0
        assert conn.execute(
            "SELECT lifecycle FROM profile_versions WHERE profile_id=?", (imported_id,)
        ).fetchone()["lifecycle"] == "DRAFT"


def test_v2_import_survives_disposable_backup_restore_without_activation_or_delivery(
    env, tmp_path
):
    """Real v2 API import -> new-path SQLite restore -> fresh admin reads.

    The fixture is an isolated synthetic database. This proves Grant's local
    state and denial-of-activation contracts, not customer installation recovery
    or external send/consume acceptance.
    """
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from grant.app import create_app
    from grant.db import Database

    admin, package, mapping = sample(env, with_template=True)
    source_template = package["templates"][0]
    event_bodies = {}
    for event_name, content in source_template["templates"].items():
        content["subject"] = "Restored subject for " + event_name
        content["body"] = "Restored full event body for " + event_name
        event_bodies[event_name] = dict(content)
    assert len(event_bodies) == 9
    package["policies"][0]["config"]["email_template_id"] = source_template["id"]

    reviewed = preview(admin, package, mapping)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["can_import_drafts"] is True
    digest = reviewed.json()["preview_digest"]
    receipt = imported(admin, package, mapping, digest)
    assert receipt.status_code == 201, receipt.text
    imported_policy = receipt.json()["policy_ids"][0]
    imported_template = receipt.json()["template_ids"][0]

    with env.db.transaction(write=False) as conn:
        baseline = {
            table: conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
            for table in ("integrations", "users", "api_tokens", "approver_groups",
                          "profiles", "profile_versions", "email_templates",
                          "requests", "outbox")
        }
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] > 0
        audit_row = conn.execute(
            "SELECT actor,detail FROM audit WHERE action='configuration.v2_drafts_imported'"
        ).fetchone()
        assert audit_row is not None
        assert digest in audit_row["detail"]
        assert conn.execute(
            "SELECT enabled FROM profiles WHERE id=?", (imported_policy,)
        ).fetchone()["enabled"] == 0

    backup = tmp_path / "imported-v2-backup.sqlite"
    recovered_path = tmp_path / "imported-v2-new-restored.sqlite"
    env.db.backup(backup)
    assert backup.exists()
    Database.restore(backup, recovered_path)
    assert backup.exists() and recovered_path.exists()

    db = Database(recovered_path)
    with db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        assert conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
        assert {
            table: conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
            for table in baseline
        } == baseline
        stored = conn.execute(
            "SELECT id,enabled FROM profiles WHERE id=?", (imported_policy,)
        ).fetchone()
        version = conn.execute(
            """SELECT lifecycle,version,integration_id,approver_id,email_template_id
               FROM profile_versions WHERE profile_id=?""",
            (imported_policy,),
        ).fetchone()
        assert stored["enabled"] == 0
        assert version["lifecycle"] == "DRAFT"
        assert version["version"] == 1
        assert version["integration_id"] == env.integration["id"]
        assert version["approver_id"] == env.users["approver"]["id"]
        assert version["email_template_id"] == imported_template
        assert conn.execute(
            "SELECT actor,detail FROM audit WHERE action='configuration.v2_drafts_imported'"
        ).fetchone() == audit_row
        assert conn.execute("SELECT COUNT(*) FROM requests").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0

    # The pre-backup browser cookie is not a valid session in the new installation.
    restored_app = create_app(replace(env.settings, database=recovered_path))
    with TestClient(restored_app) as client:
        client.cookies.update(admin.cookies)
        assert client.get("/api/v1/admin/configuration/export-v2").status_code in (401, 403)
        login = client.post("/api/v1/auth/login", json={
            "username": "admin", "password": env.password,
        })
        assert login.status_code == 200, login.text
        client.headers["x-csrf-token"] = login.json()["csrf"]

        profiles = client.get("/api/v1/profiles")
        assert profiles.status_code == 200, profiles.text
        imported_view = next(
            profile for profile in profiles.json() if profile["id"] == imported_policy
        )
        assert imported_view["lifecycle"] == "DRAFT"
        assert imported_view["enabled"] is False

        templates = client.get("/api/v1/notification-template-sets")
        assert templates.status_code == 200, templates.text
        template_view = next(
            item for item in templates.json() if item["id"] == imported_template
        )
        assert template_view["templates"] == event_bodies

        # An operator must separately acknowledge reconciliation after restore.
        # This acknowledgement in a disposable zero-request fixture is NOT
        # evidence of reconciled real external product effects.
        assert restored_app.state.core.resume_after_restore(acknowledged=True)["paused"] is False
        activate = client.post("/api/v1/profiles/" + imported_policy + "/activate")
        assert activate.status_code == 409
        assert client.get("/api/v1/profiles").status_code == 200

    with db.transaction(write=False) as conn:
        assert conn.execute(
            "SELECT enabled FROM profiles WHERE id=?", (imported_policy,)
        ).fetchone()["enabled"] == 0
        assert conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
