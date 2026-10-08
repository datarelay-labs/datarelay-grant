import json
import sqlite3

from grant.core import Core
from grant.db import Database
from grant.mail_templates import DEFAULT_MAIL_TEMPLATE


def template_payload(**overrides):
    return {
        "name": "Operations approval",
        "subject_template": "[Ops] {{request_title}}",
        "body_template": "Approve {{action_kind}} on {{target}}.\n{{request_url}}\nReason: {{reason}}",
        "reminder_subject_template": "[Ops reminder] {{request_title}}",
        "reminder_body_template": "Still waiting for {{external_id}}.\n{{request_url}}",
        **overrides,
    }


def policy_payload(env, template_id=None, **overrides):
    return {
        "name": "Managed service approval",
        "integration_id": env.integration["id"],
        "approver_id": env.users["approver"]["id"],
        "action_kind": "service.restart",
        "email_template_id": template_id,
        "deadline_seconds": 86400,
        "reminder_seconds": 3600,
        "max_reminders": 3,
        "grant_seconds": 900,
        **overrides,
    }


def activate(admin, policy_id):
    assert admin.post(f"/api/v1/profiles/{policy_id}/test").status_code == 200
    response = admin.post(f"/api/v1/profiles/{policy_id}/activate")
    assert response.status_code == 200, response.text
    return response.json()


def test_admin_manages_policy_and_mail_template_with_request_snapshot(env):
    admin = env.human("admin")
    assert admin.post("/api/v1/profiles/" + env.profile["id"] + "/disable").status_code == 200
    created = admin.post("/api/v1/email-templates", json=template_payload())
    assert created.status_code == 201, created.text
    template = created.json()

    policy_response = admin.post(
        "/api/v1/profiles", json=policy_payload(env, template["id"])
    )
    assert policy_response.status_code == 201, policy_response.text
    policy = policy_response.json()
    activate(admin, policy["id"])

    first_body = env.intake(
        external_id="template-snapshot-1",
        profile_id=policy["id"],
        reason="first reason",
    )
    first = env.api.post("/api/v1/requests", json=first_body)
    assert first.status_code == 202, first.text
    first_row = first.json()

    with env.db.transaction(write=False) as conn:
        mail = env.settings.unseal(
            conn.execute(
                "SELECT payload FROM outbox WHERE request_id=? AND kind='email' ORDER BY created_at LIMIT 1",
                (first_row["id"],),
            ).fetchone()[0]
        )
    assert mail["subject"] == "[Ops] Restart test service"
    assert "Approve service.restart on test-service." in mail["body"]
    assert "first reason" in mail["body"]

    updated_template = template_payload(
        body_template="UPDATED {{request_title}} for {{target}}",
        reminder_body_template="UPDATED REMINDER {{request_title}}",
        enabled=True,
    )
    response = admin.put(
        f"/api/v1/email-templates/{template['id']}", json=updated_template
    )
    assert response.status_code == 200, response.text

    with env.db.transaction() as conn:
        conn.execute(
            "UPDATE requests SET next_reminder=0 WHERE id=?", (first_row["id"],)
        )
    Core(env.db, env.settings).maintenance()
    with env.db.transaction(write=False) as conn:
        reminders = [
            env.settings.unseal(row[0])
            for row in conn.execute(
                "SELECT payload FROM outbox WHERE request_id=? AND kind='email' ORDER BY created_at",
                (first_row["id"],),
            ).fetchall()
        ]
    assert len(reminders) == 2
    assert reminders[1]["body"].startswith("Still waiting for template-snapshot-1")
    assert "UPDATED REMINDER" not in reminders[1]["body"]

    second = env.api.post(
        "/api/v1/requests",
        json=env.intake(
            external_id="template-snapshot-2",
            profile_id=policy["id"],
            reason="second reason",
        ),
    )
    assert second.status_code == 202, second.text
    with env.db.transaction(write=False) as conn:
        new_mail = env.settings.unseal(
            conn.execute(
                "SELECT payload FROM outbox WHERE request_id=? AND kind='email' ORDER BY created_at LIMIT 1",
                (second.json()["id"],),
            ).fetchone()[0]
        )
    assert new_mail["body"].startswith("UPDATED Restart test service for test-service")
    assert "Four-digit confirmation PIN:" in new_mail["body"]


