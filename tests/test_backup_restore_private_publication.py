"""M5 protected SQLite backup/restore must never publish partially private state.

All files are isolated to pytest's disposable temporary directory.  Synthetic
faults are inserted after SQLite has copied actual fixture data; no customer
installation, privileged host, production data or external effect is involved.
"""

import os
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path

import pytest

from grant.db import Database


@contextmanager
def permissive_umask():
    old = os.umask(0o022)
    try:
        yield
    finally:
        os.umask(old)


def private(path: Path) -> bool:
    return stat.S_IMODE(path.stat().st_mode) == 0o600


def assert_no_temporary_recovery_paths(path: Path) -> None:
    assert not list(path.glob(".grant-private-*.sqlite"))


def test_backup_and_restore_create_owner_private_file_before_sqlite_writes(
    env, tmp_path, monkeypatch,
):
    # Intercept the SQLite connection before source.backup/restore performs
    # its first write. Checking permissions only after a late chmod would
    # miss a world-readable 0644 window containing user and token hashes.
    real_connect = sqlite3.connect
    initial_modes = []

    def inspect_open(filename, *args, **kwargs):
        connection = real_connect(filename, *args, **kwargs)
        if not kwargs.get("uri"):
            path = Path(str(filename))
            if path.parent == tmp_path and path != env.db.path:
                initial_modes.append(stat.S_IMODE(path.stat().st_mode))
        return connection

    monkeypatch.setattr("grant.db.sqlite3.connect", inspect_open)
    env.human("admin")  # a disposable session/private row to preserve/clear
    backup, restored = tmp_path / "private-backup.sqlite", tmp_path / "private-restore.sqlite"
    with permissive_umask():
        env.db.backup(backup)
        Database.restore(backup, restored)

    assert len(initial_modes) >= 2, "Both backup and restore must copy into private files"
    assert set(initial_modes) == {0o600}, initial_modes
    assert private(backup) and private(restored)
    with Database(restored).transaction(write=False) as conn:
        assert conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    assert_no_temporary_recovery_paths(tmp_path)


def test_backup_rejects_dangling_symlink_without_creating_outside_target(env, tmp_path):
    victim = tmp_path / "not-authorized-backup.sqlite"
    shortcut = tmp_path / "outgoing-backup.sqlite"
    shortcut.symlink_to(victim)
    with pytest.raises((ValueError, FileExistsError)):
        env.db.backup(shortcut)
    assert shortcut.is_symlink()
    assert not victim.exists()
    assert_no_temporary_recovery_paths(tmp_path)


def test_restore_rejects_dangling_symlink_without_creating_outside_target(env, tmp_path):
    backup = tmp_path / "safe-source.sqlite"
    env.db.backup(backup)
    victim = tmp_path / "not-authorized-restore.sqlite"
    shortcut = tmp_path / "incoming-restored.sqlite"
    shortcut.symlink_to(victim)
    with pytest.raises((ValueError, FileExistsError)):
        Database.restore(backup, shortcut)
    assert shortcut.is_symlink()
    assert not victim.exists()
    assert private(backup)
    assert_no_temporary_recovery_paths(tmp_path)


def test_backup_failure_after_copy_never_publishes_partial_result(env, tmp_path, monkeypatch):
    real_connect = env.db.connect

    class FaultAfterCopy:
        def __init__(self, inner):
            self.inner = inner

        def backup(self, target):
            self.inner.backup(target)
            raise RuntimeError("DISPOSABLE_POST_COPY_FAILURE")

        def close(self):
            self.inner.close()

    monkeypatch.setattr(env.db, "connect", lambda: FaultAfterCopy(real_connect()))
    destination = tmp_path / "should-not-be-published.sqlite"
    with pytest.raises(RuntimeError, match="DISPOSABLE_POST_COPY_FAILURE"), permissive_umask():
        env.db.backup(destination)
    assert not destination.exists()
    assert_no_temporary_recovery_paths(tmp_path)


def test_restore_failure_after_copy_never_publishes_partial_result(env, tmp_path, monkeypatch):
    backup = tmp_path / "safe-source.sqlite"
    env.db.backup(backup)
    real_connect = sqlite3.connect

    class FaultAfterCopy:
        def __init__(self, inner):
            self.inner = inner

        def execute(self, *args):
            return self.inner.execute(*args)

        def backup(self, target):
            self.inner.backup(target)
            raise RuntimeError("DISPOSABLE_RESTORE_POST_COPY_FAILURE")

        def close(self):
            self.inner.close()

    def inject_fault(filename, *args, **kwargs):
        connection = real_connect(filename, *args, **kwargs)
        return FaultAfterCopy(connection) if kwargs.get("uri") else connection

    monkeypatch.setattr("grant.db.sqlite3.connect", inject_fault)
    destination = tmp_path / "restore-must-remain-unpublished.sqlite"
    with pytest.raises(RuntimeError, match="DISPOSABLE_RESTORE_POST_COPY_FAILURE"), permissive_umask():
        Database.restore(backup, destination)
    assert backup.exists() and private(backup)
    assert not destination.exists()
    assert_no_temporary_recovery_paths(tmp_path)


def test_existing_destination_remains_unchanged_without_overwrite(env, tmp_path):
    backup = tmp_path / "source.sqlite"
    env.db.backup(backup)
    protected = tmp_path / "user-data.txt"
    protected.write_text("DO_NOT_OVERWRITE")
    with pytest.raises((ValueError, FileExistsError)):
        env.db.backup(protected)
    with pytest.raises((ValueError, FileExistsError)):
        Database.restore(backup, protected)
    assert protected.read_text() == "DO_NOT_OVERWRITE"
    assert private(backup)

@pytest.mark.parametrize("operation", ["backup", "restore"])
def test_concurrent_destination_creation_cannot_overwrite_user_file(
    env, tmp_path, monkeypatch, operation,
):
    backup = tmp_path / "trusted-input.sqlite"
    if operation == "restore":
        env.db.backup(backup)

    destination = tmp_path / "raced-output.sqlite"
    real_link = os.link

    def inject_competing_creator(staged, final_path):
        # A separate operator/process wins the final pathname immediately
        # before publication; it must remain untouched.
        assert private(Path(staged))
        Path(final_path).write_text("OTHER_PROCESS_OWNS_THIS")
        return real_link(staged, final_path)

    monkeypatch.setattr("grant.db.os.link", inject_competing_creator)
    with pytest.raises(FileExistsError):
        if operation == "backup":
            env.db.backup(destination)
        else:
            Database.restore(backup, destination)

    assert destination.read_text() == "OTHER_PROCESS_OWNS_THIS"
    assert_no_temporary_recovery_paths(tmp_path)
    if operation == "restore":
        assert backup.exists() and private(backup)
