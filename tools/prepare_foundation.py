"""Build exact, unpublished Foundation packages; never modify the Foundation repository."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / "web/foundation.lock.json").read_text())


def run(args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=pathlib.Path, help="Optional existing read-only Foundation checkout"
    )
    args = parser.parse_args()
    cache = ROOT / ".foundation"
    source, stage, packs = cache / "source", cache / "stage", cache / "packs"
    cache.mkdir(exist_ok=True)
    if not source.exists():
        run(
            [
                "git",
                "clone",
                "--no-hardlinks",
                "--no-checkout",
                str(args.source) if args.source else LOCK["repository"],
                str(source),
            ]
        )
        run(["git", "checkout", "--detach", LOCK["commit"]], source)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    if head != LOCK["commit"]:
        raise SystemExit(
            "Foundation source differs from the immutable lock; do not reuse this cache"
        )
    if subprocess.check_output(
        ["git", "status", "--porcelain", "--untracked-files=no"], cwd=source
    ):
        raise SystemExit("Foundation source is modified; refusing to build")
    if not stage.exists():
        run(["npm", "ci", "--no-audit", "--no-fund"], source)
        run(
            ["node", "tools/stage-release.mjs", "--version", LOCK["version"], "--out", str(stage)],
            source,
        )
    actual = json.loads((stage / "release-manifest.json").read_text())
    if actual["version"] != LOCK["version"] or actual["packages"] != LOCK["packages"]:
        raise SystemExit("Foundation staging differs from the committed package hashes")
    # Re-hash bytes, rather than trusting the staging manifest alone.
    import hashlib

    for package in LOCK["packages"]:
        directory = stage / package["path"]
        digest = hashlib.sha256()
        for path in sorted(directory.rglob("*")):
            if path.is_symlink():
                raise SystemExit("Unexpected symlink in staged Foundation")
            if path.is_file():
                # Same byte framing as the canonical stage-release treeHash.
                relative = path.relative_to(directory).as_posix()
                digest.update(relative.encode())
                digest.update(b"\0")
                digest.update(path.read_bytes())
                digest.update(b"\0")
        if digest.hexdigest() != package["sha256"]:
            raise SystemExit("Foundation package content mismatch: " + package["name"])
    packs.mkdir(exist_ok=True)
    for package in LOCK["packages"]:
        run(
            ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", str(packs)],
            stage / package["path"],
        )
    print("FOUNDATION_PINNED_STAGE=PASS commit=" + LOCK["commit"])


if __name__ == "__main__":
    main()
