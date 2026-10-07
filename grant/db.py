"""Small single-installation SQLite store with transactional state/outbox writes."""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path

from .config import private_file

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
CREATE TABLE IF NOT EXISTS profiles (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, integration_id TEXT NOT NULL REFERENCES integrations(id),
 approver_id TEXT NOT NULL REFERENCES users(id), action_kind TEXT NOT NULL,
 deadline_seconds INTEGER NOT NULL, reminder_seconds INTEGER NOT NULL,
 max_reminders INTEGER NOT NULL, grant_seconds INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, integration_id TEXT NOT NULL REFERENCES integrations(id),
 external_id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
 requester_id TEXT REFERENCES users(id), approver_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, action TEXT NOT NULL, action_hash TEXT NOT NULL, intake_hash TEXT NOT NULL,
 source TEXT NOT NULL, reason TEXT NOT NULL, predecessor_id TEXT REFERENCES requests(id),
 state TEXT NOT NULL, decision TEXT, decision_actor TEXT, decision_at REAL,
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
 revision INTEGER NOT NULL, payload TEXT NOT NULL, destination TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
 available_at REAL NOT NULL, lease_token TEXT, lease_until REAL, last_error TEXT,
 delivered_at REAL, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_ready ON outbox(state, available_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, until REAL NOT NULL);
CREATE TABLE IF NOT EXISTS runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO runtime(key,value) VALUES('paused','0');
PRAGMA user_version=1;
"""


def uid() -> str:
    return str(uuid.uuid4())


def json_text(value: object) -> str:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self.connect()) as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise RuntimeError("Unsupported database schema; do not downgrade this binary")
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
        private_file(path)

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
            if old.execute("PRAGMA user_version").fetchone()[0] != 1:
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
