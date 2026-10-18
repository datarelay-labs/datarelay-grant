"""B5: actual operator CLI must fail closed without a raw Python traceback.

Every installation and backup is isolated in pytest's private tmp_path;
these tests never use a live SMTP service, customer state or release archive.
"""

import json
import sqlite3
import stat
import subprocess
import sys

from grant.db import CURRENT_SCHEMA_VERSION, Database


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


def test_init_existing_config_refuses_without_traceback_or_private_path(tmp_path):
    config = initialized(tmp_path)
    repeat = cli(config, "init", "--dev")
    assert_clean_refusal(repeat, "INIT_REFUSED")
    assert "already exists" in repeat.stderr
    assert str(config) not in repeat.stderr


def test_check_missing_config_reports_bounded_error(tmp_path):
    config = tmp_path / "missing.json"
    missing = cli(config, "check")
    assert_clean_refusal(missing, "CHECK_REFUSED")
    assert "configuration is missing" in missing.stderr
    assert "--config" in missing.stderr
    assert ".dev/config.json" in missing.stderr
    assert str(config) not in missing.stderr


def test_cli_help_explains_command_purpose_and_recovery_risk():
    root = subprocess.run(
        [sys.executable, "-m", "grant.cli", "--help"],
        capture_output=True, text=True, check=False, timeout=30,
    )
    assert root.returncode == 0
    for phrase in (
        "Create a new protected installation configuration",
        "Create a local user account",
        "Serve Grant on the configured loopback port",
        "Inspect existing installation health without mutation",
        "Create a private SQLite backup at a new path",
        "Restore a backup into a new paused database",
        "Resume a restored installation",
    ):
        assert phrase in root.stdout

    resume = subprocess.run(
        [sys.executable, "-m", "grant.cli", "recovery-resume", "--help"],
        capture_output=True, text=True, check=False, timeout=30,
    )
    assert resume.returncode == 0
    normalized_resume = " ".join(resume.stdout.split())
    for phrase in (
        "cancels restored open requests",
        "unfinished committed executions UNKNOWN",
        "external reconciliation",
    ):
        assert phrase in normalized_resume


def test_check_and_backup_reject_configured_database_symlink(tmp_path):
    config = initialized(tmp_path)
    real_database = tmp_path / "grant.sqlite"
    Database(real_database)
    symlink_database = tmp_path / "database-link.sqlite"
    symlink_database.symlink_to(real_database)

    payload = json.loads(config.read_text())
    payload["database"] = str(symlink_database)
    config.write_text(json.dumps(payload))
    config.chmod(0o600)

    checked = cli(config, "check")
    assert_clean_refusal(checked, "CHECK_REFUSED")
    assert "symlink" in checked.stderr.lower() or "regular file" in checked.stderr.lower()

    destination = tmp_path / "must-not-exist.sqlite"
    backed_up = cli(config, "backup", "--output", str(destination))
    assert_clean_refusal(backed_up, "BACKUP_REFUSED")
    assert not destination.exists()


def test_check_malformed_config_reports_bounded_error(tmp_path):
    config = tmp_path / "malformed.json"
    config.write_text("{bad json\n")
    config.chmod(0o600)
    malformed = cli(config, "check")
    assert_clean_refusal(malformed, "CHECK_REFUSED")
    assert "Invalid or inaccessible installation configuration" in malformed.stderr
    assert str(config) not in malformed.stderr


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
    assert Database.inspect_existing(restored) == (CURRENT_SCHEMA_VERSION, "1")
    with sqlite3.connect(f"{restored.absolute().as_uri()}?mode=ro", uri=True) as conn:
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    before = restored.read_bytes()
    repeat = cli(config, "restore", "--input", str(backup), "--output", str(restored))
    assert_clean_refusal(repeat, "RESTORE_REFUSED")
    assert "NEW destination" in repeat.stderr
    assert restored.read_bytes() == before
    assert Database.inspect_existing(original) == (CURRENT_SCHEMA_VERSION, "0")


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


def test_recovery_resume_without_ack_is_bounded_refusal(tmp_path):
    config = initialized(tmp_path)
    source = tmp_path / "grant.sqlite"
    Database(source)
    backup = tmp_path / "backup.sqlite"
    restored = tmp_path / "restored.sqlite"
    assert cli(config, "backup", "--output", str(backup)).returncode == 0
    assert cli(config, "restore", "--input", str(backup), "--output", str(restored)).returncode == 0

    payload = json.loads(config.read_text())
    payload["database"] = str(restored)
    restored_config = tmp_path / "restored.json"
    restored_config.write_text(json.dumps(payload))
    restored_config.chmod(0o600)

    before_refusal = restored.read_bytes()
    refused = cli(restored_config, "recovery-resume")
    assert_clean_refusal(refused, "RECOVERY_RESUME_REFUSED")
    assert "EXTERNAL_RECONCILIATION_ACK_REQUIRED" in refused.stderr
    # A missing acknowledgement must not initialize or rewrite recovery storage.
    assert restored.read_bytes() == before_refusal
    assert Database.inspect_existing(restored) == (CURRENT_SCHEMA_VERSION, "1")


def test_recovery_resume_without_ack_does_not_initialize_missing_database(tmp_path):
    config = initialized(tmp_path)
    database = tmp_path / "grant.sqlite"
    assert not database.exists()

    refused = cli(config, "recovery-resume")
    assert_clean_refusal(refused, "RECOVERY_RESUME_REFUSED")
    assert "EXTERNAL_RECONCILIATION_ACK_REQUIRED" in refused.stderr
    assert not database.exists()
