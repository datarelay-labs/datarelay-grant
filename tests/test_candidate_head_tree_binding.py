"""Unpublished G12 candidates bind to immutable HEAD, not a racing Git index."""

import json
import subprocess
import sys

import pytest

from tools import build_candidate


def test_candidate_rejects_transiently_staged_non_head_blob(tmp_path, monkeypatch):
    """A transient index edit must not produce a clean-HEAD source archive."""
    root = tmp_path / "isolated-grant-source"
    (root / "grant").mkdir(parents=True)
    (root / "web/dist").mkdir(parents=True)
    (root / ".gitignore").write_text(".dev/\nweb/dist/\n")
    target = root / "grant/__init__.py"
    original = b'__version__ = "committed"\n'
    target.write_bytes(original)
    (root / "web/foundation.lock.json").write_text(json.dumps({"commit": "a" * 40}))
    (root / "web/dist/index.html").write_text("<html>isolated source</html>")
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", ".gitignore", "grant/__init__.py", "web/foundation.lock.json"],
                   cwd=root, check=True)
    subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                    "commit", "-qm", "source locked"], cwd=root, check=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    archive = root / ".dev/artifacts" / f"datarelay-grant-{head[:12]}.tar.gz"
    monkeypatch.setattr(build_candidate, "ROOT", root)
    original_run = subprocess.run
    original_git = build_candidate.git

    def npm_fixture(command, *args, **kwargs):
        if isinstance(command, list) and command[:1] == ["npm"]:
            assert command == ["npm", "--prefix", "web", "run", "check"]
            return subprocess.CompletedProcess(command, 0)
        return original_run(command, *args, **kwargs)

    monkeypatch.setattr(build_candidate.subprocess, "run", npm_fixture)
    monkeypatch.setattr(sys, "argv", ["build_candidate.py", "--output", str(archive.parent)])
    staged = False

    def racing_git(*args):
        nonlocal staged
        if args == ("ls-tree", "-r", "--full-tree", "HEAD") and not staged:
            target.write_bytes(b'__version__ = "STAGED NOT HEAD"\n')
            original_run(["git", "add", "grant/__init__.py"], cwd=root, check=True)
            staged = True
        return original_git(*args)

    monkeypatch.setattr(build_candidate, "git", racing_git)
    try:
        with pytest.raises(SystemExit, match="Git blob mismatch"):
            build_candidate.main()
    finally:
        target.write_bytes(original)
        original_run(["git", "add", "grant/__init__.py"], cwd=root, check=True)

    assert staged
    assert not archive.exists()
    assert not archive.with_suffix(archive.suffix + ".sha256").exists()
    assert not subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True).strip()
