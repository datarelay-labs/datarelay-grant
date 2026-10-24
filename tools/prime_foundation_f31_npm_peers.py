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
import tempfile
from pathlib import Path

SOURCE_HEAD = "acbdc50b34d2e2e819823ed1a9c7016572ab901f"
NAME_RE = re.compile(r"(?:@[a-z0-9._-]+/)?[a-z0-9._-]+\Z")
VERSION_RE = re.compile(r"[0-9]+(?:\.[0-9]+){2}(?:[-+][a-zA-Z0-9.-]+)?\Z")
# Pinned Foundation uses exact packages and narrowly ranged public transitive
# dependencies. Reject tags/URLs/wildcards/unsupported specs before npm sees them.
PUBLIC_RANGE_RE = re.compile(r"(?:[~^])?[0-9]+(?:\.[0-9]+){2}(?:[-+][a-zA-Z0-9.-]+)?\Z")


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


def public_tarball_requests(root: dict, packages: dict) -> list[str]:
    """Cover both exact pinned bytes and versions a clean offline npm resolver
    can choose from the pinned source's transitive semver ranges.

    An npm view command only primes metadata, not the actual package tarball.
    The private handoff smoke performs a new offline npm install without a
    lockfile, so ^2.6.0 can resolve to 2.7.3 even if the clean source lock
    contains 2.7.2. No private packages or arbitrary registries are admitted.
    """
    exact = peer_dependency_closure(root, packages)
    pinned_names = {spec.rsplit("@", 1)[0] for spec in exact}
    requests = set(exact)
    for package in [root, *(packages["node_modules/" + n] for n in pinned_names)]:
        dependencies = package.get("dependencies", {})
        if not isinstance(dependencies, dict):
            raise TypeError("Invalid pinned public npm dependencies")
        for name, version_range in dependencies.items():
            if name not in pinned_names or not isinstance(version_range, str) or (
                not PUBLIC_RANGE_RE.fullmatch(version_range)
            ):
                raise ValueError("Unsafe public npm dependency request")
            requests.add(name + "@" + version_range)
    if len(requests) > 64:
        raise ValueError("Unbounded public npm tarball preflight")
    return sorted(requests)


def prime_public_tarballs(requests: list[str], work_root: Path) -> None:
    """Cache public tarball CONTENT while online, then pack every candidate
    offline before the unchanged private stager executes its real offline smoke.

    The staged public .tgz files are temporary. npm's content-addressed cache
    retains integrity-checked package data for the next offline npm install.
    """
    if len(requests) > 64:
        raise ValueError("Unbounded public npm tarball preflight")
    with tempfile.TemporaryDirectory(prefix="f31-public-npm-", dir=work_root) as folder:
        destination = Path(folder)
        for spec in requests:
            name, sep, version = spec.rpartition("@")
            if not sep or not NAME_RE.fullmatch(name) or not PUBLIC_RANGE_RE.fullmatch(version):
                raise ValueError("Unsafe public npm tarball request")
            subprocess.check_output(
                ["npm", "cache", "add", "--prefer-online", "--ignore-scripts", spec],
                text=True, timeout=90,
            )
            packed = subprocess.check_output(
                ["npm", "pack", "--offline", "--ignore-scripts", "--silent",
                 "--pack-destination", str(destination), spec],
                text=True, timeout=90,
            ).strip().splitlines()
            if len(packed) != 1:
                raise ValueError("Public npm offline pack returned no single archive")
            filename = packed[0].strip()
            artifact = destination / filename
            if (not filename.endswith(".tgz") or Path(filename).name != filename
                or artifact.is_symlink() or not artifact.is_file()
                or artifact.stat().st_size == 0
                or not artifact.resolve().is_relative_to(destination.resolve())):
                raise ValueError("Public npm tarball not available offline")
    print("FOUNDATION_F31_PUBLIC_NPM_TARBALL_OFFLINE_PASS count=" + str(len(requests)))


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
    requests = public_tarball_requests(root, lock["packages"])
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
    # Never loosen or patch the immutable private Foundation stager. Verify the
    # actual public packages it may select from a new dependency resolution.
    prime_public_tarballs(requests, source.parent)


if __name__ == "__main__":
    main()
