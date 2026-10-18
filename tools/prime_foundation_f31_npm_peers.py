"""Prime exact public npm metadata for the private Foundation offline smoke.

The clean immutable Foundation source controls dependency specs. This validates
the full bounded runtime closure and makes npm's resolver data available while
the upstream smoke itself continues to install offline with strict peers.
No private artifact, session, credential or dependency override is exported.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

SOURCE_HEAD = "a8b633d9275a484e16b13ea05299f398f792a69b"
NAME_RE = re.compile(r"(?:@[a-z0-9._-]+/)?[a-z0-9._-]+\Z")
VERSION_RE = re.compile(r"[0-9]+(?:\.[0-9]+){2}(?:[-+][a-zA-Z0-9.-]+)?\Z")


def peer_dependency_closure(root: dict, packages: dict) -> list[str]:
    pending = [*root.get("dependencies", {}), "react", "react-dom"]
    seen: set[str] = set()
    result: list[str] = []
    while pending:
        name = pending.pop(0)
        if name in seen:
            continue
        seen.add(name)
        if name.startswith("@datarelay-labs/"):
            raise ValueError("Private Foundation package is not a public npm peer")
        if len(seen) > 32 or not NAME_RE.fullmatch(name):
            raise ValueError("Unsafe or unbounded offline npm dependency closure")
        dep = packages.get("node_modules/" + name)
        if not isinstance(dep, dict) or not isinstance(dep.get("version"), str):
            raise TypeError("Missing exact npm source lock for " + name)
        version = dep["version"]
        if not VERSION_RE.fullmatch(version):
            raise ValueError("Non-exact public npm version " + name)
        result.append(name + "@" + version)
        pending.extend(dep.get("dependencies", {}))
    return sorted(result)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    actual = subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
    ).strip()
    changed = subprocess.check_output(
        ["git", "-C", str(source), "status", "--porcelain"], text=True
    ).strip()
    if actual != SOURCE_HEAD or changed:
        raise ValueError("Npm preflight requires clean, exact pinned Foundation source")
    root = json.loads((source / "packages/control-clone/package.json").read_text())
    lock = json.loads((source / "package-lock.json").read_text())
    peers = peer_dependency_closure(root, lock["packages"])
    for spec in peers:
        expected = spec.rsplit("@", 1)[1]
        for mode in ([], ["--offline"]):
            stdout = subprocess.check_output(
                ["npm", "view", *mode, spec, "version"],
                text=True, timeout=45,
            ).strip()
            if stdout != expected:
                raise ValueError("Public npm resolver version mismatch: " + spec)
    print("FOUNDATION_F31_EXACT_PUBLIC_NPM_PEER_METADATA_PASS count=" + str(len(peers)))


if __name__ == "__main__":
    main()
