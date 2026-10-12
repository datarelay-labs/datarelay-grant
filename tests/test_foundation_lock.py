"""Foundation source bootstrap must follow the exact nested registry lock format."""

import pytest

from tools.prepare_foundation import LOCK, locked_source_repository


def test_local_foundation_bootstrap_reads_committed_nested_registry():
    repository = locked_source_repository(LOCK)
    assert repository == LOCK["registry"]["repository"]
    assert repository.startswith("https://github.com/datarelay-labs/")
    assert LOCK["commit"] == LOCK["source_head"]


@pytest.mark.parametrize(
    "lock",
    ({}, {"repository": "https://untrusted.invalid/source"}, {"registry": {}},
     {"registry": {"repository": ""}}, {"registry": {"repository": 123}}),
)
def test_missing_or_invalid_registry_source_fails_before_clone(lock):
    with pytest.raises(SystemExit, match="Foundation lock is missing registry.repository"):
        locked_source_repository(lock)


def test_foundation_rc41_lock_archive_identity():
    """Grant must pin the verified private RC41 source and all ten npm archive digests."""
    assert LOCK["schema_version"] == 1
    assert LOCK["version"] == "0.1.0-rc.41"
    assert LOCK["source_head"] == "46ddb60cad8eae7b1718588cd19421e61b5300e7"
    assert LOCK["commit"] == LOCK["source_head"]
    assert len(LOCK["packages"]) == 10
    assert len({item["name"] for item in LOCK["packages"]}) == 10
    assert all(len(item["sha256"]) == len(item["archive_sha256"]) == 64 for item in LOCK["packages"])
