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
SOURCE_TREE = "c" * 40
FOUNDATION_COMMIT = "b" * 40
TOOL = Path(__file__).resolve().parents[1] / "tools/verify_candidate.py"


def make_archive(
    tmp_path, *, corrupt=False, extra=False, duplicate=False,
    manifest_changes=None, lock_changes=None, omit_lock=False,
    duplicate_manifest_key=False, duplicate_lock_key=False, member_mode=None,
    numeric_overflow=False,
):
    entries = {
        "grant/__init__.py": b'__version__ = "test"\n',
        "web/dist/index.html": b"<html></html>",
    }
    if not omit_lock:
        foundation = {
            "schema_version": 1, "commit": FOUNDATION_COMMIT,
            "source_head": FOUNDATION_COMMIT,
        }
        foundation.update(lock_changes or {})
        raw_lock = json.dumps(foundation)
        if duplicate_lock_key:
            # A first-wins parser sees an unrelated Foundation, last-wins sees the real one.
            raw_lock = '{"commit":"' + "0" * 40 + '",' + raw_lock[1:]
        entries["web/foundation.lock.json"] = raw_lock.encode()
    manifest = {
        "schema_version": 1,
        "source_head": HEAD,
        "source_tree": SOURCE_TREE,
        "foundation_commit": FOUNDATION_COMMIT,
        "publication": "NOT_PUBLISHED",
        "release_readiness": "NOT_ASSERTED",
        "source_state": "clean",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()},
    }
    manifest.update(manifest_changes or {})
    if corrupt:
        entries["grant/__init__.py"] = b"different source"
    if extra:
        entries["unexpected.txt"] = b"not in manifest"
    raw_manifest = json.dumps(manifest)
    if duplicate_manifest_key:
        # Python's default parser silently replaces the first PUBLISHED field.
        raw_manifest = '{"publication":"PUBLISHED",' + raw_manifest[1:]
    if numeric_overflow:
        # Valid JSON exponent but Python float parsing overflows to infinity.
        raw_manifest = '{"reviewed_marker":1e309,' + raw_manifest[1:]
    entries["BUILD-MANIFEST.json"] = raw_manifest.encode()
    archive = tmp_path / "candidate.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for name, data in entries.items():
            item = tarfile.TarInfo("datarelay-grant/" + name)
            item.size = len(data)
            if member_mode is not None and name == "grant/__init__.py":
                item.mode = member_mode
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
    assert evidence["integrity"] == "PASS" and evidence["verified_files"] == 3
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


@pytest.mark.parametrize("field,value", [
    ("publication", "PUBLISHED"),
    ("publication", None),
    ("release_readiness", "ACCEPTED"),
    ("release_readiness", None),
    ("source_tree", "not-a-commit"),
    ("source_tree", None),
    ("foundation_commit", "not-a-commit"),
    ("foundation_commit", "d" * 40),
])
def test_rejects_unreviewed_release_or_source_metadata(tmp_path, field, value):
    archive, digest = make_archive(tmp_path, manifest_changes={field: value})
    result = invoke(archive, digest)
    assert result.returncode != 0, f"accepted forbidden {field}={value!r}"


@pytest.mark.parametrize("field", ["commit", "source_head"])
def test_foundation_lock_must_match_manifest_and_itself(tmp_path, field):
    archive, digest = make_archive(tmp_path, lock_changes={field: "d" * 40})
    assert invoke(archive, digest).returncode != 0


def test_missing_foundation_lock_is_not_a_verified_candidate(tmp_path):
    archive, digest = make_archive(tmp_path, omit_lock=True)
    assert invoke(archive, digest).returncode != 0


@pytest.mark.parametrize("duplicate_field", ["duplicate_manifest_key", "duplicate_lock_key"])
def test_candidate_rejects_ambiguous_duplicate_json_metadata(tmp_path, duplicate_field):
    """Two valid JSON parsers must never disagree about an accepted archive."""
    archive, digest = make_archive(tmp_path, **{duplicate_field: True})
    result = invoke(archive, digest)
    assert result.returncode != 0, "ambiguous duplicate JSON keys must fail closed"


@pytest.mark.parametrize("numeric_alias", [True, 1.0])
def test_candidate_manifest_schema_requires_exact_integer_version(tmp_path, numeric_alias):
    archive, digest = make_archive(
        tmp_path, manifest_changes={"schema_version": numeric_alias}
    )
    result = invoke(archive, digest)
    assert result.returncode != 0, "bool/float must not alias integer schema version"


@pytest.mark.parametrize("unsupported_mode", [0o4755, 0o2755, 0o1777, 0o666])
def test_candidate_refuses_file_modes_builder_never_emits(tmp_path, unsupported_mode):
    archive, digest = make_archive(tmp_path, member_mode=unsupported_mode)
    result = invoke(archive, digest)
    assert result.returncode != 0, "unexpected privileged or world-writable mode accepted"


@pytest.mark.parametrize("metadata", ["manifest", "lock"])
def test_candidate_refuses_nonfinite_json_metadata(tmp_path, metadata):
    changes = {"reviewed_marker": float("nan")}
    extra = ({"manifest_changes": changes} if metadata == "manifest"
             else {"lock_changes": changes})
    archive, digest = make_archive(tmp_path, **extra)
    result = invoke(archive, digest)
    assert result.returncode != 0, "non-RFC JSON metadata must fail closed"


def test_candidate_accepts_normal_builder_executable_file_mode(tmp_path):
    """Actual builder emits 0755 for approved executable source files."""
    archive, digest = make_archive(tmp_path, member_mode=0o755)
    result = invoke(archive, digest)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["release_readiness"] == "NOT_ASSERTED"


def test_candidate_refuses_numeric_json_exponent_that_overflows_float(tmp_path):
    archive, digest = make_archive(tmp_path, numeric_overflow=True)
    result = invoke(archive, digest)
    assert result.returncode != 0, "overflowed non-finite float metadata accepted"
