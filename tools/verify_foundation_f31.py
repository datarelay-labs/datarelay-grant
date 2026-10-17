"""Verify the immutable unpublished Control-original Foundation F31 consumer handoff.

No network, source checkout, installation, credential handling or host mutation.
The legacy RC50 imports are intentionally retained only for Grant product pages
until F31 exposes a configurable consumer shell and same-principal security port.
"""
from __future__ import annotations

import hashlib
import io
import json
import tarfile
import tomllib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / "web/foundation-f31.lock.json"
EXPECTED_SOURCE = "917df932e6a25255bd4b2a4385f79793deb6c614"
EXPECTED_CONTROL = "fc89dadcb01a262ef7881a6bca94dd4989a8b496"
EXPECTED_ARCHIVE = "f74420022190fb536af138259529cb53a50bd78482a74c7779fd0109e5e078ea"


def _hash(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def verify() -> None:
    lock = json.loads(LOCK_PATH.read_text())
    if not (
        lock["schema_version"] == 1
        and lock["source_head"] == EXPECTED_SOURCE
        and lock["control_source_commit"] == EXPECTED_CONTROL
        and lock["outer_handoff_archive_sha256"] == EXPECTED_ARCHIVE
        and lock["kind"] == "PRIVATE_UNPUBLISHED_CONTROL_FIRST_F31_CONSUMER_CANDIDATE"
    ):
        raise ValueError("F31 immutable Foundation source/handoff identity mismatch")
    web_package = json.loads((ROOT / "web/package.json").read_text())
    web_npm_lock = json.loads((ROOT / "web/package-lock.json").read_text())
    for artifact in lock["control_first_npm_archives"]:
        filename = ROOT / artifact["path"]
        if not filename.is_file() or _hash(filename.read_bytes()) != artifact["sha256"]:
            raise ValueError(f"F31 npm archive mismatch: {artifact['name']}")
        alias = artifact.get("alias", artifact["name"])
        if web_package["dependencies"].get(alias) != "file:../" + artifact["path"]:
            raise ValueError(f"Grant F31 npm package is not pinned: {alias}")
        entry = web_npm_lock["packages"].get("node_modules/" + alias)
        if entry is None or entry.get("version") != "0.1.0-dev":
            raise ValueError(f"Grant F31 npm lock is unbound: {alias}")
        with tarfile.open(fileobj=io.BytesIO(filename.read_bytes()), mode="r:gz") as archive:
            declared = json.load(archive.extractfile("package/package.json"))
            if declared["name"] != artifact["name"] or declared["version"] != "0.1.0-dev":
                raise ValueError(f"Wrong F31 native package: {alias}")
            if artifact["name"] == "@datarelay-labs/control-clone":
                exported = archive.extractfile("package/dist/index.d.ts").read().decode()
                for required in (
                    "PlatformLoginPage", "ControlAppShellLayout",
                    "ControlAdminSettingsPage", "ControlSecurityProvider",
                    "ControlMfaPanel", "ControlAclPanel", "ControlRolesPanel",
                    "ControlSessionsPanel", "EmbeddedControlApp",
                ):
                    if required not in exported:
                        raise ValueError(f"F31 native Control export missing: {required}")
    wheel = lock["security_python_wheel"]
    wheel_path = ROOT / wheel["path"]
    if not wheel_path.is_file() or _hash(wheel_path.read_bytes()) != wheel["sha256"]:
        raise ValueError("F31 Python security wheel mismatch")
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    dependency = "datarelay-onprem-security==0.10.0.dev0"
    if dependency not in project["project"]["dependencies"]:
        raise ValueError("F31 shared native MFA wheel missing from Grant runtime")
    if project["tool"]["uv"]["sources"]["datarelay-onprem-security"]["path"] != wheel["path"]:
        raise ValueError("Grant F31 shared native Python source is not pinned")
    python_lock = tomllib.loads((ROOT / "uv.lock").read_text())
    security = [x for x in python_lock["package"] if x["name"] == "datarelay-onprem-security"]
    if len(security) != 1 or security[0]["version"] != "0.10.0.dev0":
        raise ValueError("F31 native wheel version not frozen in uv.lock")
    if security[0]["wheels"][0]["hash"] != "sha256:" + wheel["sha256"]:
        raise ValueError("F31 locked Python wheel SHA mismatch")
    with zipfile.ZipFile(wheel_path) as archive:
        names = set(archive.namelist())
        for required in (
            "datarelay_onprem_security/embedded_runtime.py",
            "datarelay_onprem_security/mfa_service.py",
            "datarelay_onprem_security/management_access_service.py",
            "datarelay_onprem_security/role_management_service.py",
            "datarelay_onprem_security/session_management_service.py",
            "datarelay_onprem_security/user_service.py",
        ):
            if required not in names:
                raise ValueError(f"F31 security service missing: {required}")
    for artifact in lock["control_web_reference"]:
        path = ROOT / ".foundation/control-f31-reference" / artifact["file"]
        if not path.is_file() or _hash(path.read_bytes()) != artifact["sha256"]:
            raise ValueError(f"Exact Control static reference mismatch: {artifact['file']}")
    print("FOUNDATION_F31_SOURCE_AND_ARTIFACT_LOCK=PASS")


if __name__ == "__main__":
    verify()
