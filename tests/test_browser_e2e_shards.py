"""Offline contracts for independent browser fixture sharding (no network/test server)."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from tools import run_browser_e2e_shards as runner


def _report(*statuses: str) -> dict:
    return {"suites": [{"specs": [{"tests": [
        {"results": ([{"status": status}] if status != "not_run" else [])}
        for status in statuses
    ]}]}]}


def test_report_counts_failures_and_unrun_separately(tmp_path: Path) -> None:
    evidence = tmp_path / "results.json"
    evidence.write_text(json.dumps(_report("passed", "skipped", "failed", "not_run")))
    assert runner.results_for(evidence) == (1, 1, 1, 1)
    assert runner.results_for(tmp_path / "no-report.json") == (0, 0, 0, 0)


def test_shards_run_sequentially_with_independent_private_evidence(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(runner, "PRIVATE", tmp_path)
    monkeypatch.setattr(runner, "available_loopback_port", lambda: 18301)
    seen: list[tuple[str, Path]] = []

    def fake_run(command, *, cwd, env, check):
        assert cwd == runner.ROOT and check is False
        assert command[:5] == ["npm", "--prefix", "web", "run", "test:browser"]
        shard_id = command[-2] if "--fully-parallel" in command else "mfa-isolated"
        if shard_id == "mfa-isolated":
            assert command[-1] == f"--grep={runner.MFA_LIFECYCLE_TEST}"
        else:
            assert shard_id in ("--shard=1/2", "--shard=2/2")
            assert command[-1] == f"--grep-invert={runner.MFA_LIFECYCLE_TEST}"
            assert "--fully-parallel" in command
        assert env["GRANT_E2E_PORT"] == "18301"
        assert env["GRANT_BROWSER_DISCOVERY"] == "0"
        result_dir = Path(env["GRANT_E2E_OUTPUT_DIR"])
        assert env["GRANT_E2E_FIXTURE_PATH"] == str(result_dir / "fixture.json")
        assert result_dir.is_dir()
        (result_dir / "browser-results.json").write_text(json.dumps(_report("passed")))
        seen.append((shard_id, result_dir))
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)
    assert runner.main(["--shards", "2"]) == 0
    assert [entry[0] for entry in seen] == ["--shard=1/2", "--shard=2/2", "mfa-isolated"]
    assert len({entry[1] for entry in seen}) == 3


def test_refuses_non_sharded_or_unbounded_profile() -> None:
    with pytest.raises(SystemExit):
        runner.main(["--shards", "1"])
    with pytest.raises(SystemExit):
        runner.main(["--shards", "17"])

def test_missing_isolated_mfa_receipt_fails_closed(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(runner, "PRIVATE", tmp_path)
    monkeypatch.setattr(runner, "available_loopback_port", lambda: 18302)
    calls = []

    def fake_run(command, *, cwd, env, check):
        calls.append(command)
        output = Path(env["GRANT_E2E_OUTPUT_DIR"]) / "browser-results.json"
        if "--fully-parallel" in command:
            output.write_text(json.dumps(_report("passed")))
        # Simulate an apparently successful subprocess with no isolated
        # Playwright result. Missing evidence must NEVER be counted as PASS.
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)
    assert runner.main(["--shards", "2"]) == 1
    assert len(calls) == 3
    assert calls[-1][-1] == f"--grep={runner.MFA_LIFECYCLE_TEST}"
