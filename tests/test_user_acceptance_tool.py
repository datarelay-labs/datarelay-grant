"""G12 acceptance validator regression: self-asserted evidence is never release authority."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools/user_acceptance_contract.py"


def invoke(*args: str):
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_validator_is_available_in_frozen_grant_toolchain():
    result = invoke("--help")
    assert result.returncode == 0, result.stderr
    assert "quality-close" in result.stdout


@pytest.fixture
def perfect_self_claims(tmp_path):
    """All PASS flags are claims, *not* independently attested user evidence."""
    repo = tmp_path / "isolated-repo"
    repo.mkdir()
    def git(*args: str) -> str:
        return subprocess.check_output(
            ["git", "-C", str(repo), *args], text=True
        ).strip()

    git("init", "-q")
    git("config", "user.name", "Isolated CI Fixture")
    git("config", "user.email", "fixture@example.invalid")
    (repo / "docs").mkdir()
    contracts = {
        "SURFACE_RECONCILIATION": "docs/SURFACE_RECONCILIATION.md",
        "FULL_USER_E2E": "docs/FULL_USER_E2E.md",
    }
    for name, rel in contracts.items():
        (repo / rel).write_text("Isolated "+name+" acceptance contract\n")
    git("add", "docs")
    git("commit", "-qm", "Create isolated acceptance contract fixture")
    head = git("rev-parse", "HEAD")
    files = {}
    for gate, rel in contracts.items():
        digest = hashlib.sha256((repo / rel).read_bytes()).hexdigest()
        data = {
            "schema_version": 1,
            "gate": gate,
            "run_id": "isolated-" + gate.lower(),
            "candidate_head": head,
            "contract_path": rel,
            "contract_sha256": digest,
            "contract_dirty": False,
            "final_status": "PASS",
            "head_unchanged": True,
            "executor": "CHATGPT",
            "final_auditor": "CHATGPT",
            "chatgpt_direct_persona_execution": True,
            "actual_user_surface": True,
            "scripted_user_substitution": False,
            "finding_accumulation_complete": True,
            "evidence_ledger_schema": "PASS",
            "summary_derived_from_ledger": True,
            "report_consistency": "PASS",
            "mandatory_total": 12,
            "mandatory_pass": 12,
            "mandatory_fail": 0,
            "mandatory_partial": 0,
            "mandatory_blocked": 0,
            "unresolved_blocking_findings": 0,
            "capability_coverage_pct": 100.0,
            "public_surface_coverage_pct": 100.0,
            "use_case_coverage_pct": 100.0,
            "real_effect_coverage_pct": 100.0,
            "cleanup_status": "PASS",
        }
        evidence = tmp_path / (gate.lower() + ".json")
        evidence.write_text(json.dumps(data))
        files[gate] = evidence
    return repo, files


def test_structure_may_validate_without_user_provenance(perfect_self_claims):
    repo, files = perfect_self_claims
    result = invoke(
        "validate-gate", "--root", str(repo),
        "--evidence", str(files["FULL_USER_E2E"]),
        "--expected-gate", "FULL_USER_E2E",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "USER_ACCEPTANCE_GATE_STRUCTURAL=PASS" in result.stdout
    assert "USER_GATE_EXECUTION_PASS=NOT_ESTABLISHED" in result.stdout


def test_quality_close_fails_process_when_provenance_is_unverified(perfect_self_claims):
    repo, files = perfect_self_claims
    result = invoke(
        "quality-close", "--root", str(repo),
        "--surface-evidence", str(files["SURFACE_RECONCILIATION"]),
        "--e2e-evidence", str(files["FULL_USER_E2E"]),
    )
    assert result.returncode != 0, (
        "Structural self-claims must never produce a release-success exit.\n"
        + result.stdout + result.stderr
    )
    assert "PRODUCT_QUALITY_CLOSURE_STRUCTURAL=PASS" in result.stdout
    assert "PRODUCT_QUALITY_CLOSURE=BLOCK" in result.stdout
    assert "AUTHORIZES_RELEASE=NO" in result.stdout


def test_incomplete_evidence_cannot_pass_structure(perfect_self_claims):
    repo, files = perfect_self_claims
    p = files["FULL_USER_E2E"]
    data = json.loads(p.read_text())
    data["mandatory_pass"] = 11
    data["mandatory_blocked"] = 1
    p.write_text(json.dumps(data))
    result = invoke("validate-gate", "--root", str(repo), "--evidence", str(p))
    assert result.returncode != 0
    assert "MANDATORY_COVERAGE_INCOMPLETE" in result.stdout
    assert "MANDATORY_BLOCKED_NONZERO" in result.stdout


def test_wrong_git_candidate_is_not_structurally_valid(perfect_self_claims):
    repo, files = perfect_self_claims
    path = files["FULL_USER_E2E"]
    data = json.loads(path.read_text())
    data["candidate_head"] = "a" * 40
    path.write_text(json.dumps(data))
    result = invoke("validate-gate", "--root", str(repo), "--evidence", str(path))
    assert result.returncode == 3
    assert "CANDIDATE_HEAD_NOT_CURRENT" in result.stdout


def test_modified_contract_blocks_even_when_dirty_flag_is_truthful(perfect_self_claims):
    repo, files = perfect_self_claims
    path = files["SURFACE_RECONCILIATION"]
    contract = repo / "docs/SURFACE_RECONCILIATION.md"
    contract.write_text(contract.read_text() + "Uncommitted alteration\n")
    data = json.loads(path.read_text())
    data["contract_dirty"] = True
    path.write_text(json.dumps(data))
    result = invoke("validate-gate", "--root", str(repo), "--evidence", str(path))
    assert result.returncode == 3
    assert "CONTRACT_DIRTY" in result.stdout
