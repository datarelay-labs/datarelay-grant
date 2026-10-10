"""Small single-installation SQLite store with transactional state/outbox writes."""

from __future__ import annotations

import json
import os
import sqlite3
import stat
import tempfile
import time
import uuid
from collections.abc import Iterator
from contextlib import closing, contextmanager
from copy import deepcopy
from pathlib import Path

from .mail_templates import DEFAULT_EVENT_TEMPLATES, DEFAULT_MAIL_TEMPLATE


def _ensure_private_database_path(path: Path) -> None:
    """Reserve or open only a regular database inode, private before SQLite.

    An exclusive 0600 create never follows an existing symlink. On an existing
    file, O_NOFOLLOW binds the mode change to the opened inode before SQLite
    reads or writes any state. The operator owns the private parent directory.
    """
    if path.is_symlink():
        raise ValueError("SQLite database path must not be a symlink")
    try:
        descriptor = os.open(
            path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600
        )
    except FileExistsError:
        if path.is_symlink():
            raise ValueError("SQLite database path must not be a symlink") from None
        descriptor = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ValueError("SQLite database path must be a regular file")
        os.fchmod(descriptor, 0o600)
    finally:
        os.close(descriptor)


@contextmanager
def _private_sqlite_output(destination: Path) -> Iterator[Path]:
    """Stage complete recovery data at mode 0600, then publish without overwrite.

    tempfile.mkstemp creates a private inode BEFORE any SQLite writes, even under
    an operator umask such as 0022. A hard link in the same directory publishes
    only a complete database and fails if an existing path (including a dangling
    symlink) appears before publication. An error never leaves a partial final
    destination or staging file.
    """
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, filename = tempfile.mkstemp(
        prefix=".grant-private-", suffix=".sqlite", dir=destination.parent
    )
    os.close(fd)
    staged = Path(filename)
    try:
        yield staged
        with staged.open("rb") as completed:
            os.fsync(completed.fileno())
        os.link(staged, destination)
    finally:
        staged.unlink(missing_ok=True)


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
 destination TEXT NOT NULL, created_at REAL NOT NULL,
 decision_verification_minimum TEXT NOT NULL DEFAULT 'EMAIL_PIN'
  CHECK(decision_verification_minimum IN ('EMAIL_PIN','EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA'))
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
 approver_id TEXT NOT NULL REFERENCES users(id), approval_mode TEXT NOT NULL DEFAULT 'SINGLE', approver_group_id TEXT, approvals_required INTEGER, action_kind TEXT NOT NULL,
 email_template_id TEXT REFERENCES email_templates(id),
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
 denial_reason_required INTEGER NOT NULL DEFAULT 0 CHECK(denial_reason_required IN (0,1)),
 verification_mode TEXT NOT NULL DEFAULT 'INHERIT'
  CHECK(verification_mode IN ('INHERIT','EMAIL_PIN','EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA')),
 decision_link_ttl_seconds INTEGER
);
CREATE TABLE IF NOT EXISTS profile_versions (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
 version INTEGER NOT NULL, name TEXT NOT NULL,
 integration_id TEXT NOT NULL REFERENCES integrations(id),
 approver_id TEXT NOT NULL REFERENCES users(id), approval_mode TEXT NOT NULL DEFAULT 'SINGLE', approver_group_id TEXT, approvals_required INTEGER, action_kind TEXT NOT NULL,
 email_template_id TEXT REFERENCES email_templates(id),
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL,
 tenant_selector TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL DEFAULT '',
 severity TEXT NOT NULL DEFAULT '', risk_level TEXT NOT NULL DEFAULT '',
 denial_reason_required INTEGER NOT NULL DEFAULT 0 CHECK(denial_reason_required IN (0,1)),
 verification_mode TEXT NOT NULL DEFAULT 'INHERIT'
  CHECK(verification_mode IN ('INHERIT','EMAIL_PIN','EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA')),
 decision_link_ttl_seconds INTEGER,
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
 requester_id TEXT REFERENCES users(id), approver_id TEXT NOT NULL REFERENCES users(id), approval_plan TEXT NOT NULL DEFAULT '{}',
 denial_reason_required INTEGER NOT NULL DEFAULT 0 CHECK(denial_reason_required IN (0,1)),
 email_pin_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_pin_enabled IN (0,1)),
 decision_verification_mode TEXT NOT NULL DEFAULT 'EMAIL_PIN'
  CHECK(decision_verification_mode IN ('EMAIL_PIN','EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA')),
 decision_link_ttl_seconds INTEGER NOT NULL DEFAULT 604800,
 title TEXT NOT NULL, action TEXT NOT NULL, action_hash TEXT NOT NULL, intake_hash TEXT NOT NULL,
 source TEXT NOT NULL, reason TEXT NOT NULL, predecessor_id TEXT REFERENCES requests(id),
 mail_template TEXT NOT NULL, state TEXT NOT NULL,
 collaboration_state TEXT NOT NULL DEFAULT 'OPEN' CHECK(collaboration_state IN ('OPEN','INFO_REQUESTED','CHANGES_REQUESTED')),
 decision TEXT, decision_actor TEXT, decision_at REAL,
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
 delivered_at REAL, created_at REAL NOT NULL,
 sealed_payload INTEGER NOT NULL DEFAULT 0 CHECK(sealed_payload IN (0,1)),
 otp_challenge_id TEXT,
 recipient_id TEXT REFERENCES users(id),
 approval_assignment_id TEXT,
 delegation_id TEXT,
 issuance_id TEXT
);
CREATE INDEX IF NOT EXISTS outbox_ready ON outbox(state, available_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, until REAL NOT NULL);
CREATE TABLE IF NOT EXISTS runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO runtime(key,value) VALUES('paused','0');
INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_brand_name','DataRelay Grant');
INSERT OR IGNORE INTO runtime(key,value) VALUES('notification_sender_display_name','DataRelay Grant');
CREATE TABLE IF NOT EXISTS approver_groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1,
 created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS approver_group_members (
 group_id TEXT NOT NULL REFERENCES approver_groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL,
 PRIMARY KEY(group_id,user_id), UNIQUE(group_id,position)
);
CREATE TABLE IF NOT EXISTS request_decisions (
 request_id TEXT NOT NULL REFERENCES requests(id), actor_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVED','HELD','DENIED')),
 reason TEXT NOT NULL DEFAULT '', decided_at REAL NOT NULL,
 PRIMARY KEY(request_id,actor_id)
);
CREATE TABLE IF NOT EXISTS approval_assignments (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
 step_id TEXT NOT NULL, approver_id TEXT NOT NULL REFERENCES users(id),
 position INTEGER NOT NULL, assignment_epoch INTEGER NOT NULL DEFAULT 1,
 created_at REAL NOT NULL,
 UNIQUE(request_id,position), UNIQUE(request_id,approver_id)
);
CREATE INDEX IF NOT EXISTS approval_assignments_user ON approval_assignments(approver_id,request_id);
CREATE TABLE IF NOT EXISTS decision_issuances (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
 approval_assignment_id TEXT NOT NULL REFERENCES approval_assignments(id),
 recipient_id TEXT NOT NULL REFERENCES users(id),
 recipient_email_digest TEXT NOT NULL,
 delegation_id TEXT REFERENCES delegations(id),
 generation INTEGER NOT NULL, assignment_epoch INTEGER NOT NULL,
 pin_digest TEXT NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','LOCKED','REVOKED','CONSUMED')),
 issued_at REAL NOT NULL, expires_at REAL NOT NULL,
 UNIQUE(approval_assignment_id,recipient_id,generation)
);
CREATE INDEX IF NOT EXISTS decision_issuances_request ON decision_issuances(request_id,state);
CREATE TABLE IF NOT EXISTS decision_intents (
 token_digest TEXT PRIMARY KEY,
 issuance_id TEXT NOT NULL REFERENCES decision_issuances(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPROVED','HELD','DENIED')),
 approval_step_id TEXT NOT NULL, assignment_epoch INTEGER NOT NULL,
 action_hash TEXT NOT NULL, expires_at REAL NOT NULL,
 used_at REAL
);
CREATE INDEX IF NOT EXISTS decision_intents_issuance ON decision_intents(issuance_id);
CREATE TABLE IF NOT EXISTS decision_confirmations (
 context_digest TEXT PRIMARY KEY,
 intent_digest TEXT NOT NULL REFERENCES decision_intents(token_digest),
 expires_at REAL NOT NULL, created_at REAL NOT NULL, consumed_at REAL,
 otp_verified_at REAL,
 mfa_verified_at REAL, verified_user_id TEXT REFERENCES users(id),
 mfa_session_id TEXT
);
CREATE TABLE IF NOT EXISTS decision_otp_challenges (
 id TEXT PRIMARY KEY, context_digest TEXT NOT NULL REFERENCES decision_confirmations(context_digest),
 intent_digest TEXT NOT NULL REFERENCES decision_intents(token_digest),
 otp_digest TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','LOCKED','CONSUMED','REVOKED')),
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 issued_at REAL NOT NULL, expires_at REAL NOT NULL, verified_at REAL
);
CREATE INDEX IF NOT EXISTS decision_otp_by_context
 ON decision_otp_challenges(context_digest,issued_at);
CREATE INDEX IF NOT EXISTS decision_confirmations_intent ON decision_confirmations(intent_digest);
CREATE TABLE IF NOT EXISTS request_comments (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
 author_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('COMMENT','QUESTION','REQUEST_INFO','REQUEST_CHANGES','INFO_RESPONSE')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS request_comments_by_request
 ON request_comments(request_id,created_at,id);
CREATE TABLE IF NOT EXISTS delegations (
 id TEXT PRIMARY KEY, delegator_id TEXT NOT NULL REFERENCES users(id),
 substitute_id TEXT NOT NULL REFERENCES users(id), starts_at REAL NOT NULL, ends_at REAL NOT NULL,
 created_at REAL NOT NULL, revoked_at REAL
);
CREATE INDEX IF NOT EXISTS delegations_active ON delegations(delegator_id,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS escalations (
 request_id TEXT PRIMARY KEY REFERENCES requests(id),
 target_user_id TEXT REFERENCES users(id),
 target_group_id TEXT REFERENCES approver_groups(id),
 target_members TEXT NOT NULL DEFAULT '[]',
 due_at REAL NOT NULL, fired_at REAL,
 CHECK ((target_user_id IS NOT NULL) != (target_group_id IS NOT NULL))
);
PRAGMA user_version=12;
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


@contextmanager
def _existing_installation(path: Path) -> Iterator[tuple[sqlite3.Connection, int, str]]:
    """Inspect an installed SQLite inode read-only; never initialize or migrate it.

    This is for operator health and pre-upgrade backups, not the ordinary
    application runtime constructor. SQLite mode=ro must not invent missing state.
    """
    if path.is_symlink() or not path.is_file():
        raise ValueError("Installation database is missing or not a regular file")
    with closing(sqlite3.connect(f"{path.absolute().as_uri()}?mode=ro", uri=True)) as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version not in range(1, 13):
            raise ValueError("Unsupported installation database schema")
        if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError("Installation database integrity check failed")
        try:
            pause_rows = conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchall()
        except sqlite3.DatabaseError as exc:
            raise ValueError("Installation recovery pause marker is unavailable") from exc
        if len(pause_rows) != 1 or pause_rows[0][0] not in ("0", "1"):
            raise ValueError("Installation recovery pause marker is invalid")
        yield conn, version, pause_rows[0][0]


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        _ensure_private_database_path(path)
        with closing(self.connect()) as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12):
                raise RuntimeError("Unsupported database schema; do not downgrade this binary")
            conn.execute("PRAGMA journal_mode=WAL")
            if version == 1:
                self._migrate_v1_to_v2(conn)
                version = 2
            if version == 2:
                self._migrate_v2_to_v3(conn)
                version = 3
            if version == 3:
                self._migrate_v3_to_v4(conn)
                version = 4
            if version == 4:
                self._migrate_v4_to_v5(conn)
                version = 5
            if version == 5:
                self._migrate_v5_to_v6(conn)
                version = 6
            if version == 6:
                self._migrate_v6_to_v7(conn)
                version = 7
            if version == 7:
                self._migrate_v7_to_v8(conn)
                version = 8
            if version == 8:
                self._migrate_v8_to_v9(conn)
                version = 9
            if version == 9:
                self._migrate_v9_to_v10(conn)
                version = 10
            if version == 10:
                self._migrate_v10_to_v11(conn)
                version = 11
            if version == 11:
                self._migrate_v11_to_v12(conn)
            conn.executescript(SCHEMA)

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
             approver_id TEXT NOT NULL REFERENCES users(id), approval_mode TEXT NOT NULL DEFAULT 'SINGLE', approver_group_id TEXT, approvals_required INTEGER, action_kind TEXT NOT NULL,
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
                "SELECT id,lifecycle FROM profile_versions WHERE profile_id=? LIMIT 1",
                (profile["id"],),
            ).fetchone()
            key = (profile["integration_id"], profile["action_kind"])
            if existing:
                if profile["enabled"] and existing["lifecycle"] == "ACTIVE":
                    active_legacy_keys.add(key)
                continue
            version_id = uid()
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

    @staticmethod
    def _migrate_v3_to_v4(conn: sqlite3.Connection) -> None:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS approver_groups (
         id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1,
         created_at REAL NOT NULL, updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS approver_group_members (
         group_id TEXT NOT NULL REFERENCES approver_groups(id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL,
         PRIMARY KEY(group_id,user_id), UNIQUE(group_id,position)
        );
        CREATE TABLE IF NOT EXISTS request_decisions (
         request_id TEXT NOT NULL REFERENCES requests(id), actor_id TEXT NOT NULL REFERENCES users(id),
         decision TEXT NOT NULL CHECK(decision IN ('APPROVED','HELD','DENIED')),
         reason TEXT NOT NULL DEFAULT '', decided_at REAL NOT NULL,
         PRIMARY KEY(request_id,actor_id)
        );
        """)
        for table in ("profiles", "profile_versions"):
            columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            if "approval_mode" not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'SINGLE'")
            if "approver_group_id" not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN approver_group_id TEXT")
            if "approvals_required" not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN approvals_required INTEGER")
        columns = {row[1] for row in conn.execute("PRAGMA table_info(requests)")}
        if "approval_plan" not in columns:
            conn.execute("ALTER TABLE requests ADD COLUMN approval_plan TEXT NOT NULL DEFAULT '{}'")
        conn.execute("PRAGMA user_version=4")

    @staticmethod
    def _migrate_v4_to_v5(conn: sqlite3.Connection) -> None:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS delegations (
         id TEXT PRIMARY KEY, delegator_id TEXT NOT NULL REFERENCES users(id),
         substitute_id TEXT NOT NULL REFERENCES users(id), starts_at REAL NOT NULL, ends_at REAL NOT NULL,
         created_at REAL NOT NULL, revoked_at REAL
        );
        CREATE INDEX IF NOT EXISTS delegations_active ON delegations(delegator_id,starts_at,ends_at);
        """)
        conn.execute("PRAGMA user_version=5")

    @staticmethod
    def _migrate_v5_to_v6(conn: sqlite3.Connection) -> None:
        conn.execute("CREATE TABLE IF NOT EXISTS escalations (request_id TEXT PRIMARY KEY REFERENCES requests(id), target_user_id TEXT NOT NULL REFERENCES users(id), due_at REAL NOT NULL, fired_at REAL)")
        conn.execute("PRAGMA user_version=6")

    @staticmethod
    def _migrate_v6_to_v7(conn: sqlite3.Connection) -> None:
        conn.executescript("""
        CREATE TABLE escalations_v7 (
         request_id TEXT PRIMARY KEY REFERENCES requests(id),
         target_user_id TEXT REFERENCES users(id),
         target_group_id TEXT REFERENCES approver_groups(id),
         target_members TEXT NOT NULL DEFAULT '[]',
         due_at REAL NOT NULL, fired_at REAL,
         CHECK ((target_user_id IS NOT NULL) != (target_group_id IS NOT NULL))
        );
        INSERT INTO escalations_v7(
         request_id,target_user_id,target_group_id,target_members,due_at,fired_at
        )
        SELECT request_id,target_user_id,NULL,json_array(target_user_id),due_at,fired_at
        FROM escalations;
        DROP TABLE escalations;
        ALTER TABLE escalations_v7 RENAME TO escalations;
        PRAGMA user_version=7;
        """)

    @staticmethod
    def _migrate_v7_to_v8(conn: sqlite3.Connection) -> None:
        # Earlier schema test fixtures and interrupted upgrades can retain a
        # newer column while presenting an older user_version. This step must
        # be safe to re-enter instead of failing with "duplicate column".
        columns = {
            column[1] for column in conn.execute("PRAGMA table_info(requests)")
        }
        if "collaboration_state" not in columns:
            conn.execute(
                "ALTER TABLE requests ADD COLUMN collaboration_state TEXT NOT NULL "
                "DEFAULT 'OPEN' CHECK(collaboration_state IN "
                "('OPEN','INFO_REQUESTED','CHANGES_REQUESTED'))"
            )
        conn.execute("PRAGMA user_version=8")

    @staticmethod
    def _migrate_v8_to_v9(conn: sqlite3.Connection) -> None:
        # Idempotent additive migration. Old requests never receive a new
        # passwordless issuance merely because their database was upgraded.
        for table, fields in {
            "profiles": (("denial_reason_required", "INTEGER NOT NULL DEFAULT 0"),),
            "profile_versions": (("denial_reason_required", "INTEGER NOT NULL DEFAULT 0"),),
            "requests": (
                ("denial_reason_required", "INTEGER NOT NULL DEFAULT 0"),
                ("email_pin_enabled", "INTEGER NOT NULL DEFAULT 0"),
            ),
        }.items():
            existing = {col[1] for col in conn.execute(f"PRAGMA table_info({table})")}
            for name, definition in fields:
                if name not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS approval_assignments (
         id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
         step_id TEXT NOT NULL, approver_id TEXT NOT NULL REFERENCES users(id),
         position INTEGER NOT NULL, assignment_epoch INTEGER NOT NULL DEFAULT 1,
         created_at REAL NOT NULL,
         UNIQUE(request_id,position), UNIQUE(request_id,approver_id)
        );
        CREATE INDEX IF NOT EXISTS approval_assignments_user
         ON approval_assignments(approver_id,request_id);
        ''')
        for request in conn.execute("SELECT id,approver_id,approval_plan,created_at FROM requests").fetchall():
            plan = json.loads(request["approval_plan"] or "{}")
            members = plan.get("members") or [request["approver_id"]]
            shared_step = uid()
            for position, member in enumerate(members):
                if not conn.execute(
                    "SELECT id FROM approval_assignments WHERE request_id=? AND position=?",
                    (request["id"], position),
                ).fetchone():
                    conn.execute(
                        '''INSERT INTO approval_assignments
                           (id,request_id,step_id,approver_id,position,created_at)
                           VALUES(?,?,?,?,?,?)''',
                        (
                            uid(), request["id"],
                            uid() if plan.get("mode") == "SEQUENTIAL" else shared_step,
                            member, position, request["created_at"],
                        ),
                    )
        conn.execute("PRAGMA user_version=9")

    @staticmethod
    def _migrate_v9_to_v10(conn: sqlite3.Connection) -> None:
        # v9 approvals stay authenticated-only until explicit new issuance.
        current = {column[1] for column in conn.execute("PRAGMA table_info(outbox)")}
        for name, definition in (
            ("sealed_payload", "INTEGER NOT NULL DEFAULT 0"),
            ("recipient_id", "TEXT REFERENCES users(id)"),
            ("approval_assignment_id", "TEXT"),
            ("delegation_id", "TEXT"),
            ("issuance_id", "TEXT"),
        ):
            if name not in current:
                conn.execute(f"ALTER TABLE outbox ADD COLUMN {name} {definition}")
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS decision_issuances (
         id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id),
         approval_assignment_id TEXT NOT NULL REFERENCES approval_assignments(id),
         recipient_id TEXT NOT NULL REFERENCES users(id),
         recipient_email_digest TEXT NOT NULL,
         delegation_id TEXT REFERENCES delegations(id),
         generation INTEGER NOT NULL, assignment_epoch INTEGER NOT NULL,
         pin_digest TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0,
         state TEXT NOT NULL DEFAULT 'ACTIVE'
           CHECK(state IN ('ACTIVE','LOCKED','REVOKED','CONSUMED')),
         issued_at REAL NOT NULL, expires_at REAL NOT NULL,
         UNIQUE(approval_assignment_id,recipient_id,generation)
        );
        CREATE INDEX IF NOT EXISTS decision_issuances_request
         ON decision_issuances(request_id,state);
        CREATE TABLE IF NOT EXISTS decision_intents (
         token_digest TEXT PRIMARY KEY,
         issuance_id TEXT NOT NULL REFERENCES decision_issuances(id),
         outcome TEXT NOT NULL CHECK(outcome IN ('APPROVED','HELD','DENIED')),
         approval_step_id TEXT NOT NULL, assignment_epoch INTEGER NOT NULL,
         action_hash TEXT NOT NULL, expires_at REAL NOT NULL, used_at REAL
        );
        CREATE INDEX IF NOT EXISTS decision_intents_issuance
         ON decision_intents(issuance_id);
        CREATE TABLE IF NOT EXISTS decision_confirmations (
         context_digest TEXT PRIMARY KEY,
         intent_digest TEXT NOT NULL REFERENCES decision_intents(token_digest),
         expires_at REAL NOT NULL, created_at REAL NOT NULL, consumed_at REAL
        );
        CREATE INDEX IF NOT EXISTS decision_confirmations_intent
         ON decision_confirmations(intent_digest);
        PRAGMA user_version=10;
        ''')

    @staticmethod
    def _migrate_v10_to_v11(conn: sqlite3.Connection) -> None:
        # Upgrade only adds versioned defaults. It never issues email links
        # or downgrades the assurance of an in-flight approval.
        for table, fields in {
            "integrations": (
                ("decision_verification_minimum", "TEXT NOT NULL DEFAULT 'EMAIL_PIN'"),
            ),
            "profiles": (
                ("verification_mode", "TEXT NOT NULL DEFAULT 'INHERIT'"),
                ("decision_link_ttl_seconds", "INTEGER"),
            ),
            "profile_versions": (
                ("verification_mode", "TEXT NOT NULL DEFAULT 'INHERIT'"),
                ("decision_link_ttl_seconds", "INTEGER"),
            ),
            "requests": (
                ("decision_verification_mode", "TEXT NOT NULL DEFAULT 'EMAIL_PIN'"),
                ("decision_link_ttl_seconds", "INTEGER NOT NULL DEFAULT 604800"),
            ),
            "outbox": (("otp_challenge_id", "TEXT"),),
            "decision_confirmations": (("otp_verified_at", "REAL"),),
        }.items():
            existing = {col[1] for col in conn.execute(f"PRAGMA table_info({table})")}
            for name, definition in fields:
                if name not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS decision_otp_challenges (
         id TEXT PRIMARY KEY,
         context_digest TEXT NOT NULL REFERENCES decision_confirmations(context_digest),
         intent_digest TEXT NOT NULL REFERENCES decision_intents(token_digest),
         otp_digest TEXT NOT NULL,
         state TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK(state IN ('ACTIVE','LOCKED','CONSUMED','REVOKED')),
         failed_attempts INTEGER NOT NULL DEFAULT 0,
         issued_at REAL NOT NULL, expires_at REAL NOT NULL, verified_at REAL
        );
        CREATE INDEX IF NOT EXISTS decision_otp_by_context
         ON decision_otp_challenges(context_digest,issued_at);
        PRAGMA user_version=11;
        """)

    @staticmethod
    def _migrate_v11_to_v12(conn: sqlite3.Connection) -> None:
        # Add only proof metadata. Existing sessions, older email contexts,
        # and in-flight requests never gain verified identity implicitly.
        existing = {
            column[1] for column in conn.execute(
                "PRAGMA table_info(decision_confirmations)"
            )
        }
        for name, definition in (
            ("mfa_verified_at", "REAL"),
            ("verified_user_id", "TEXT REFERENCES users(id)"),
            ("mfa_session_id", "TEXT"),
        ):
            if name not in existing:
                conn.execute(
                    "ALTER TABLE decision_confirmations "
                    f"ADD COLUMN {name} {definition}"
                )
        conn.execute("PRAGMA user_version=12")

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

    @staticmethod
    def inspect_existing(path: Path) -> tuple[int, str]:
        with _existing_installation(path) as (_source, version, paused):
            return version, paused

    @staticmethod
    def backup_existing(source_path: Path, destination: Path) -> None:
        """Take a complete private pre-upgrade backup without opening/migrating runtime."""
        if (destination.exists() or destination.is_symlink()
                or destination.resolve() == source_path.resolve()):
            raise ValueError("Backup destination must be a new file")
        with (
            _existing_installation(source_path) as (source, _version, _paused),
            _private_sqlite_output(destination) as staged,
            closing(sqlite3.connect(staged)) as target,
        ):
            source.backup(target)

    def backup(self, destination: Path) -> None:
        if destination.exists() or destination.is_symlink() or destination.resolve() == self.path.resolve():
            raise ValueError("Backup destination must be a new file")
        with (
            _private_sqlite_output(destination) as staged,
            closing(self.connect()) as source,
            closing(sqlite3.connect(staged)) as target,
        ):
            source.backup(target)

    @staticmethod
    def restore(source: Path, destination: Path) -> None:
        if destination.exists() or destination.is_symlink() or not source.is_file():
            raise ValueError("Restore requires an existing backup and a NEW destination")
        # Convert the selected path into a percent-escaped URI: literal ? or #
        # in an operator backup name must not redirect SQLite to another DB.
        with closing(sqlite3.connect(f"{source.absolute().as_uri()}?mode=ro", uri=True)) as old:
            if old.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("Backup integrity check failed")
            if old.execute("PRAGMA user_version").fetchone()[0] not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12):
                raise ValueError("Backup schema mismatch")
            with (
                _private_sqlite_output(destination) as staged,
                closing(sqlite3.connect(staged)) as new,
            ):
                old.backup(new)
                pause_update = new.execute(
                    "UPDATE runtime SET value='1' WHERE key='paused'"
                )
                if pause_update.rowcount != 1:
                    # Without the marker, future schema initialization would
                    # insert paused='0', silently reviving a damaged backup.
                    # Refuse publication of any such restored installation.
                    raise ValueError("Backup missing recovery pause marker")
                new.execute("DELETE FROM sessions")
                new.execute(
                    "UPDATE outbox SET state='PENDING',lease_token=NULL,lease_until=NULL WHERE state='SENDING'"
                )
                new.commit()


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
