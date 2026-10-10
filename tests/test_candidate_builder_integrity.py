"""Exercise G12 unpublished candidate building in a disposable Git repository.

Fake only npm compilation; use real Git commits, original Python candidate
builder, actual tar archive creation and native candidate verifier. No shared
Grant worktree or deployed system is modified by these tests.
"""

import hashlib
import json
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

from tools import build_candidate
from tools.verify_candidate import verify


def isolated_repo(tmp_path, monkeypatch):
    root = tmp_path / "isolated-source"
    root.mkdir()
    (root / ".gitignore").write_text(".dev/\nweb/dist/\n")
    (root / "grant").mkdir()
    (root / "grant/__init__.py").write_bytes(b'__version__ = "isolated"\n')
    (root / "web").mkdir()
    (root / "web/foundation.lock.json").write_text(json.dumps({
        "schema_version": 1, "commit": "b" * 40, "source_head": "b" * 40,
    }))
    (root / "web/dist").mkdir()
    (root / "web/dist/index.html").write_text("<html>Test-only UI</html>")
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", ".gitignore", "grant/__init__.py",
                    "web/foundation.lock.json"], cwd=root, check=True)
    subprocess.run(["git", "-c", "user.name=Isolated QA",
                    "-c", "user.email=qa@example.invalid",
                    "commit", "-qm", "test candidate source"],
                   cwd=root, check=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"],
                                   cwd=root, text=True).strip()

    monkeypatch.setattr(build_candidate, "ROOT", root)
    # Do not run npm; dist/index.html is the explicit throwaway compiled fixture.
    # Everything after npm (Git checks, real file reads, archive, hashes) is native.
    original_run = subprocess.run

    def fake_npm(command, *args, **kwargs):
        if isinstance(command, list) and command[:1] == ["npm"]:
            assert command == ["npm", "--prefix", "web", "run", "check"]
            assert kwargs["cwd"] == root and kwargs["check"] is True
            return subprocess.CompletedProcess(command, 0)
        return original_run(command, *args, **kwargs)

    monkeypatch.setattr(build_candidate.subprocess, "run", fake_npm)
    output = root / ".dev" / "artifacts"
    monkeypatch.setattr(sys, "argv", ["build_candidate.py", "--output", str(output)])
    return root, head, output, output / ("datarelay-grant-" + head[:12] + ".tar.gz")


def test_builder_rejects_tracked_source_changed_during_package_read(
    tmp_path, monkeypatch,
):
    root, _head, _output, archive = isolated_repo(tmp_path, monkeypatch)
    target = root / "grant/__init__.py"
    original_read = Path.read_bytes
    changed = False

    def race_read(path):
        nonlocal changed
        if path == target and not changed:
            changed = True
            target.write_bytes(b'__version__ = "UNCOMMITTED RACE"\n')
        return original_read(path)

    monkeypatch.setattr(Path, "read_bytes", race_read)
    with pytest.raises(SystemExit, match="Source changed"):
        build_candidate.main()
    assert changed
    assert not archive.exists()
    assert not archive.with_suffix(archive.suffix + ".sha256").exists()


def test_builder_unchanged_exact_head_creates_verifiable_unpublished_archive(
    tmp_path, monkeypatch, capsys,
):
    root, head, _output, archive = isolated_repo(tmp_path, monkeypatch)
    build_candidate.main()
    recorded = json.loads(capsys.readouterr().out)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert recorded == {
        "archive": str(archive), "sha256": digest, "head": head,
    }
    evidence = verify(archive, head, digest)
    assert evidence["integrity"] == "PASS"
    assert evidence["release_readiness"] == "NOT_ASSERTED"
    with tarfile.open(archive, "r:gz") as tar:
        stream = tar.extractfile("datarelay-grant/BUILD-MANIFEST.json")
        assert stream is not None
        manifest = json.load(stream)
    assert manifest["source_head"] == head
    assert manifest["source_state"] == "clean"
    assert manifest["publication"] == "NOT_PUBLISHED"
    assert not subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=root, text=True,
    ).strip()


def test_builder_rejects_changed_bytes_even_if_worktree_is_restored(
    tmp_path, monkeypatch,
):
    """A transient edit must not be hidden by a final clean Git status."""
    root, _head, _output, archive = isolated_repo(tmp_path, monkeypatch)
    target = root / "grant/__init__.py"
    original_read = Path.read_bytes
    swapped = False

    def transient_read(path):
        nonlocal swapped
        if path == target and not swapped:
            swapped = True
            original = original_read(path)
            path.write_bytes(b'__version__ = "TEMPORARY WRONG CONTENT"\n')
            wrong = original_read(path)
            path.write_bytes(original)
            return wrong
        return original_read(path)

    monkeypatch.setattr(Path, "read_bytes", transient_read)
    with pytest.raises(SystemExit, match="Git blob mismatch"):
        build_candidate.main()
    assert swapped
    assert not archive.exists()
    assert not archive.with_suffix(archive.suffix + ".sha256").exists()
    assert not subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=root, text=True,
    ).strip()


def test_builder_removes_archive_if_source_changes_during_tar_write(
    tmp_path, monkeypatch,
):
    """A post-read change must invalidate the unpublished candidate file."""
    root, _head, _output, archive = isolated_repo(tmp_path, monkeypatch)
    target = root / "grant/__init__.py"
    original_add = tarfile.TarFile.addfile
    modified = False

    def race_addfile(tar, info, fileobj=None):
        nonlocal modified
        if info.name.endswith("/grant/__init__.py") and not modified:
            modified = True
            target.write_bytes(b'__version__ = "LATE DIRTY SOURCE"\n')
        return original_add(tar, info, fileobj)

    monkeypatch.setattr(tarfile.TarFile, "addfile", race_addfile)
    with pytest.raises(SystemExit, match="Source changed"):
        build_candidate.main()
    assert modified
    assert not archive.exists()
    assert not archive.with_suffix(archive.suffix + ".sha256").exists()
