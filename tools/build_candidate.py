"""Create a local, exact-HEAD source+web candidate. Never publish or deploy it."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _same_clean_head(head: str, tree: str) -> bool:
    """Never label a candidate clean if its source changed after the Web build."""
    return (
        git("rev-parse", "HEAD") == head
        and git("rev-parse", "HEAD^{tree}") == tree
        and not git("status", "--porcelain", "--untracked-files=normal")
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".dev/artifacts")
    args = parser.parse_args()
    if git("status", "--porcelain", "--untracked-files=normal"):
        raise SystemExit("Commit reviewed source before producing an exact-HEAD candidate")
    head, tree = git("rev-parse", "HEAD"), git("rev-parse", "HEAD^{tree}")
    timestamp = int(git("show", "-s", "--format=%ct", "HEAD"))
    subprocess.run(["npm", "--prefix", "web", "run", "check"], cwd=ROOT, check=True)
    if git("rev-parse", "HEAD") != head or git("status", "--porcelain"):
        raise SystemExit("Source changed while building the candidate")
    # Bind every tracked byte to the immutable Git index as well as HEAD.
    # A racing edit can otherwise be archived after the earlier clean check.
    tracked = {}
    for line in git("ls-files", "--stage").splitlines():
        try:
            metadata, name = line.split("\t", 1)
            mode, blob, stage = metadata.split()
        except ValueError:
            raise SystemExit("Unsupported candidate Git index entry") from None
        if stage != "0" or mode not in ("100644", "100755") or name in tracked:
            raise SystemExit("Unsupported candidate Git index entry")
        tracked[name] = (mode, blob)
    paths = [Path(name) for name in tracked]
    paths += sorted(p.relative_to(ROOT) for p in (ROOT / "web/dist").rglob("*") if p.is_file())
    entries = {}
    modes = {}
    for relative in paths:
        path = ROOT / relative
        name = relative.as_posix()
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise SystemExit("Candidate contains an unsupported source entry")
        data = path.read_bytes()
        if name in tracked:
            mode, expected_blob = tracked[name]
            git_blob = b"blob " + str(len(data)).encode("ascii") + b"\0" + data
            if len(expected_blob) != 40 or hashlib.sha1(git_blob).hexdigest() != expected_blob:
                raise SystemExit("Source changed during candidate packaging (Git blob mismatch)")
            modes[name] = 0o755 if mode == "100755" else 0o644
        else:
            modes[name] = 0o755 if path.stat().st_mode & 0o111 else 0o644
        entries[name] = data
    if not _same_clean_head(head, tree):
        raise SystemExit("Source changed during candidate packaging")
    foundation = json.loads((ROOT / "web/foundation.lock.json").read_text())
    manifest = {
        "schema_version": 1,
        "source_head": head,
        "source_tree": tree,
        "foundation_commit": foundation["commit"],
        "source_state": "clean",
        "publication": "NOT_PUBLISHED",
        "release_readiness": "NOT_ASSERTED",
        "files": {name: sha256(data) for name, data in sorted(entries.items())},
    }
    entries["BUILD-MANIFEST.json"] = (
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    ).encode()
    args.output.mkdir(parents=True, exist_ok=True)
    archive = args.output / ("datarelay-grant-" + head[:12] + ".tar.gz")
    with (
        archive.open("xb") as raw,
        gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=timestamp) as compressed,
        tarfile.open(fileobj=compressed, mode="w") as bundle,
    ):
        for name, data in sorted(entries.items()):
            info = tarfile.TarInfo("datarelay-grant/" + name)
            info.size = len(data)
            info.mtime = timestamp
            info.mode = modes.get(name, 0o644)
            bundle.addfile(info, io.BytesIO(data))
    if not _same_clean_head(head, tree):
        archive.unlink()
        raise SystemExit("Source changed during candidate packaging")
    digest = sha256(archive.read_bytes())
    archive.with_suffix(archive.suffix + ".sha256").write_text(digest + "  " + archive.name + "\n")
    print(json.dumps({"archive": str(archive), "sha256": digest, "head": head}))


if __name__ == "__main__":
    main()
