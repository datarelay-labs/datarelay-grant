"""B5: actual operator CLI must fail closed without a raw Python traceback.

Every installation and backup is isolated in pytest's private tmp_path;
these tests never use a live SMTP service, customer state or release archive.
"""

import sqlite3
import stat
import subprocess
import sys

from grant.db import Database


def cli(config, *args):
    return subprocess.run(
        [sys.executable, "-m", "grant.cli", "--config", str(config), *args],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )


def initialized(tmp_path):
    config = tmp_path / "source.json"
    result = cli(config, "init", "--dev")
    assert result.returncode == 0, result.stderr
    assert stat.S_IMODE(config.stat().st_mode) == 0o600
    return config


def assert_clean_refusal(result, code):
    assert result.returncode != 0
    assert result.stdout == ""
    assert f"{code}:" in result.stderr
    assert "Traceback" not in result.stderr
    assert "encryption_key" not in result.stderr


def test_check_missing_database_remains_uncreated_and_reports_bounded_error(tmp_path):
    config = initialized(tmp_path)
    missing = cli(config, "check")
    assert_clean_refusal(missing, "CHECK_REFUSED")
    assert "missing or not a regular file" in missing.stderr
    assert not (tmp_path / "grant.sqlite").exists()


def test_actual_cli_backup_restore_preserves_private_pause_and_refuses_existing(tmp_path):
    config = initialized(tmp_path)
    original = tmp_path / "grant.sqlite"
    Database(original)
    healthy = cli(config, "check")
    assert healthy.returncode == 0, healthy.stderr
    assert "DATABASE=ok" in healthy.stdout
    backup, restored = tmp_path / "backup.sqlite", tmp_path / "restored.sqlite"
    assert cli(config, "backup", "--output", str(backup)).returncode == 0
    assert cli(config, "restore", "--input", str(backup), "--output", str(restored)).returncode == 0
    assert all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in (backup, restored))
    assert Database.inspect_existing(restored) == (14, "1")
    with sqlite3.connect(f"{restored.absolute().as_uri()}?mode=ro", uri=True) as conn:
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    before = restored.read_bytes()
    repeat = cli(config, "restore", "--input", str(backup), "--output", str(restored))
    assert_clean_refusal(repeat, "RESTORE_REFUSED")
    assert "NEW destination" in repeat.stderr
    assert restored.read_bytes() == before
    assert Database.inspect_existing(original) == (14, "0")


def test_corrupt_backup_rejected_without_publishing_any_restore(tmp_path):
    config = initialized(tmp_path)
    invalid = tmp_path / "not-a-sqlite-backup.sqlite"
    invalid.write_bytes(b"definitely not an SQLite database")
    restored = tmp_path / "must-not-exist.sqlite"
    result = cli(config, "restore", "--input", str(invalid), "--output", str(restored))
    assert_clean_refusal(result, "RESTORE_REFUSED")
    assert not restored.exists()


def test_backup_missing_database_fails_without_creating_output(tmp_path):
    config = initialized(tmp_path)
    destination = tmp_path / "must-not-exist.sqlite"
    response = cli(config, "backup", "--output", str(destination))
    assert_clean_refusal(response, "BACKUP_REFUSED")
    assert not destination.exists()
    assert not (tmp_path / "grant.sqlite").exists()
