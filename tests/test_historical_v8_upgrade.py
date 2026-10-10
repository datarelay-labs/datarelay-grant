"""Prove migration of an actual, populated pre-G10A v8 schema to v12.

The pinned schema fixture is extracted verbatim from grant/db.py:SCHEMA at
e21a0801fff32fe0b67ea74a3bc3cf24abdc929f.  No git history, server,
inbox, actual credentials, external recipient, or network is needed at runtime.
"""

import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import closing
from pathlib import Path

import pytest

from grant.db import Database

SCHEMA_FIXTURE = Path(__file__).parent / "fixtures" / "schema_v8_e21a080.sql"
SCHEMA_SHA256 = "b1a381b4efbb03caa2b409349082dc23f08703b7fd7e17e8a7445e69d76808bd"


def _id() -> str:
    return str(uuid.uuid4())


def _insert_v8_records(conn: sqlite3.Connection) -> dict[str, str]:
    now = time.time()
    actors = {name: _id() for name in ("admin", "requester", "first", "second")}
    for name, person_id in actors.items():
        conn.execute(
            "INSERT INTO users(id,username,email,password_hash,role,created_at) "
            "VALUES(?,?,?,?,?,?)",
            (
                person_id, name, name + "@example.invalid", "synthetic-nonlogin-hash",
                "admin" if name == "admin" else "member", now,
            ),
        )
    conn.execute(
        "INSERT INTO sessions(token_hash,id,user_id,created_at,expires_at,last_seen) "
        "VALUES(?,?,?,?,?,?)",
        ("synthetic-old-digest", _id(), actors["admin"], now, now + 3600, now),
    )
    integration_id, profile_id, version_id, group_id = (_id() for _ in range(4))
    conn.execute(
        "INSERT INTO integrations(id,name,kind,destination,created_at) "
        "VALUES(?,?,?,?,?)",
        (integration_id, "Original v8 integration", "datarelay", "http://127.0.0.1/unused", now),
    )
    conn.execute(
        "INSERT INTO approver_groups(id,name,created_at,updated_at) VALUES(?,?,?,?)",
        (group_id, "Original two-person group", now, now),
    )
    for position, name in enumerate(("first", "second")):
        conn.execute(
            "INSERT INTO approver_group_members(group_id,user_id,position) VALUES(?,?,?)",
            (group_id, actors[name], position),
        )

    settings = (3600, 600, 3, 1200)
    conn.execute(
        "INSERT INTO profiles(id,name,integration_id,approver_id,approval_mode,"
        "approver_group_id,action_kind,deadline_seconds,reminder_seconds,"
        "max_reminders,grant_seconds,enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            profile_id, "Keep the active v8 policy", integration_id, actors["first"], "ALL",
            group_id, "service.restart", *settings, 1,
        ),
    )
    conn.execute(
        "INSERT INTO profile_versions(id,profile_id,version,name,integration_id,"
        "approver_id,approval_mode,approver_group_id,action_kind,deadline_seconds,"
        "reminder_seconds,max_reminders,grant_seconds,lifecycle,created_at,updated_at,"
        "activated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            version_id, profile_id, 1, "Keep the active v8 policy", integration_id,
            actors["first"], "ALL", group_id, "service.restart", *settings, "ACTIVE",
            now, now, now,
        ),
    )

    action = json.dumps({
        "kind": "service.restart", "target": "example.invalid",
        "parameters": {"change_ticket": "synthetic-v8"},
    }, sort_keys=True)
    plan = json.dumps({"mode": "ALL", "members": [actors["first"], actors["second"]]})
    requests = {}
    for state in ("PENDING", "DENIED"):
        request_id = _id()
        requests[state.lower()] = request_id
        conn.execute(
            "INSERT INTO requests(id,integration_id,external_id,profile_id,"
            "profile_version_id,requester_id,approver_id,approval_plan,title,action,"
            "action_hash,intake_hash,source,reason,mail_template,state,decision,"
            "decision_actor,decision_at,created_at,deadline,grant_seconds,"
            "next_reminder,reminder_seconds,max_reminders) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                request_id, integration_id, "legacy-" + state.lower(), profile_id,
                version_id, actors["requester"], actors["first"], plan,
                "Old v8 immutable intent", action, "v8-action-hash", "v8-intake-hash",
                '{"case_id":"legacy"}', "Pre-G10A", '{"requested":{"subject":"old"}}',
                state, "DENIED" if state == "DENIED" else None,
                actors["first"] if state == "DENIED" else None,
                now if state == "DENIED" else None,
                now, now + 3600, 1200, now + 600, 600, 3,
            ),
        )
        conn.execute(
            "INSERT INTO audit(id,request_id,at,actor,action,detail) VALUES(?,?,?,?,?,?)",
            (_id(), request_id, now, "synthetic-v8", "request.created", '{"source":"historical"}'),
        )
    conn.execute(
        "INSERT INTO request_decisions(request_id,actor_id,decision,reason,decided_at)"
        " VALUES(?,?,?,?,?)",
        (requests["denied"], actors["first"], "DENIED", "Not approved", now),
    )
    conn.execute(
        "INSERT INTO outbox(id,request_id,kind,event_type,revision,payload,destination,"
        "available_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (
            _id(), requests["pending"], "email", "requested", 1,
            '{"body":"synthetic historical invitation"}', "first@example.invalid", now, now,
        ),
    )
    return {
        **actors, "integration": integration_id, "profile": profile_id,
        "version": version_id, "group": group_id, "action": action, **requests,
    }


