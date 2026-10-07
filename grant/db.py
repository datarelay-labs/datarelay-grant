"""Small single-installation SQLite store with transactional state/outbox writes."""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from collections.abc import Iterator
from contextlib import closing, contextmanager
from copy import deepcopy
from pathlib import Path

from .config import private_file
from .mail_templates import DEFAULT_EVENT_TEMPLATES, DEFAULT_MAIL_TEMPLATE

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')),
 enabled INTEGER NOT NULL DEFAULT 1, totp_secret TEXT, totp_last_step INTEGER NOT NULL DEFAULT -1,
 recovery_hashes TEXT NOT NULL DEFAULT '[]', created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
 created_at REAL NOT NULL, expires_at REAL NOT NULL, last_seen REAL NOT NULL,
 mfa_pending INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS integrations (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1, tenant TEXT NOT NULL DEFAULT '',
 destination TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 integration_id TEXT NOT NULL REFERENCES integrations(id), scopes TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS email_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
 subject_template TEXT NOT NULL, body_template TEXT NOT NULL,
 reminder_subject_template TEXT NOT NULL, reminder_body_template TEXT NOT NULL,
 event_templates TEXT NOT NULL, sender_display_name TEXT NOT NULL DEFAULT 'DataRelay Grant',
 enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, integration_id TEXT NOT NULL REFERENCES integrations(id),
 approver_id TEXT NOT NULL REFERENCES users(id), action_kind TEXT NOT NULL,
 email_template_id TEXT REFERENCES email_templates(id),
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS profile_versions (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
 version INTEGER NOT NULL, name TEXT NOT NULL,
 integration_id TEXT NOT NULL REFERENCES integrations(id),
 approver_id TEXT NOT NULL REFERENCES users(id), action_kind TEXT NOT NULL,
 email_template_id TEXT REFERENCES email_templates(id),
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL,
 tenant_selector TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL DEFAULT '',
 severity TEXT NOT NULL DEFAULT '', risk_level TEXT NOT NULL DEFAULT '',
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','TESTING','ACTIVE','DISABLED')),
 created_at REAL NOT NULL, updated_at REAL NOT NULL,
 activated_at REAL, disabled_at REAL,
 UNIQUE(profile_id,version)
);
CREATE INDEX IF NOT EXISTS profile_versions_active
 ON profile_versions(lifecycle,integration_id,action_kind);
CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, integration_id TEXT NOT NULL REFERENCES integrations(id),
 external_id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
 profile_version_id TEXT REFERENCES profile_versions(id),
 requester_id TEXT REFERENCES users(id), approver_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, action TEXT NOT NULL, action_hash TEXT NOT NULL, intake_hash TEXT NOT NULL,
 source TEXT NOT NULL, reason TEXT NOT NULL, predecessor_id TEXT REFERENCES requests(id),
 mail_template TEXT NOT NULL, state TEXT NOT NULL, decision TEXT, decision_actor TEXT, decision_at REAL,
 revision INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL, deadline REAL NOT NULL,
 grant_until REAL, grant_seconds INTEGER NOT NULL,
 next_reminder REAL NOT NULL, reminder_seconds INTEGER NOT NULL,
 reminder_count INTEGER NOT NULL DEFAULT 0, max_reminders INTEGER NOT NULL,
 execution_id TEXT, execution_state TEXT NOT NULL DEFAULT 'NOT_STARTED',
 execution_result TEXT, committed_at REAL,
 UNIQUE(integration_id, external_id)
);
CREATE TABLE IF NOT EXISTS audit (
 id TEXT PRIMARY KEY, request_id TEXT, at REAL NOT NULL, actor TEXT NOT NULL,
 action TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_request ON audit(request_id, at);
CREATE TABLE IF NOT EXISTS outbox (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), kind TEXT NOT NULL,
 event_type TEXT NOT NULL DEFAULT 'legacy',
 revision INTEGER NOT NULL, payload TEXT NOT NULL, destination TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
 available_at REAL NOT NULL, lease_token TEXT, lease_until REAL, last_error TEXT,
 delivered_at REAL, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_ready ON outbox(state, available_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, until REAL NOT NULL);
CREATE TABLE IF NOT EXISTS runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO runtime(key,value) VALUES('paused','0');
INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_brand_name','DataRelay Grant');
INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_sender_display_name','DataRelay Grant');
PRAGMA user_version=3;
"""


def uid() -> str:
    return str(uuid.uuid4())


def json_text(value: object) -> str:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def _legacy_event_templates(row: sqlite3.Row) -> dict[str, dict[str, str]]:
    events = deepcopy(DEFAULT_EVENT_TEMPLATES)
    events["requested"] = {
        "subject": row["subject_template"],
        "body": row["body_template"],
    }
    events["reminder"] = {
        "subject": row["reminder_subject_template"],
        "body": row["reminder_body_template"],
    }
    return events


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self.connect()) as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1, 2, 3):
                raise RuntimeError("Unsupported database schema; do not downgrade this binary")
            conn.execute("PRAGMA journal_mode=WAL")
            if version == 1:
                self._migrate_v1_to_v2(conn)
                version = 2
            if version == 2:
                self._migrate_v2_to_v3(conn)
            conn.executescript(SCHEMA)
        private_file(path)

    @staticmethod
    def _migrate_v1_to_v2(conn: sqlite3.Connection) -> None:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS email_templates (
             id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
             subject_template TEXT NOT NULL, body_template TEXT NOT NULL,
             reminder_subject_template TEXT NOT NULL, reminder_body_template TEXT NOT NULL,
             enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL, updated_at REAL NOT NULL
            )"""
        )
        profile_columns = {row[1] for row in conn.execute("PRAGMA table_info(profiles)")}
        if "email_template_id" not in profile_columns:
            conn.execute(
                "ALTER TABLE profiles ADD COLUMN email_template_id TEXT REFERENCES email_templates(id)"
            )
        request_columns = {row[1] for row in conn.execute("PRAGMA table_info(requests)")}
        if "mail_template" not in request_columns:
            conn.execute("ALTER TABLE requests ADD COLUMN mail_template TEXT")
        conn.execute(
            "UPDATE requests SET mail_template=? WHERE mail_template IS NULL OR mail_template=''",
            (json_text(DEFAULT_MAIL_TEMPLATE),),
        )
        conn.execute("PRAGMA user_version=2")

    @staticmethod
    def _migrate_v2_to_v3(conn: sqlite3.Connection) -> None:
        now = time.time()
        template_columns = {row[1] for row in conn.execute("PRAGMA table_info(email_templates)")}
        if "event_templates" not in template_columns:
            conn.execute("ALTER TABLE email_templates ADD COLUMN event_templates TEXT")
        if "sender_display_name" not in template_columns:
            conn.execute(
                "ALTER TABLE email_templates ADD COLUMN sender_display_name TEXT NOT NULL DEFAULT 'DataRelay Grant'"
            )
        for row in conn.execute("SELECT * FROM email_templates").fetchall():
            if not row["event_templates"]:
                conn.execute(
                    "UPDATE email_templates SET event_templates=? WHERE id=?",
                    (json_text(_legacy_event_templates(row)), row["id"]),
                )

        conn.execute(
            """CREATE TABLE IF NOT EXISTS profile_versions (
             id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
             version INTEGER NOT NULL, name TEXT NOT NULL,
             integration_id TEXT NOT NULL REFERENCES integrations(id),
             approver_id TEXT NOT NULL REFERENCES users(id), action_kind TEXT NOT NULL,
             email_template_id TEXT REFERENCES email_templates(id),
             deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
             max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL,
             tenant_selector TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL DEFAULT '',
             severity TEXT NOT NULL DEFAULT '', risk_level TEXT NOT NULL DEFAULT '',
             lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','TESTING','ACTIVE','DISABLED')),
             created_at REAL NOT NULL, updated_at REAL NOT NULL,
             activated_at REAL, disabled_at REAL,
             UNIQUE(profile_id,version)
            )"""
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS profile_versions_active ON profile_versions(lifecycle,integration_id,action_kind)"
        )
        active_legacy_keys = {
            (row["integration_id"], row["action_kind"])
            for row in conn.execute(
                """SELECT integration_id,action_kind
                   FROM profile_versions
                   WHERE lifecycle='ACTIVE'"""
            ).fetchall()
        }
        for profile in conn.execute("SELECT * FROM profiles ORDER BY rowid").fetchall():
            existing = conn.execute(
                "SELECT id FROM profile_versions WHERE profile_id=? LIMIT 1", (profile["id"],)
            ).fetchone()
            if existing:
                continue
            version_id = uid()
            key = (profile["integration_id"], profile["action_kind"])
            lifecycle = "DISABLED"
            if profile["enabled"] and key not in active_legacy_keys:
                lifecycle = "ACTIVE"
                active_legacy_keys.add(key)
            conn.execute(
                """INSERT INTO profile_versions(
                   id,profile_id,version,name,integration_id,approver_id,action_kind,email_template_id,
                   deadline_seconds,reminder_seconds,max_reminders,grant_seconds,
                   tenant_selector,environment,severity,risk_level,lifecycle,
                   created_at,updated_at,activated_at,disabled_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    version_id,
                    profile["id"],
                    1,
                    profile["name"],
                    profile["integration_id"],
                    profile["approver_id"],
                    profile["action_kind"],
                    profile["email_template_id"],
                    profile["deadline_seconds"],
                    profile["reminder_seconds"],
                    profile["max_reminders"],
                    profile["grant_seconds"],
                    "",
                    "",
                    "",
                    "",
                    lifecycle,
                    now,
                    now,
                    now if lifecycle == "ACTIVE" else None,
                    now if lifecycle == "DISABLED" else None,
                ),
            )

        request_columns = {row[1] for row in conn.execute("PRAGMA table_info(requests)")}
        if "profile_version_id" not in request_columns:
            conn.execute(
                "ALTER TABLE requests ADD COLUMN profile_version_id TEXT REFERENCES profile_versions(id)"
            )
        conn.execute(
            """UPDATE requests
               SET profile_version_id=(
                   SELECT pv.id FROM profile_versions pv
                   WHERE pv.profile_id=requests.profile_id
                   ORDER BY pv.version DESC LIMIT 1
               )
               WHERE profile_version_id IS NULL"""
        )

        outbox_columns = {row[1] for row in conn.execute("PRAGMA table_info(outbox)")}
        if "event_type" not in outbox_columns:
            conn.execute("ALTER TABLE outbox ADD COLUMN event_type TEXT NOT NULL DEFAULT 'legacy'")

        conn.execute(
            "INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_brand_name','DataRelay Grant')"
        )
        conn.execute(
            "INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_sender_display_name','DataRelay Grant')"
        )
        conn.execute("PRAGMA user_version=3")

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")
        return conn

    @contextmanager
    def transaction(self, *, write: bool = True) -> Iterator[sqlite3.Connection]:
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def backup(self, destination: Path) -> None:
        if destination.exists() or destination.resolve() == self.path.resolve():
            raise ValueError("Backup destination must be a new file")
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self.connect()) as source, closing(sqlite3.connect(destination)) as target:
            source.backup(target)
        private_file(destination)

    @staticmethod
    def restore(source: Path, destination: Path) -> None:
        if destination.exists() or not source.is_file():
            raise ValueError("Restore requires an existing backup and a NEW destination")
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(sqlite3.connect(f"file:{source}?mode=ro", uri=True)) as old:
            if old.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("Backup integrity check failed")
            if old.execute("PRAGMA user_version").fetchone()[0] not in (1, 2, 3):
                raise ValueError("Backup schema mismatch")
            with closing(sqlite3.connect(destination)) as new:
                old.backup(new)
                new.execute("UPDATE runtime SET value='1' WHERE key='paused'")
                new.execute("DELETE FROM sessions")
                new.execute(
                    "UPDATE outbox SET state='PENDING',lease_token=NULL,lease_until=NULL WHERE state='SENDING'"
                )
                new.commit()
        private_file(destination)


def audit(
    conn: sqlite3.Connection,
    request_id: str | None,
    actor: str,
    action: str,
    detail: object = None,
    now: float | None = None,
) -> None:
    conn.execute(
        "INSERT INTO audit VALUES(?,?,?,?,?,?)",
        (
            uid(),
            request_id,
            time.time() if now is None else now,
            actor,
            action,
            json_text(detail or {}),
        ),
    )
