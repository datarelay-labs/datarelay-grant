"""Fail-closed ingress guard against Grant outcome -> Stellar -> Grant loops.

Accepting an event from the external SIEM never turns a Grant outcome into a
fresh source event. No network calls, side effects, ID lookups or role changes.
"""

from __future__ import annotations

_GRANT_ORIGINS = frozenset({"grant", "datarelay-grant", "datarelay_grant"})
_GRANT_MARKERS = frozenset({
    "grant_event_id", "grant_request_id", "x_grant_event_id",
    "x_grant_signature", "grant_outcome_id",
})


def is_grant_feedback(source: dict) -> bool:
    """Detect known first-party and wrapped outcome markers across aliases.

    Unexpectedly deep/large trees fail closed rather than becoming a way to
    smuggle an outcome through a nested external event envelope.
    """
    if not isinstance(source, dict):
        return True
    pending: list[tuple[object, int]] = [(source, 0)]
    visited = 0
    while pending:
        obj, depth = pending.pop()
        visited += 1
        if depth > 8 or visited > 1024:
            return True
        if isinstance(obj, list):
            pending.extend((item, depth + 1) for item in obj if isinstance(item, (dict, list)))
        elif isinstance(obj, dict):
            for raw_key, value in obj.items():
                if not isinstance(raw_key, str):
                    return True
                key = raw_key.strip().casefold().replace("-", "_")
                if key in _GRANT_MARKERS:
                    return True
                if isinstance(value, str):
                    normalized = value.strip().casefold()
                    if key in ("event_type", "eventtype") and normalized.startswith("grant."):
                        return True
                    if key in ("origin_product", "source_product", "source_system") and normalized in _GRANT_ORIGINS:
                        return True
                if isinstance(value, (dict, list)):
                    pending.append((value, depth + 1))
    return False
