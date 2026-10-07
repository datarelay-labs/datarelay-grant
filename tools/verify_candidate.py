"""Verify a local candidate against independently recorded HEAD and archive hash.

This checks integrity and source binding, not authenticity or release approval.
It neither extracts nor executes the archive.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path, PurePosixPath

MAX_MEMBER_BYTES = 64 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024


def verify(archive: Path, expected_head: str, expected_sha256: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", expected_head):
        raise ValueError("Expected exact source HEAD is required")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise ValueError("Expected archive SHA256 is required")
    if archive.is_symlink() or not archive.is_file():
        raise ValueError("Candidate must be a regular file")
    digest = hashlib.sha256()
    with archive.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
    if digest.hexdigest() != expected_sha256:
        raise ValueError("Archive SHA256 mismatch")
    hashes, total, manifest = {}, 0, None
    with tarfile.open(archive, "r:gz") as bundle:
        for index, member in enumerate(bundle):
            name = PurePosixPath(member.name)
            if (
                index >= 10000
                or not member.isfile()
                or name.is_absolute()
                or len(name.parts) < 2
                or name.parts[0] != "datarelay-grant"
                or any(part in ("..", ".") for part in name.parts)
                or member.name != str(name)
                or "\\" in member.name
                or member.size < 0
                or member.size > MAX_MEMBER_BYTES
            ):
                raise ValueError("Unsupported candidate entry")
            total += member.size
            if total > MAX_TOTAL_BYTES:
                raise ValueError("Candidate exceeds verification limit")
            key = str(PurePosixPath(*name.parts[1:]))
            if key in hashes:
                raise ValueError("Duplicate candidate entry")
            stream = bundle.extractfile(member)
            if stream is None:
                raise ValueError("Unreadable candidate entry")
            data = stream.read(MAX_MEMBER_BYTES + 1)
            if len(data) != member.size:
                raise ValueError("Candidate entry size mismatch")
            hashes[key] = hashlib.sha256(data).hexdigest()
            if key == "BUILD-MANIFEST.json":
                manifest = json.loads(data)
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError("Missing or unsupported build manifest")
    if manifest.get("source_head") != expected_head or manifest.get("source_state") != "clean":
        raise ValueError("Source binding mismatch")
    hashes.pop("BUILD-MANIFEST.json", None)
    if manifest.get("files") != hashes:
        raise ValueError("Candidate file manifest mismatch")
    if "grant/__init__.py" not in hashes or "web/dist/index.html" not in hashes:
        raise ValueError("Candidate is missing product code or compiled UI")
    return {
        "integrity": "PASS",
        "source_head": expected_head,
        "sha256": expected_sha256,
        "verified_files": len(hashes),
        "release_readiness": "NOT_ASSERTED",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--head", required=True)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    try:
        result = verify(args.archive, args.head, args.sha256)
    except (OSError, ValueError, tarfile.TarError) as exc:
        raise SystemExit("Candidate verification failed: " + str(exc)) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
