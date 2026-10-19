"""Exact private F31 Control-first candidate custody for the Grant consumer.

The current package is not a published/stable replacement for legacy RC50.
No source checkout, remote artifact or host security effect is invoked here.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_private_control_first_handoff_pinned_to_exact_foundation_head():
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools/verify_foundation_f31.py"), "--metadata-only"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    assert "FOUNDATION_PF106_METADATA_AND_GRANT_LEGACY_RUNTIME=PASS" in result.stdout
    assert "private artifacts NOT CHECKED" in result.stdout


def test_legacy_grant_ui_not_swapped_for_incompatible_empty_wrapper():
    original = json.loads((ROOT / "web/foundation.lock.json").read_text())
    native = json.loads((ROOT / "web/foundation-f31.lock.json").read_text())
    assert original["source_head"] == "746e0a78f8dba782c00eba675099f24f647f1f09"
    assert native["source_head"] == "acbdc50b34d2e2e819823ed1a9c7016572ab901f"
    assert native["security_python_wheel"]["grant_runtime_adopted"] is False
    assert native["legacy_rc50_retained_for_domain_compatibility"] is True
    web = json.loads((ROOT / "web/package.json").read_text())
    deps = web["dependencies"]
    assert "@datarelay-labs/foundation" in deps
    assert "@datarelay-labs/foundation-f31" in deps
    assert "@datarelay-labs/control-clone" in deps
    assert "PlatformLoginPage" in (ROOT / "web/src/foundation_f31_login.tsx").read_text()
    assert "datarelay_onprem_security" not in (ROOT / "grant/app.py").read_text(), (
        "Do not silently claim installed common session ownership through an undeclared adapter."
    )


def test_ci_pins_wheel_build_backend_for_immutable_private_f31_content():
    # The exact approved Wheel has Generator: setuptools (84.0.0). Later
    # versions alter WHEEL/RECORD metadata despite 53 identical source members.
    # Retain the complete immutable member-content check, do not weaken hashes.
    constraints = ROOT / "tools/foundation-f31-build-constraints.txt"
    assert constraints.read_text().strip().splitlines() == ["setuptools==84.0.0"]
    ci = (ROOT / ".github/workflows/grant-checks.yml").read_text()
    assert (
        'UV_BUILD_CONSTRAINT="$GITHUB_WORKSPACE/tools/foundation-f31-build-constraints.txt" '
        'python3 tools/prepare_foundation_f31.py --source'
    ) in ci
    pinned = json.loads((ROOT / "web/foundation-f31.lock.json").read_text())
    assert pinned["security_python_wheel"]["content_sha256"] == (
        "c56a6e0adf476b2bc2799bd088a7e2edf4c1990ba1893fe27fa853c109f68e3f"
    )