def test_policy_update_affects_only_new_requests_and_template_disable_is_safe(env):
    admin = env.human("admin")
    assert admin.post("/api/v1/profiles/" + env.profile["id"] + "/disable").status_code == 200
    template = admin.post("/api/v1/email-templates", json=template_payload()).json()
    policy = admin.post(
        "/api/v1/profiles", json=policy_payload(env, template["id"])
    ).json()
    activate(admin, policy["id"])

    first = env.api.post(
        "/api/v1/requests",
        json=env.intake(external_id="policy-old", profile_id=policy["id"]),
    ).json()
    response = admin.put(
        f"/api/v1/profiles/{policy['id']}",
        json=policy_payload(
            env,
            template["id"],
            approver_id=env.users["stranger"]["id"],
            deadline_seconds=120,
            enabled=True,
        ),
    )
    assert response.status_code == 200, response.text
    assert response.json()["lifecycle"] == "DRAFT"
    assert env.api.get(f"/api/v1/requests/{first['id']}").json()["approver_id"] == env.users["approver"]["id"]
    activate(admin, policy["id"])

    second = env.api.post(
        "/api/v1/requests",
        json=env.intake(external_id="policy-new", profile_id=policy["id"]),
    )
    assert second.status_code == 202, second.text
    assert second.json()["approver_id"] == env.users["stranger"]["id"]
    assert second.json()["deadline"] - second.json()["created_at"] <= 121

    in_use = admin.put(
        f"/api/v1/email-templates/{template['id']}",
        json=template_payload(enabled=False),
    )
    assert in_use.status_code == 409
    assert in_use.json()["error"]["code"] == "EMAIL_TEMPLATE_IN_USE"

    disabled_policy = admin.post(f"/api/v1/profiles/{policy['id']}/disable")
    assert disabled_policy.status_code == 200
    assert disabled_policy.json()["lifecycle"] == "DISABLED"
    disabled_template = admin.put(
        f"/api/v1/email-templates/{template['id']}",
        json=template_payload(enabled=False),
    )
    assert disabled_template.status_code == 200
    assert disabled_template.json()["enabled"] is False


def test_template_rejects_unknown_or_malformed_variables(env):
    admin = env.human("admin")
    for body in (
        template_payload(body_template="Do not expose {{secret}}"),
        template_payload(subject_template="Bad {{request_title"),
        template_payload(subject_template="Bad\nsubject"),
    ):
        response = admin.post("/api/v1/email-templates", json=body)
        assert response.status_code == 422


def test_schema_v1_migrates_to_v8_and_backfills_policy_and_notification_state(env):
    created = env.api.post(
        "/api/v1/requests", json=env.intake(external_id="legacy-migration")
    )
    assert created.status_code == 202
    path = env.settings.database

    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("ALTER TABLE profiles DROP COLUMN email_template_id")
        conn.execute("ALTER TABLE requests DROP COLUMN mail_template")
        conn.execute("DROP TABLE email_templates")
        conn.execute("PRAGMA user_version=1")
        conn.commit()

    migrated = Database(path)
    with migrated.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 10
        assert "email_template_id" in {
            row[1] for row in conn.execute("PRAGMA table_info(profiles)")
        }
        assert "mail_template" in {
            row[1] for row in conn.execute("PRAGMA table_info(requests)")
        }
        assert "event_templates" in {
            row[1] for row in conn.execute("PRAGMA table_info(email_templates)")
        }
        assert conn.execute("SELECT COUNT(*) FROM profile_versions").fetchone()[0] >= 1
        snapshot = json.loads(
            conn.execute(
                "SELECT mail_template FROM requests WHERE external_id='legacy-migration'"
            ).fetchone()[0]
        )
    assert snapshot == DEFAULT_MAIL_TEMPLATE


def test_schema_v2_migration_keeps_only_one_legacy_policy_active_per_resolver_key(env):
    path = env.settings.database
    with sqlite3.connect(path) as conn:
        base = conn.execute(
            "SELECT integration_id,approver_id,action_kind,deadline_seconds,reminder_seconds,max_reminders,grant_seconds FROM profiles LIMIT 1"
        ).fetchone()
        conn.execute(
            "INSERT INTO profiles(id,name,integration_id,approver_id,action_kind,deadline_seconds,reminder_seconds,max_reminders,grant_seconds,enabled) VALUES(?,?,?,?,?,?,?,?,?,1)",
            ("legacy-collision", "Legacy collision", *base),
        )
        conn.execute("DROP TABLE profile_versions")
        conn.execute("PRAGMA user_version=2")
        conn.commit()
    migrated = Database(path)
    with migrated.transaction(write=False) as conn:
        rows = conn.execute(
            "SELECT lifecycle FROM profile_versions WHERE integration_id=? AND action_kind=?",
            (base[0], base[2]),
        ).fetchall()
    assert sum(row["lifecycle"] == "ACTIVE" for row in rows) == 1

def test_schema_v2_migration_reentry_preserves_existing_active_resolver_key(env):
    path = env.settings.database
    with sqlite3.connect(path) as conn:
        base = conn.execute(
            "SELECT integration_id,approver_id,action_kind,deadline_seconds,reminder_seconds,max_reminders,grant_seconds FROM profiles LIMIT 1"
        ).fetchone()
        conn.execute(
            "INSERT INTO profiles(id,name,integration_id,approver_id,action_kind,deadline_seconds,reminder_seconds,max_reminders,grant_seconds,enabled) VALUES(?,?,?,?,?,?,?,?,?,1)",
            ("legacy-reentry-collision", "Legacy re-entry collision", *base),
        )
        # Simulate an interrupted v2->v3 migration: the original ACTIVE version
        # already exists, but user_version was not advanced before restart.
        conn.execute("PRAGMA user_version=2")
        conn.commit()

    migrated = Database(path)
    with migrated.transaction(write=False) as conn:
        rows = conn.execute(
            """SELECT profile_id,lifecycle
               FROM profile_versions
               WHERE integration_id=? AND action_kind=?
               ORDER BY profile_id""",
            (base[0], base[2]),
        ).fetchall()
    assert sum(row["lifecycle"] == "ACTIVE" for row in rows) == 1
    assert any(
        row["profile_id"] == "legacy-reentry-collision" and row["lifecycle"] == "DISABLED"
        for row in rows
    )
