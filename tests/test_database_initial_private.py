"""SQLite installation state is private before any schema or account write.

Only disposable SQLite databases are involved. Do not use customer installations,
existing deployment credentials, browser sessions or actual external effects.
"""

import os
import sqlite3
import stat
from pathlib import Path

import pytest

from grant.db import Database


def _file_mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_initial_sqlite_file_is_owner_private_before_first_schema_write(tmp_path, monkeypatch):
    database = tmp_path / "grant.sqlite"
    actual_connect = sqlite3.connect
    initial_permissions: list[int] = []

    def check_initial_connection(filename, *args, **kwargs):
        connection = actual_connect(filename, *args, **kwargs)
        if str(filename) == str(database):
            initial_permissions.append(_file_mode(database))
        return connection

    monkeypatch.setattr("grant.db.sqlite3.connect", check_initial_connection)
    previous_umask = os.umask(0o022)
    try:
        Database(database)
    finally:
        os.umask(previous_umask)
    assert initial_permissions == [0o600], initial_permissions
    assert _file_mode(database) == 0o600
    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12


def test_existing_database_permissions_are_private_before_sqlite_read(tmp_path, monkeypatch):
    database = tmp_path / "preexisting.sqlite"
    # Intentionally create an empty SQLite file with excessive visibility,
    # then ensure the app fixes it before opening or populating it.
    with sqlite3.connect(database):
        pass
    database.chmod(0o644)
    actual_connect = sqlite3.connect
    observed = []

    def check_open(filename, *args, **kwargs):
        connection = actual_connect(filename, *args, **kwargs)
        if str(filename) == str(database):
            observed.append(_file_mode(database))
        return connection

    monkeypatch.setattr("grant.db.sqlite3.connect", check_open)
    Database(database)
    assert observed == [0o600], observed
    assert _file_mode(database) == 0o600


def test_dangling_database_symlink_cannot_create_unexpected_target(tmp_path):
    victim = tmp_path / "external-target.sqlite"
    alias = tmp_path / "grant.sqlite"
    alias.symlink_to(victim)
    with pytest.raises(ValueError, match="database path"):
        Database(alias)
    assert alias.is_symlink()
    assert not victim.exists()


def test_existing_database_symlink_is_not_silently_opened_or_chmodded(tmp_path):
    original = tmp_path / "original.sqlite"
    Database(original)
    alias = tmp_path / "grant-alias.sqlite"
    alias.symlink_to(original)
    with pytest.raises(ValueError, match="database path"):
        Database(alias)
    assert alias.is_symlink() and original.exists()
    assert _file_mode(original) == 0o600


def test_preexisting_database_survives_second_initialization_without_reset(tmp_path):
    path = tmp_path / "persisted.sqlite"
    db = Database(path)
    with db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")
    Database(path)
    with Database(path).transaction(write=False) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        assert conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
    assert _file_mode(path) == 0o600
