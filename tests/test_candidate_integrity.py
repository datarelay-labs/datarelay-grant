"""Portable candidate integrity check; no deployment or archive extraction."""

import hashlib
import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

HEAD = "a" * 40
TOOL = Path(__file__).resolve().parents[1] / "tools/verify_candidate.py"


def make_archive(tmp_path, *, corrupt=False, extra=False, duplicate=False):
    entries = {
        "grant/__init__.py": b'__version__ = "test"\n',
        "web/dist/index.html": b"<html></html>",
    }
    manifest = {
        "schema_version": 1,
        "source_head": HEAD,
        "source_state": "clean",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()},
    }
    if corrupt:
        entries["grant/__init__.py"] = b"different source"
    if extra:
        entries["unexpected.txt"] = b"not in manifest"
    entries["BUILD-MANIFEST.json"] = json.dumps(manifest).encode()
    archive = tmp_path / "candidate.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for name, data in entries.items():
            item = tarfile.TarInfo("datarelay-grant/" + name)
            item.size = len(data)
            bundle.addfile(item, io.BytesIO(data))
            if duplicate and name == "grant/__init__.py":
                bundle.addfile(item, io.BytesIO(data))
    return archive, hashlib.sha256(archive.read_bytes()).hexdigest()


def invoke(archive, digest, head=HEAD):
    return subprocess.run(
        [sys.executable, str(TOOL), str(archive), "--head", head, "--sha256", digest],
        capture_output=True,
        text=True,
        check=False,
    )


def test_verifies_every_file_without_extracting(tmp_path):
    archive, digest = make_archive(tmp_path)
    result = invoke(archive, digest)
    assert result.returncode == 0, result.stderr
    evidence = json.loads(result.stdout)
    assert evidence["integrity"] == "PASS" and evidence["verified_files"] == 2
    assert evidence["release_readiness"] == "NOT_ASSERTED"
    assert list(tmp_path.iterdir()) == [archive]


@pytest.mark.parametrize("option", ["corrupt", "extra", "duplicate"])
def test_mismatched_or_ambiguous_entries_rejected(tmp_path, option):
    archive, digest = make_archive(tmp_path, **{option: True})
    assert invoke(archive, digest).returncode != 0


def test_independently_supplied_archive_digest_must_match(tmp_path):
    archive, _ = make_archive(tmp_path)
    assert invoke(archive, "0" * 64).returncode != 0


def test_independently_supplied_source_head_must_match(tmp_path):
    archive, digest = make_archive(tmp_path)
    assert invoke(archive, digest, "b" * 40).returncode != 0


def test_truncated_archive_rejected(tmp_path):
    archive = tmp_path / "bad.tar.gz"
    archive.write_bytes(b"not a tar archive")
    assert invoke(archive, hashlib.sha256(archive.read_bytes()).hexdigest()).returncode != 0
