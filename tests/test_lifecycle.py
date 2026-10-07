import json
import os
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
