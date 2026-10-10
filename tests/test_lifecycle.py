import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from grant.config import Settings
from grant.db import Database


def test_cli_init_and_check_use_protected_external_state(tmp_path):
    config = tmp_path / "state" / "grant.json"
    command = [sys.executable, "-m", "grant.cli", "--config", str(config)]
    first = subprocess.run([*command, "init", "--dev"], capture_output=True, text=True, check=False)
    assert first.returncode == 0, first.stderr
    assert config.stat().st_mode & 0o077 == 0
    assert "web_root" not in json.loads(config.read_text())
    assert Settings.load(config).web_root == Path(__file__).resolve().parents[1] / "web/dist"
    before = config.read_bytes()
    assert (
        subprocess.run([*command, "init", "--dev"], capture_output=True, check=False).returncode
        != 0
    )
    assert config.read_bytes() == before
    # 'init' writes protected configuration only. Real user-add/serve, or an
    # explicit setup, creates first schema; health must never do so implicitly.
    Database(Settings.load(config).database)
    checked = subprocess.run([*command, "check"], capture_output=True, text=True, check=False)
    assert checked.returncode == 0
    assert "DATABASE=ok" in checked.stdout
    assert "SMTP=NOT_CONFIGURED" in checked.stdout
    assert json.loads(config.read_text())["encryption_key"] not in checked.stdout


def test_config_rejects_world_readable_secret_file(tmp_path, env):
    config = tmp_path / "bad-permissions.json"
    config.write_text(
        json.dumps(
            {"database": str(tmp_path / "db"), "encryption_key": env.settings.encryption_key}
        )
    )
    os.chmod(config, 0o644)
    with pytest.raises(ValueError, match="owner-readable"):
        Settings.load(config)


@pytest.mark.parametrize(
    "changes",
    [
        {"public_url": "https://grant.invalid:bad"},
        {"public_url": "https://grant.invalid:0"},
        {"smtp_port": 0},
        {"smtp_port": 65536},
        {"smtp_from": "a@example.invalid\r\nBcc: other@example.invalid"},
        {"smtp_host": "bad\nhost"},
    ],
)
def test_invalid_installation_transport_configuration_is_rejected(env, changes):
    with pytest.raises(ValueError):
        replace(env.settings, **changes)


def test_newer_schema_is_not_silently_downgraded(env):
    with env.db.transaction() as conn:
        conn.execute("PRAGMA user_version=99")
    with pytest.raises(RuntimeError, match="Unsupported database schema"):
        Database(env.settings.database)
    import sqlite3

    with sqlite3.connect(env.settings.database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 99


def test_cli_check_fails_without_creating_missing_database(tmp_path):
    """A health check cannot silently bootstrap an empty unpaused installation."""
    config = tmp_path / "check-only" / "config.json"
    cmd = [sys.executable, "-m", "grant.cli", "--config", str(config)]
    assert subprocess.run([*cmd, "init", "--dev"], capture_output=True, check=False).returncode == 0
    original = Settings.load(config).database
    assert not original.exists()
    result = subprocess.run([*cmd, "check"], capture_output=True, text=True, check=False)
    assert result.returncode != 0, "A missing DB must fail health checks"
    assert not original.exists(), "Health must not create missing original state"
    assert "DATABASE=ok" not in result.stdout


def test_cli_backup_fails_closed_when_original_database_is_missing(tmp_path):
    """Never present a newly fabricated empty v12 database as an existing backup."""
    config = tmp_path / "missing-source" / "config.json"
    cmd = [sys.executable, "-m", "grant.cli", "--config", str(config)]
    assert subprocess.run([*cmd, "init", "--dev"], capture_output=True, check=False).returncode == 0
    original = Settings.load(config).database
    output = tmp_path / "missing-backup.sqlite"
    assert not original.exists()
    result = subprocess.run([*cmd, "backup", "--output", str(output)], capture_output=True, text=True, check=False)
    assert result.returncode != 0, "Missing original must not produce a valid backup"
    assert not original.exists()
    assert not output.exists()
    assert "Backup created" not in result.stdout


def test_cli_preupgrade_backup_preserves_real_old_v8_source_without_migration(tmp_path):
    """Running health/backup before a schema upgrade must not perform the upgrade."""
    config = tmp_path / "legacy" / "config.json"
    cmd = [sys.executable, "-m", "grant.cli", "--config", str(config)]
    assert subprocess.run([*cmd, "init", "--dev"], capture_output=True, check=False).returncode == 0
    db_path = Settings.load(config).database
    fixture = Path(__file__).parent / "fixtures" / "schema_v8_e21a080.sql"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(fixture.read_text(encoding="utf-8"))
        conn.execute("UPDATE runtime SET value='LEGACY_PRESERVED' WHERE key='notification_brand_name'")
        conn.commit()
    before = hashlib.sha256(db_path.read_bytes()).hexdigest()

    check = subprocess.run([*cmd, "check"], capture_output=True, text=True, check=False)
    assert check.returncode != 0, "An old schema requires an explicit upgrade"
    assert hashlib.sha256(db_path.read_bytes()).hexdigest() == before

    output = tmp_path / "v8-preupgrade.sqlite"
    result = subprocess.run([*cmd, "backup", "--output", str(output)], capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    assert output.stat().st_mode & 0o077 == 0
    assert hashlib.sha256(db_path.read_bytes()).hexdigest() == before
    with sqlite3.connect(output) as copied:
        assert copied.execute("PRAGMA user_version").fetchone()[0] == 8
        assert copied.execute(
            "SELECT value FROM runtime WHERE key='notification_brand_name'"
        ).fetchone()[0] == "LEGACY_PRESERVED"


def test_cli_readonly_health_reports_existing_v12_and_paused_rollback(tmp_path):
    """A valid restored installation is observable without resuming any effects."""
    config = tmp_path / "existing" / "config.json"
    cmd = [sys.executable, "-m", "grant.cli", "--config", str(config)]
    assert subprocess.run([*cmd, "init", "--dev"], capture_output=True, check=False).returncode == 0
    db_path = Settings.load(config).database
    db = Database(db_path)
    with db.transaction() as conn:
        conn.execute("UPDATE runtime SET value='1' WHERE key='paused'")
        conn.execute("UPDATE runtime SET value='PAUSED_SNAPSHOT' WHERE key='notification_brand_name'")
    check = subprocess.run([*cmd, "check"], capture_output=True, text=True, check=False)
    assert check.returncode == 0, check.stderr
    assert "DATABASE=ok" in check.stdout
    assert "PAUSED=1" in check.stdout
    output = tmp_path / "paused-verified.sqlite"
    copied = subprocess.run([*cmd, "backup", "--output", str(output)], capture_output=True, text=True, check=False)
    assert copied.returncode == 0, copied.stderr
    with sqlite3.connect(output) as snapshot:
        assert snapshot.execute(
            "SELECT value FROM runtime WHERE key='notification_brand_name'"
        ).fetchone()[0] == "PAUSED_SNAPSHOT"
        assert snapshot.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0] == "1"