def test_pinned_schema_matches_actual_github_v8_source():
    source = SCHEMA_FIXTURE.read_bytes()
    assert hashlib.sha256(source).hexdigest() == SCHEMA_SHA256
    assert b"PRAGMA user_version=8;" in source
    assert b"CREATE TABLE IF NOT EXISTS requests" in source
    assert b"CREATE TABLE IF NOT EXISTS decision_issuances" not in source
    assert b"CREATE TABLE IF NOT EXISTS approval_assignments" not in source


def test_populated_real_v8_upgrade_preserves_authorization_and_rollback(tmp_path):
    legacy = tmp_path / "untouched-v8.sqlite"
    candidate = tmp_path / "isolated-upgrade.sqlite"
    with sqlite3.connect(legacy) as source:
        source.executescript(SCHEMA_FIXTURE.read_text(encoding="utf-8"))
        source.execute("PRAGMA foreign_keys=ON")
        data = _insert_v8_records(source)
        source.commit()
        assert source.execute("PRAGMA foreign_key_check").fetchall() == []
        with closing(sqlite3.connect(candidate)) as copied:
            source.backup(copied)
    db = Database(candidate)
    with db.transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        for state in ("pending", "denied"):
            request_id = data[state]
            row = conn.execute(
                "SELECT state,action,action_hash,intake_hash,denial_reason_required,"
                "email_pin_enabled,decision_verification_mode FROM requests WHERE id=?",
                (request_id,),
            ).fetchone()
            assert row["state"] == state.upper()
            assert (row["action"], row["action_hash"], row["intake_hash"]) == (
                data["action"], "v8-action-hash", "v8-intake-hash",
            )
            assert (row["email_pin_enabled"], row["denial_reason_required"]) == (0, 0)
            assert row["decision_verification_mode"] == "EMAIL_PIN"
            assignments = conn.execute(
                "SELECT approver_id FROM approval_assignments WHERE request_id=?"
                " ORDER BY position",
                (request_id,),
            ).fetchall()
            assert [r["approver_id"] for r in assignments] == [data["first"], data["second"]]
        assert conn.execute(
            "SELECT lifecycle FROM profile_versions WHERE id=?", (data["version"],)
        ).fetchone()[0] == "ACTIVE"
        assert conn.execute(
            "SELECT count(*) FROM approver_group_members WHERE group_id=?", (data["group"],)
        ).fetchone()[0] == 2
        assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == 4
        assert conn.execute("SELECT count(*) FROM audit").fetchone()[0] == 2
        assert conn.execute("SELECT count(*) FROM request_decisions").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM outbox").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 1
        for table in ("decision_issuances", "decision_intents", "decision_confirmations",
                      "decision_otp_challenges"):
            assert conn.execute("SELECT count(*) FROM " + table).fetchone()[0] == 0

    # Restart is reentrant: no duplicate seats, no newly minted authorization.
    Database(candidate)
    with db.transaction(write=False) as conn:
        assert conn.execute("SELECT count(*) FROM approval_assignments").fetchone()[0] == 4
        assert conn.execute("SELECT count(*) FROM decision_issuances").fetchone()[0] == 0
    with sqlite3.connect(legacy) as source:
        assert source.execute("PRAGMA user_version").fetchone()[0] == 8
        assert source.execute("SELECT count(*) FROM requests").fetchone()[0] == 2

    backup, restored = tmp_path / "new-upgrade-backup.sqlite", tmp_path / "new-restored.sqlite"
    db.backup(backup)
    Database.restore(backup, restored)
    with Database(restored).transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        assert conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM decision_issuances").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM approval_assignments").fetchone()[0] == 4


def test_newer_schema_rejects_unsupported_downgrade(tmp_path):
    path = tmp_path / "future.sqlite"
    Database(path)
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA user_version=13")
    with pytest.raises(RuntimeError, match="Unsupported database schema"):
        Database(path)
