#!/usr/bin/env python3
"""Run the *existing* Grant Playwright acceptance suite in independent localhost fixtures.

The shipped login rate limit intentionally permits only 15 attempts per
username in five minutes. One long browser process can hit that protection
even with valid test users. Each shard starts a fresh disposable SQLite
installation, authenticates normally, and retains private evidence; no rate
limit, security policy, accounts, or production server is modified.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / ".e2e" / "browser-shards"
# The MFA lifecycle scenario intentionally enrolls the disposable
# administrator, so it must never affect subsequent unrelated browser tests.
MFA_LIFECYCLE_TEST = "F31 Control login completes Grant-native MFA TOTP and recovery without approval-email PIN reuse"


def available_loopback_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def results_for(path: Path) -> tuple[int, int, int, int]:
    """Count first execution result per test and retained failures."""
    if not path.is_file():
        return 0, 0, 0, 0
    report = json.loads(path.read_text())
    statuses: list[str] = []

    def visit(group: dict) -> None:
        for spec in group.get("specs", []):
            for case in spec.get("tests", []):
                results = case.get("results", [])
                statuses.append(results[-1].get("status", "unknown") if results else "not_run")
        for child in group.get("suites", []):
            visit(child)

    visit(report)
    return (sum(x == "passed" for x in statuses),
            sum(x == "skipped" for x in statuses),
            sum(x not in ("passed", "skipped", "not_run") for x in statuses),
            sum(x == "not_run" for x in statuses))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shards", type=int, default=6)
    args = parser.parse_args(argv)
    if not 2 <= args.shards <= 16:
        parser.error("--shards must be 2..16")
    os.umask(0o077)
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + str(os.getpid())
    output = PRIVATE / run_id
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    totals = [0, 0, 0, 0]
    exit_codes: list[int] = []
    for index in range(1, args.shards + 1):
        shard = output / f"part-{index}"
        shard.mkdir(mode=0o700)
        port = available_loopback_port()
        env = os.environ.copy()
        env.update({
            "GRANT_E2E_PORT": str(port),
            "GRANT_E2E_OUTPUT_DIR": str(shard),
            "GRANT_E2E_FIXTURE_PATH": str(shard / "fixture.json"),
            "GRANT_BROWSER_DISCOVERY": "0",
        })
        print(f"SHARD={index}/{args.shards} PORT=loopback:{port} HEAD_SOURCE=unchanged",
              flush=True)
        result = subprocess.run([
            "npm", "--prefix", "web", "run", "test:browser", "--",
            "--fully-parallel", f"--shard={index}/{args.shards}",
            f"--grep-invert={MFA_LIFECYCLE_TEST}",
        ], cwd=ROOT, env=env, check=False)
        exit_codes.append(result.returncode)
        counts = results_for(shard / "browser-results.json")
        for j, count in enumerate(counts):
            totals[j] += count
        print(f"SHARD_RESULT={index}/{args.shards} passed={counts[0]} skipped={counts[1]} failed={counts[2]} not_run={counts[3]} rc={result.returncode}", flush=True)
    # Keep genuine MFA enrollment from affecting later administration flows.
    # No bypass, database edits or relaxed auth policy: a completely new
    # private SQLite instance and normal UI login run this case on its own.
    isolated = output / "mfa-isolated"
    isolated.mkdir(mode=0o700)
    port = available_loopback_port()
    env = os.environ.copy()
    env.update({
        "GRANT_E2E_PORT": str(port),
        "GRANT_E2E_OUTPUT_DIR": str(isolated),
        "GRANT_E2E_FIXTURE_PATH": str(isolated / "fixture.json"),
        "GRANT_BROWSER_DISCOVERY": "0",
    })
    print(f"SHARD=MFA_ISOLATED PORT=loopback:{port} HEAD_SOURCE=unchanged", flush=True)
    separate = subprocess.run([
        "npm", "--prefix", "web", "run", "test:browser", "--",
        f"--grep={MFA_LIFECYCLE_TEST}",
    ], cwd=ROOT, env=env, check=False)
    exit_codes.append(separate.returncode)
    mfa_counts = results_for(isolated / "browser-results.json")
    for j, count in enumerate(mfa_counts):
        totals[j] += count
    # The isolation purpose is defeated if selection ever matches a different
    # number of test cases; fail closed rather than claiming 100% completion.
    if mfa_counts != (1, 0, 0, 0):
        exit_codes.append(1)
    print(f"SHARD_RESULT=MFA_ISOLATED passed={mfa_counts[0]} skipped={mfa_counts[1]} failed={mfa_counts[2]} not_run={mfa_counts[3]} rc={separate.returncode}", flush=True)
    print(f"GRANT_BROWSER_SHARDS passed={totals[0]} skipped={totals[1]} failed={totals[2]} "
          f"not_run={totals[3]} shards={args.shards} evidence={output}", flush=True)
    return 0 if not any(exit_codes) and totals[2] == totals[3] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
