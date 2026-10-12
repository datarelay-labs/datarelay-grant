"""Disposable independent Control/Stellar substitutes; NEVER production adapters.

These product-side databases intentionally live apart from the Grant database.
Network traffic is bound only to an ephemeral 127.0.0.1 port. No real DataRelay
replay, SIEM write, account, external destination or privileged action occurs.
"""

from __future__ import annotations

import hashlib
import sqlite3
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Self

from grant.client import GrantClientError, verify_outcome
from grant.consumer_guard import ProductReservation


class MockProductSafetyError(ValueError):
    """The simulated product refused an ambiguous or changed operation."""


class MockControlLedger:
    """SQLite-backed product-owned reservation/effect tables with atomic CAS.

    An inserted effect represents ONLY an independent simulated replay record.
    It is not a real DataRelay Control execution or receiver delivery.
    """

    def __init__(self, path: Path, *, log_id: int, route_id: int, destination_id: int):
        if any(type(x) is not int or x <= 0 for x in (log_id, route_id, destination_id)):
            raise MockProductSafetyError("MOCK_CONTROL_BINDING_INVALID")
        self.path, self.log_id, self.route_id, self.destination_id = (
            Path(path), log_id, route_id, destination_id
        )
        if self.path.exists():
            raise MockProductSafetyError("MOCK_CONTROL_OVERWRITE_FORBIDDEN")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as conn:
            conn.executescript("""
                CREATE TABLE trusted_binding (
                    id INTEGER PRIMARY KEY CHECK(id=1),
                    log_id INTEGER NOT NULL, route_id INTEGER NOT NULL,
                    destination_id INTEGER NOT NULL
                );
                CREATE TABLE reservations (
                    operation_key TEXT PRIMARY KEY, execution_id TEXT UNIQUE NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('RESERVED','EFFECT_APPLIED','UNKNOWN')),
                    effect_count INTEGER NOT NULL DEFAULT 0 CHECK(effect_count IN (0,1))
                );
                CREATE TABLE simulated_effects (
                    operation_key TEXT PRIMARY KEY REFERENCES reservations(operation_key),
                    execution_id TEXT UNIQUE NOT NULL, replay_run_id TEXT UNIQUE NOT NULL,
                    log_id INTEGER NOT NULL, route_id INTEGER NOT NULL,
                    destination_id INTEGER NOT NULL, event_count INTEGER NOT NULL
                );
                CREATE TABLE checkpoint (id TEXT PRIMARY KEY, offset_value INTEGER NOT NULL);
                INSERT INTO checkpoint VALUES('source-read-offset',100);
            """)
            conn.execute(
                "INSERT INTO trusted_binding VALUES(1,?,?,?)",
                (self.log_id, self.route_id, self.destination_id),
            )

    @classmethod
    def reopen(cls, path: Path, *, log_id: int, route_id: int, destination_id: int) -> MockControlLedger:
        """Simulated process restart must verify the persisted installed binding."""
        if any(type(x) is not int or x <= 0 for x in (log_id, route_id, destination_id)):
            raise MockProductSafetyError("MOCK_CONTROL_BINDING_INVALID")
        path = Path(path)
        if not path.is_file():
            raise MockProductSafetyError("MOCK_CONTROL_PERSISTED_LEDGER_MISSING")
        instance = object.__new__(cls)
        instance.path = path
        instance.log_id, instance.route_id, instance.destination_id = log_id, route_id, destination_id
        try:
            with instance._db() as conn:
                row = conn.execute(
                    "SELECT log_id,route_id,destination_id FROM trusted_binding WHERE id=1"
                ).fetchone()
                expected = (log_id, route_id, destination_id)
                actual = tuple(row) if row else None
                if actual != expected:
                    raise MockProductSafetyError("MOCK_CONTROL_PERSISTED_BINDING_CHANGED")
        except sqlite3.DatabaseError:
            raise MockProductSafetyError("MOCK_CONTROL_PERSISTED_LEDGER_INVALID") from None
        return instance

    @contextmanager
    def _db(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
        finally:
            conn.close()

    @staticmethod
    def _key(value: str) -> bool:
        return type(value) is str and 1 <= len(value) <= 128 and value.isascii() and (
            all(c.isalnum() or c in "._-" for c in value)
        )

    def reserve(self, operation_key: str, execution_id: str) -> ProductReservation:
        if not self._key(operation_key) or not self._key(execution_id):
            raise MockProductSafetyError("MOCK_CONTROL_BINDING_INVALID")
        with self._db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute(
                    "SELECT * FROM reservations WHERE operation_key=?", (operation_key,)
                ).fetchone()
                if row is None:
                    if conn.execute("SELECT 1 FROM reservations WHERE execution_id=?", (execution_id,)).fetchone():
                        raise MockProductSafetyError("MOCK_CONTROL_EXECUTION_ID_REUSED")
                    conn.execute(
                        "INSERT INTO reservations(operation_key,execution_id,state) VALUES(?,?,'RESERVED')",
                        (operation_key, execution_id),
                    )
                    state, count = "RESERVED", 0
                else:
                    if row["execution_id"] != execution_id:
                        raise MockProductSafetyError("MOCK_CONTROL_CHANGED_EXECUTION_ID")
                    state, count = row["state"], row["effect_count"]
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return ProductReservation(operation_key, execution_id, state, count, durable=True)

    def mark_unknown(self, operation_key: str, execution_id: str) -> None:
        with self._db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT * FROM reservations WHERE operation_key=?", (operation_key,)).fetchone()
            if row is None or row["execution_id"] != execution_id or row["state"] != "RESERVED":
                conn.rollback()
                raise MockProductSafetyError("MOCK_CONTROL_UNKNOWN_UNVERIFIED")
            conn.execute("UPDATE reservations SET state='UNKNOWN' WHERE operation_key=?", (operation_key,))
            conn.commit()

    def apply_once(self, operation_key: str, execution_id: str) -> bool:
        """Atomic independent *simulated* effect, never a live replay endpoint."""
        with self._db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute("SELECT * FROM reservations WHERE operation_key=?", (operation_key,)).fetchone()
                if row is None or row["execution_id"] != execution_id:
                    raise MockProductSafetyError("MOCK_CONTROL_UNRESERVED_EFFECT")
                if row["state"] != "RESERVED" or row["effect_count"] != 0:
                    conn.commit()
                    return False
                conn.execute(
                    """INSERT INTO simulated_effects VALUES(?,?,?,?,?,?,?)""",
                    (operation_key, execution_id, str(uuid.uuid4()),
                     self.log_id, self.route_id, self.destination_id, 1),
                )
                changed = conn.execute(
                    """UPDATE reservations SET state='EFFECT_APPLIED',effect_count=1
                       WHERE operation_key=? AND execution_id=?
                         AND state='RESERVED' AND effect_count=0""",
                    (operation_key, execution_id),
                ).rowcount
                if changed != 1:
                    raise MockProductSafetyError("MOCK_CONTROL_ATOMIC_EFFECT_FAILED")
                conn.commit()
                return True
            except Exception:
                conn.rollback()
                raise

    def checkpoint(self) -> dict:
        with self._db() as conn:
            return {"offset": conn.execute(
                "SELECT offset_value FROM checkpoint WHERE id='source-read-offset'"
            ).fetchone()[0]}

    def read_effect_count(self, operation_key: str) -> int:
        with self._db() as conn:
            return conn.execute(
                "SELECT count(*) FROM simulated_effects WHERE operation_key=?", (operation_key,)
            ).fetchone()[0]

    def independent_readback(self, operation_key: str) -> dict | None:
        with self._db() as conn:
            row = conn.execute(
                "SELECT * FROM simulated_effects WHERE operation_key=?", (operation_key,)
            ).fetchone()
        if row is None:
            return None
        return {
            "log_id": row["log_id"], "route_id": row["route_id"],
            "destination_id": row["destination_id"], "replay_run_id": row["replay_run_id"],
            "event_count": row["event_count"], "dry_run": False,
            "outcome": "delivered",  # Simulated local ledger outcome, NOT real delivery.
        }


class MockStellarReceiver:
    """Ephemeral HMAC-enforcing receiver, persisted separate readback and dedup.

    Mirrors only stable Grant wire fields; it is NOT an actual Stellar schema.
    """

    def __init__(self, path: Path, *, secret: str, tenant: str):
        if not isinstance(secret, str) or len(secret) < 8 or not isinstance(tenant, str) or not tenant:
            raise MockProductSafetyError("MOCK_STELLAR_CONFIG_INVALID")
        self.path, self._secret, self.tenant = Path(path), secret, tenant
        if self.path.exists():
            raise MockProductSafetyError("MOCK_STELLAR_OVERWRITE_FORBIDDEN")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._fail_codes: list[int] = []
        self._attempts = 0
        with self._db() as conn:
            conn.executescript("""
                CREATE TABLE observations (
                    event_id TEXT PRIMARY KEY, request_id TEXT NOT NULL,
                    revision INTEGER NOT NULL, state TEXT NOT NULL,
                    tenant_id TEXT NOT NULL, case_id TEXT NOT NULL, alert_id TEXT NOT NULL,
                    body_digest TEXT NOT NULL, receiver_record_id TEXT UNIQUE NOT NULL
                );
                CREATE INDEX observations_request_revision ON observations(request_id,revision);
            """)

    @contextmanager
    def _db(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    @property
    def url(self) -> str:
        if self._server is None:
            raise MockProductSafetyError("MOCK_STELLAR_NOT_STARTED")
        return f"http://127.0.0.1:{self._server.server_port}/grant-outcome"

    def __enter__(self) -> Self:
        sink = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                status = sink._accept(self)
                self.send_response(status)
                self.send_header("Content-Length", "0")
                self.end_headers()

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_exc) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._server = None
        self._thread = None

    def fail_next(self, status_code: int) -> None:
        if type(status_code) is not int or not 500 <= status_code <= 599:
            raise MockProductSafetyError("MOCK_STELLAR_FAILURE_INJECTION_INVALID")
        with self._lock:
            self._fail_codes.append(status_code)

    def attempts_count(self) -> int:
        with self._lock:
            return self._attempts

    def _accept(self, request: BaseHTTPRequestHandler) -> int:
        with self._lock:
            self._attempts += 1
            if self._fail_codes:
                return self._fail_codes.pop(0)
        if request.path != "/grant-outcome":
            return 404
        try:
            count = int(request.headers.get("Content-Length", "-1"))
            if not 0 < count <= 65536:
                return 413
            raw = request.rfile.read(count)
            event = verify_outcome(self._secret, dict(request.headers), raw)
        except (ValueError, GrantClientError, KeyError, TypeError):
            return 401
        source = event.get("source")
        try:
            eid, rid = str(uuid.UUID(event["event_id"])), str(uuid.UUID(event["request_id"]))
        except (KeyError, TypeError, AttributeError, ValueError):
            return 422
        if not isinstance(source, dict) or source.get("product") != "stellar" or (
            source.get("tenant_id") != self.tenant
        ) or eid != event["event_id"] or rid != event["request_id"] or (
            event.get("state") not in ("APPROVED", "HELD", "DENIED", "EXPIRED")
        ) or type(event.get("state_revision")) is not int or event["state_revision"] < 1:
            return 422
        for key in ("case_id", "alert_id"):
            v = source.get(key)
            if type(v) is not str or not 1 <= len(v) <= 128 or any(ord(c) < 32 for c in v):
                return 422
        digest = hashlib.sha256(raw).hexdigest()
        with self._db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                existing = conn.execute(
                    "SELECT body_digest FROM observations WHERE event_id=?", (eid,)
                ).fetchone()
                if existing:
                    conn.commit()
                    return 200 if existing["body_digest"] == digest else 409
                latest = conn.execute(
                    "SELECT revision,state FROM observations WHERE request_id=? ORDER BY revision DESC LIMIT 1",
                    (rid,),
                ).fetchone()
                if latest is not None:
                    if latest["revision"] > event["state_revision"]:
                        conn.commit()
                        return 202  # accepted as stale observation, not a new change
                    if latest["revision"] == event["state_revision"]:
                        conn.commit()
                        return 409  # same revision, different event identifier
                conn.execute(
                    """INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?)""",
                    (eid, rid, event["state_revision"], event["state"],
                     source["tenant_id"], source["case_id"], source["alert_id"],
                     digest, "mock.stellar." + uuid.uuid4().hex),
                )
                conn.commit()
                return 202
            except Exception:
                conn.rollback()
                raise

    def readback(self, request_id: str) -> list[dict]:
        """Independent direct read from the second product's durable SQLite."""
        with self._db() as conn:
            rows = conn.execute(
                "SELECT * FROM observations WHERE request_id=? ORDER BY revision,event_id", (request_id,)
            ).fetchall()
        return [{
            "grant_event_id": row["event_id"],
            "grant_request_id": row["request_id"],
            "tenant_id": row["tenant_id"], "case_id": row["case_id"],
            "alert_id": row["alert_id"], "state_revision": row["revision"],
            "state": row["state"], "receiver_record_id": row["receiver_record_id"],
        } for row in rows]
