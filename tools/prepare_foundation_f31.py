"""Prepare pinned private F31 bytes in ignored Grant-local paths, never in Git.

Use --archive for an approved exact handoff, or --source for a pinned clean
Foundation checkout (CI private Contents:read). The package tarballs are
byte-reproducible. The Wheel may differ only in ZIP timestamps; compare every
canonical uncompressed member to the immutable source handoff digest.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tarfile
from pathlib import Path

from verify_foundation_f31 import (
    CONTROL_COMMIT,
    ORIGINAL_BUNDLE_SHA256,
    ROOT,
    SOURCE_HEAD,
    load_lock,
    sha,
    wheel_content_sha,
)


def prepare_artifacts(bundle: Path, *, repacked_from_exact_source: bool = False) -> None:
    lock = load_lock()
    archive_digest = sha(bundle.read_bytes())
    if not repacked_from_exact_source and archive_digest != ORIGINAL_BUNDLE_SHA256:
        raise ValueError("Private handoff outer SHA256 mismatch")
    expected_files = {
        a["path"].split("/")[-1].replace("-b02ea10.tgz", ".tgz"): a
        for a in lock["control_first_npm_archives"]
    }
    wheel = lock["security_python_wheel"]
    wheel_name = wheel["path"].split("/")[-1]
    expected_files[wheel_name] = wheel

    with tarfile.open(bundle, "r:gz") as archive:
        members = archive.getmembers()
        if len(members) > 50 or any(
            not entry.isfile() or entry.name.startswith("/")
            or ".." in entry.name.split("/") or "\\" in entry.name
            or entry.size > 5_000_000 or entry.issym() or entry.islnk()
            for entry in members
        ) or len({m.name for m in members}) != len(members):
            raise ValueError("Unsafe/private archive structure")
        manifest = json.load(archive.extractfile("handoff-manifest.json"))
        if not (
            manifest["kind"] == "PRIVATE_UNPUBLISHED_CONTROL_SOURCE_HANDOFF"
            and manifest["source_head"] == SOURCE_HEAD
            and manifest["control_source_commit"] == CONTROL_COMMIT
            and manifest["published"] is False
            and manifest["merged"] is False
            and manifest["consumer_native_effects_verified"] is False
        ):
            raise ValueError("Unapproved private source or product authorization")
        advertised = {x["file"]: x for x in manifest["packages"]}
        if advertised.keys() != expected_files.keys():
            raise ValueError("Unexpected package inventory in private handoff")
        for name, artifact in expected_files.items():
            raw = archive.extractfile(name).read()
            if len(raw) != advertised[name]["bytes"] or sha(raw) != advertised[name]["sha256"]:
                raise ValueError("Private manifest/package bytes conflict " + name)
            if name == wheel_name:
                if wheel_content_sha(raw) != wheel["content_sha256"]:
                    raise ValueError("Untrusted private Wheel member content")
                if archive_digest == ORIGINAL_BUNDLE_SHA256 and sha(raw) != wheel["sha256"]:
                    raise ValueError("Original private Wheel archive SHA mismatch")
            elif sha(raw) != artifact["sha256"]:
                raise ValueError("Unpinned npm package " + name)
            install_exact_bytes(ROOT / artifact["path"], raw, wheel=bool(name == wheel_name),
                                expected_content=wheel.get("content_sha256"))

        source_files = {x["file"]: x for x in manifest["compiled_control_web_files"]}
        if source_files != {x["file"]: x for x in lock["control_web_reference"]}:
            raise ValueError("Compiled Control reference inventory mismatch")
        for filename, info in source_files.items():
            if filename.startswith("/") or ".." in filename.split("/"):
                raise ValueError("Unsafe Control reference path")
            raw = archive.extractfile(filename).read()
            if sha(raw) != info["sha256"]:
                raise ValueError("Compiled reference SHA mismatch")
            install_exact_bytes(ROOT / lock["control_web_reference_root"] / filename, raw)

    print("FOUNDATION_PF106_PRIVATE_SOURCE_MATERIALIZED=PASS source=" + SOURCE_HEAD)
    print("FOUNDATION_PF106_WHEEL_CONTENT_CANONICAL=PASS (Grant runtime unchanged)")


def install_exact_bytes(target: Path, raw: bytes, *, wheel: bool = False,
                        expected_content: str | None = None) -> None:
    if not target.resolve().is_relative_to((ROOT / ".foundation").resolve()):
        raise ValueError("Private materialization escaped ignored Foundation cache")
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if target.is_symlink():
        raise ValueError("Refusing to follow private artifact symlink")
    if target.exists():
        current = target.read_bytes()
        match = (
            wheel_content_sha(current) == wheel_content_sha(raw) == expected_content
            if wheel else current == raw
        )
        if not match:
            raise ValueError("Refusing to overwrite unexpected existing private artifact " + target.name)
        return
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def source_bundle(source: Path) -> Path:
    source = source.resolve(strict=True)
    git = lambda *args: subprocess.check_output(["git", "-C", str(source), *args], text=True).strip()
    if git("rev-parse", "HEAD") != SOURCE_HEAD or git("status", "--porcelain"):
        raise ValueError("Foundation checkout must be clean exact approved HEAD")
    stager = source / "tools/stage-control-first-private.py"
    if not stager.is_file():
        raise ValueError("Missing pinned private source stager")
    work = ROOT / ".dev/grant-f31-private-stage"
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    dest = work / ("grant-f31-" + SOURCE_HEAD[:12] + ".tar.gz")
    if not dest.exists():
        subprocess.run(
            ["python3", str(stager), "--out", str(dest)],
            cwd=source, check=True,
        )
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--archive", type=Path)
    group.add_argument("--source", type=Path)
    args = parser.parse_args()
    bundle = source_bundle(args.source) if args.source else args.archive.resolve(strict=True)
    prepare_artifacts(bundle, repacked_from_exact_source=bool(args.source))


if __name__ == "__main__":
    main()
