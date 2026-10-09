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
