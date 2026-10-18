"""Public, no-secret acceptance for private a8b633 Grant consumer packaging."""
from __future__ import annotations

import copy
import io
import json
import sys
import tarfile
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from tools import prepare_foundation_f31 as prepare
from tools import prime_foundation_f31_npm_peers as prime
from tools import verify_foundation_f31 as verifier


def test_current_public_lock_pins_new_source_and_preserves_grant_identity() -> None:
    lock = verifier.load_lock()
    verifier.verify_metadata(lock)
    assert lock["source_head"] == "b02ea10e45abc51913b534ce1adef086c6d124b4"
    assert lock["legacy_rc50_retained_for_domain_compatibility"] is True
    assert lock["security_python_wheel"]["grant_runtime_adopted"] is False


def test_tampered_public_source_pin_is_rejected(monkeypatch, tmp_path: Path) -> None:
    candidate = copy.deepcopy(verifier.load_lock())
    candidate["source_head"] = "0" * 40
    bad_lock = tmp_path / "lock.json"
    bad_lock.write_text(json.dumps(candidate))
    monkeypatch.setattr(verifier, "LOCK_PATH", bad_lock)
    with pytest.raises(ValueError, match="consumer pin"):
        verifier.load_lock()


def _wheel(*, timestamp: tuple[int, int, int, int, int, int],
           filename: str = "datarelay_onprem_security/test.py") -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        info = zipfile.ZipInfo(filename=filename, date_time=timestamp)
        archive.writestr(info, b"unchanged-native-source-content")
    return stream.getvalue()


def test_repacked_wheel_timestamps_do_not_change_source_content_hash() -> None:
    a = _wheel(timestamp=(2026, 10, 18, 8, 0, 0))
    b = _wheel(timestamp=(2026, 10, 19, 8, 0, 0))
    assert a != b
    assert verifier.wheel_content_sha(a) == verifier.wheel_content_sha(b)


def test_wheel_content_hash_detects_changed_payload() -> None:
    original = _wheel(timestamp=(2026, 10, 18, 8, 0, 0))
    changed = io.BytesIO()
    with zipfile.ZipFile(changed, "w") as archive:
        archive.writestr("datarelay_onprem_security/test.py", "changed")
    assert verifier.wheel_content_sha(original) != verifier.wheel_content_sha(changed.getvalue())


def test_wheel_member_path_traversal_rejected() -> None:
    with pytest.raises(ValueError, match="member path"):
        verifier.wheel_content_sha(
            _wheel(timestamp=(2026, 10, 18, 8, 0, 0), filename="../bad.py")
        )


def test_archive_member_symlinks_rejected_before_materialization(tmp_path: Path) -> None:
    artifact = tmp_path / "unsafe.tar.gz"
    with tarfile.open(artifact, "w:gz") as archive:
        info = tarfile.TarInfo("escape-link")
        info.type = tarfile.SYMTYPE
        info.linkname = "/etc/shadow"
        archive.addfile(info)
    with pytest.raises(ValueError, match="archive structure"):
        prepare.prepare_artifacts(artifact, repacked_from_exact_source=True)
    assert not (tmp_path / "escape-link").exists()


def test_destination_cannot_escape_ignored_private_foundation_cache(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="escaped ignored Foundation cache"):
        prepare.install_exact_bytes(tmp_path / "leak.tgz", b"no-private-content")
    assert not (tmp_path / "leak.tgz").exists()


def test_f31_public_npm_peer_closure_is_exact_and_transitive() -> None:
    root = {"dependencies": {"clsx": "2.1.1"}}
    packages = {
        "node_modules/clsx": {"version": "2.1.1"},
        "node_modules/react": {"version": "19.3.0"},
        "node_modules/react-dom": {
            "version": "19.3.0", "dependencies": {"scheduler": "0.28.0"},
        },
        "node_modules/scheduler": {"version": "0.28.0"},
    }
    assert prime.peer_dependency_closure(root, packages) == [
        "clsx@2.1.1", "react-dom@19.3.0", "react@19.3.0", "scheduler@0.28.0",
    ]


def test_f31_public_npm_peer_closure_rejects_private_and_missing_lock() -> None:
    with pytest.raises(ValueError, match="not a public npm peer"):
        prime.peer_dependency_closure(
            {"dependencies": {"@datarelay-labs/internal": "0.1.0"}}, {}
        )
    with pytest.raises(TypeError, match="Missing exact npm source lock"):
        prime.peer_dependency_closure({"dependencies": {"clsx": "2.1.1"}}, {})


def test_f31_public_npm_peer_closure_rejects_nonspecific_versions() -> None:
    with pytest.raises(ValueError, match="Non-exact public npm version"):
        prime.peer_dependency_closure(
            {"dependencies": {"clsx": "2.1.1"}},
            {"node_modules/clsx": {"version": "^2.1.1"}},
        )
