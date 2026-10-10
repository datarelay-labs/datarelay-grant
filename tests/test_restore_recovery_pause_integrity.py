"""Restored Grant installations must never start unpaused after invalid backups.

Disposable SQLite-only tests; no external email, execution, customer files or
real operator recovery acknowledgements.
"""

import sqlite3
from pathlib import Path

import pytest

from grant.db import Database


def test_backup_missing_pause_marker_must_fail_closed_before_publication(tmp_path: Path):
    original = Database(tmp_path / "isolated.sqlite")
    with original.transaction() as conn:
        # A structurally intact but incomplete copy can lack only this row.
        conn.execute("DELETE FROM runtime WHERE key='paused'")

    backup = tmp_path / "incomplete-backup.sqlite"
    result = tmp_path / "must-never-be-installed.sqlite"
    original.backup(backup)
    with sqlite3.connect(backup) as conn:
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 12
        assert conn.execute("SELECT COUNT(*) FROM runtime WHERE key='paused'").fetchone()[0] == 0

    with pytest.raises(ValueError, match="Backup missing recovery pause marker"):
        Database.restore(backup, result)
    assert backup.is_file()
    assert not result.exists()
    assert not list(tmp_path.glob(".grant-private-*.sqlite"))


@pytest.mark.parametrize("previous_pause", ["0", "1"])
def test_intact_backup_recovery_always_paused_without_resume(tmp_path: Path, previous_pause: str):
    original = Database(tmp_path / "original.sqlite")
    with original.transaction() as conn:
        conn.execute("UPDATE runtime SET value=? WHERE key='paused'", (previous_pause,))

    backup = tmp_path / "valid-backup.sqlite"
    result = tmp_path / "valid-restored.sqlite"
    original.backup(backup)
    Database.restore(backup, result)
    with Database(result).transaction(write=False) as conn:
        assert conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    with original.transaction(write=False) as conn:
        assert conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == previous_pause
    assert not list(tmp_path.glob(".grant-private-*.sqlite"))


@pytest.mark.parametrize("reserved_name", ["recovery?target.sqlite", "recovery#target.sqlite"])
def test_restore_binds_exact_backup_source_with_uri_reserved_filename(
    tmp_path: Path, reserved_name: str,
):
    """Never restore a different valid sibling DB when a filename contains URI syntax."""
    current = Database(tmp_path / "actual-current.sqlite")
    stale = Database(tmp_path / "unrelated-stale.sqlite")
    with current.transaction() as conn:
        conn.execute(
            "UPDATE runtime SET value='EXPECTED_CURRENT' WHERE key='notification_brand_name'"
        )
    with stale.transaction() as conn:
        conn.execute(
            "UPDATE runtime SET value='WRONG_STALE' WHERE key='notification_brand_name'"
        )

    selected = tmp_path / reserved_name
    unrelated = tmp_path / "recovery"
    restored = tmp_path / "restored-from-selected.sqlite"
    current.backup(selected)
    stale.backup(unrelated)

    Database.restore(selected, restored)
    with Database(restored).transaction(write=False) as conn:
        actual = conn.execute(
            "SELECT value FROM runtime WHERE key='notification_brand_name'"
        ).fetchone()[0]
        paused = conn.execute(
            "SELECT value FROM runtime WHERE key='paused'"
        ).fetchone()[0]
    assert actual == 'EXPECTED_CURRENT', "Restore must use the EXACT selected input path"
    assert paused == '1'
    with Database(unrelated).transaction(write=False) as conn:
        assert conn.execute(
            "SELECT value FROM runtime WHERE key='notification_brand_name'"
        ).fetchone()[0] == 'WRONG_STALE'
