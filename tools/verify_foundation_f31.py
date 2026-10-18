"""Verify an exact private Foundation F31 consumer pin without publishing artifacts.

The legacy RC50 SDK and Grant-native security Wheel remain bound separately.
Metadata-only mode is safe in public API CI. Full mode validates staged private
artifacts before building Web and never assumes Grant host/session authority.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import tarfile
import tomllib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / "web/foundation-f31.lock.json"
SOURCE_HEAD = "b02ea10e45abc51913b534ce1adef086c6d124b4"
CONTROL_COMMIT = "fc89dadcb01a262ef7881a6bca94dd4989a8b496"
ORIGINAL_BUNDLE_SHA256 = "28edfbd6358810be4ab9468872c5b52185e858e031e00c5d333096069e2fd119"
ORIGINAL_GRANT_WHEEL_SHA256 = "cfff22d3d24efb9bb7d6f5701515ac4616cb82029c62245494ae84bd1df81969"
ALLOWED_PACKAGES = frozenset((
    "@datarelay-labs/control-clone",
    "@datarelay-labs/foundation",
))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def wheel_content_sha(data: bytes) -> str:
    """Hash ZIP member names and uncompressed content, not volatile ZIP timestamps."""
    digest = hashlib.sha256()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = archive.infolist()
        if len(members) > 200 or any(
            item.is_dir() or item.filename.startswith("/")
            or ".." in item.filename.split("/") or "\\" in item.filename
            for item in members
        ):
            raise ValueError("Invalid private native Wheel member path")
        if len({item.filename for item in members}) != len(members):
            raise ValueError("Duplicate private Wheel member")
        for name in sorted(archive.namelist()):
            raw = archive.read(name)
            if len(raw) > 4_000_000:
                raise ValueError("Oversized private Wheel member")
            digest.update(name.encode() + bytes((0,)) + raw + bytes((0,)))
    return digest.hexdigest()


def load_lock() -> dict:
    lock = json.loads(LOCK_PATH.read_text())
    if not (
        lock["schema_version"] == 1
        and lock["kind"] == "PRIVATE_UNPUBLISHED_CONTROL_SOURCE_HANDOFF"
        and lock["source_head"] == SOURCE_HEAD
        and lock["control_source_commit"] == CONTROL_COMMIT
        and lock["outer_handoff_archive_sha256"] == ORIGINAL_BUNDLE_SHA256
        and lock["legacy_rc50_retained_for_domain_compatibility"] is True
        and {p["name"] for p in lock["control_first_npm_archives"]} == ALLOWED_PACKAGES
        and len(lock["control_first_npm_archives"]) == 2
        and lock["security_python_wheel"]["grant_runtime_adopted"] is False
        and lock["security_python_wheel"]["grant_runtime_wheel_sha256"]
            == ORIGINAL_GRANT_WHEEL_SHA256
    ):
        raise ValueError("Immutable private Foundation consumer pin is invalid")
    return lock


def verify_metadata(lock: dict) -> None:
    package = json.loads((ROOT / "web/package.json").read_text())
    npm = json.loads((ROOT / "web/package-lock.json").read_text())
    for artifact in lock["control_first_npm_archives"]:
        path = artifact["path"]
        if not path.startswith(".foundation/packs/") or not path.endswith("-b02ea10.tgz"):
            raise ValueError("Private package path must be exact and ignored")
        alias = artifact.get("alias", artifact["name"])
        expected_ref = "file:../" + path
        if package["dependencies"].get(alias) != expected_ref:
            raise ValueError("Grant Web package does not select pinned Foundation " + alias)
        npm_row = npm["packages"].get("node_modules/" + alias, {})
        if npm_row.get("resolved") != expected_ref or npm_row.get("version") != "0.1.0-dev":
            raise ValueError("Grant npm lock drift: " + alias)
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    current_wheel = ".foundation/packs/datarelay_onprem_security-0.10.0.dev0-py3-none-any.whl"
    if project["tool"]["uv"]["sources"]["datarelay-onprem-security"]["path"] != current_wheel:
        raise ValueError("Existing Grant identity runtime must remain pinned")
    frozen = tomllib.loads((ROOT / "uv.lock").read_text())
    native = [p for p in frozen["package"] if p["name"] == "datarelay-onprem-security"]
    if len(native) != 1 or native[0]["wheels"][0]["hash"] != "sha256:" + ORIGINAL_GRANT_WHEEL_SHA256:
        raise ValueError("Grant native Wheel changed without PF-03 authority")


def verify_artifacts(lock: dict) -> None:
    for artifact in lock["control_first_npm_archives"]:
        target = ROOT / artifact["path"]
        if not target.is_file() or sha(target.read_bytes()) != artifact["sha256"]:
            raise ValueError("Missing/modified private npm bundle " + artifact["name"])
        with tarfile.open(fileobj=io.BytesIO(target.read_bytes()), mode="r:gz") as archive:
            members = archive.getmembers()
            if not members or any(
                not m.isfile() or m.name.startswith("/")
                or ".." in m.name.split("/") or m.issym() or m.islnk()
                for m in members
            ):
                raise ValueError("Unsafe Foundation npm bundle")
            package = json.load(archive.extractfile("package/package.json"))
            if package["name"] != artifact["name"] or package["version"] != "0.1.0-dev":
                raise ValueError("Wrong private bundle identity")
            if artifact["name"] == "@datarelay-labs/control-clone":
                exported = archive.extractfile("package/dist/index.d.ts").read().decode()
                for required in (
                    "ControlAdministrationHubPage",
                    "ControlAuditLogsPage",
                    "ControlOperationsBackupPage",
                    "ControlSecurityProvider",
                    "PlatformLoginPage",
                    "ControlAppShellLayout",
                ):
                    if required not in exported:
                        raise ValueError("Missing qualified Control export " + required)
    wheel = lock["security_python_wheel"]
    target = ROOT / wheel["path"]
    if not target.is_file() or wheel_content_sha(target.read_bytes()) != wheel["content_sha256"]:
        raise ValueError("Private candidate Wheel content mismatch")
    # The installed product continues using the OLD Wheel until native Grant
    # session, RBAC and host callbacks receive independent qualification.
    grant_wheel = ROOT / ".foundation/packs/datarelay_onprem_security-0.10.0.dev0-py3-none-any.whl"
    if not grant_wheel.is_file() or sha(grant_wheel.read_bytes()) != ORIGINAL_GRANT_WHEEL_SHA256:
        raise ValueError("Unapproved Grant runtime Wheel replacement")
    reference = ROOT / lock["control_web_reference_root"]
    for artifact in lock["control_web_reference"]:
        filename = artifact["file"]
        if filename.startswith("/") or ".." in filename.split("/"):
            raise ValueError("Unsafe compiled reference path")
        path = reference / filename
        if not path.is_file() or sha(path.read_bytes()) != artifact["sha256"]:
            raise ValueError("Private Control compiled reference mismatch: " + filename)


def verify(*, metadata_only: bool = False) -> None:
    lock = load_lock()
    verify_metadata(lock)
    if metadata_only:
        print("FOUNDATION_PF106_METADATA_AND_GRANT_LEGACY_RUNTIME=PASS (private artifacts NOT CHECKED)")
    else:
        verify_artifacts(lock)
        print("FOUNDATION_PF106_PRIVATE_ARTIFACTS_AND_GRANT_RUNTIME_BOUNDARY=PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args()
    verify(metadata_only=args.metadata_only)
