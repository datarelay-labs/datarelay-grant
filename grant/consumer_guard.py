"""Pure, non-executing checks for a product-owned Grant execution boundary.

This module does not call a target product, execute actions, write a ledger,
or grant approval. A consumer must atomically reserve its own durable business
operation and reconcile ambiguous/replayed claims without dispatching twice.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from .core import bounded_json, fingerprint
from .models import Action


class ConsumerGuardError(ValueError):
    """A sanitized, fail-closed integration boundary violation."""


@dataclass(frozen=True, slots=True)
class ProductReservation:
    """An actual consuming product's *persisted* operation reservation.

    Supplying this object is not proof it was durably written: the product must
    verify it against its own storage under its transactional operation lock.
    """

    operation_key: str
    execution_id: str
    state: Literal["RESERVED", "EFFECT_APPLIED", "UNKNOWN"]
    effect_count: int
    durable: bool


@dataclass(frozen=True, slots=True)
class ClaimDisposition:
    kind: Literal["PRODUCT_LEDGER_ONCE_ONLY", "RECONCILE_NO_SEND"]
    reason: str

    @property
    def product_may_attempt_one_effect(self) -> bool:
        return self.kind == "PRODUCT_LEDGER_ONCE_ONLY"


def check_product_claim(
    *,
    request: dict,
    claim: dict,
    operation_key: str,
    execution_id: str,
    expected_action: Action,
    expected_integration_id: str,
    reservation: ProductReservation,
) -> ClaimDisposition:
    """Inspect a claim without running the protected operation.

    expected_integration_id must come from the product's trusted installed
    Grant integration configuration, NOT from a submitted request, callback
    or untrusted claimed receipt. Product still requires its own atomic effect
    ledger and actual result readback. The positive disposition is never
    permission for direct replay
    from the Grant service, callbacks, or an HTTP delivery notification.
    """
    try:
        request_id = str(uuid.UUID(request["id"]))
        exact_action = expected_action.model_dump()
        bounded_json(exact_action)
        action_hash = fingerprint(exact_action)
        if (
            type(expected_integration_id) is not str
            or not 1 <= len(expected_integration_id) <= 100
            or any(ord(char) < 32 or ord(char) == 127 for char in expected_integration_id)
            or type(request.get("integration_id")) is not str
            or request.get("integration_id") != expected_integration_id
            or request.get("state") != "APPROVED"
            or request.get("action_hash") != action_hash
            or fingerprint(Action.model_validate(request["action"]).model_dump())
            != action_hash
            or type(claim.get("committed")) is not bool
            or claim["committed"] is not True
            or type(claim.get("replay")) is not bool
            or claim.get("request_id") != request_id
            or claim.get("execution_id") != execution_id
            or claim.get("action_hash") != action_hash
            or not operation_key
            or len(operation_key) > 128
            or any(c in operation_key for c in "\r\n")
            or not execution_id
            or len(execution_id) > 128
            or not isinstance(reservation, ProductReservation)
            or reservation.operation_key != operation_key
            or reservation.execution_id != execution_id
            or type(reservation.durable) is not bool
            or reservation.durable is not True
            or type(reservation.effect_count) is not int
            or reservation.effect_count < 0
            or reservation.effect_count > 1
            or reservation.state not in ("RESERVED", "EFFECT_APPLIED", "UNKNOWN")
        ):
            raise ConsumerGuardError("PRODUCT_GRANT_BINDING_INVALID")
    except (KeyError, TypeError, ValueError, AttributeError):
        raise ConsumerGuardError("PRODUCT_GRANT_BINDING_INVALID") from None

    if claim["replay"]:
        return ClaimDisposition(
            "RECONCILE_NO_SEND", "GRANT_CLAIM_REPLAY_REQUIRES_PRODUCT_READBACK"
        )
    if reservation.state != "RESERVED" or reservation.effect_count != 0:
        return ClaimDisposition(
            "RECONCILE_NO_SEND", "PRODUCT_EFFECT_ALREADY_RECORDED_OR_UNCERTAIN"
        )
    return ClaimDisposition(
        "PRODUCT_LEDGER_ONCE_ONLY", "FRESH_COMMIT_REQUIRES_ATOMIC_PRODUCT_EFFECT_LOCK"
    )


def validate_control_replay_readback(
    *,
    delivery_log_id: int,
    response: dict,
    checkpoint_before: dict,
    checkpoint_after: dict,
) -> dict:
    """Compare a DataRelay Control replay result against product-owned readbacks.

    Returns a bounded *candidate evidence record*, not independent acceptance.
    Only the consuming product's actual operation/audit and destination delivery
    observations can satisfy M3. No network calls or product state mutation.
    """
    if (
        type(delivery_log_id) is not int
        or delivery_log_id <= 0
        or not isinstance(response, dict)
        or response.get("log_id") != delivery_log_id
        or response.get("dry_run") is not False
        or response.get("outcome") not in ("delivered", "failed")
        or not isinstance(checkpoint_before, dict)
        or not isinstance(checkpoint_after, dict)
        or checkpoint_before != checkpoint_after
        or type(response.get("event_count")) is not int
        or response["event_count"] < 1
        or response["event_count"] > 500
        or type(response.get("replay_run_id")) is not str
    ):
        raise ConsumerGuardError("CONTROL_REPLAY_EVIDENCE_INVALID")
    try:
        run_id = str(uuid.UUID(response["replay_run_id"]))
    except ValueError:
        raise ConsumerGuardError("CONTROL_REPLAY_EVIDENCE_INVALID") from None
    return {
        "product": "datarelay-control",
        "operation": "delivery-log-replay",
        "delivery_log_id": delivery_log_id,
        "replay_run_id": run_id,
        "event_count": response["event_count"],
        "outcome": response["outcome"],
        "checkpoint_unchanged": True,
        "independently_verified": False,
        "acceptance_state": "PRODUCT_READBACK_NEEDS_INDEPENDENT_CONFIRMATION",
    }


def correlate_stellar_receiver_observation(
    *,
    deployed_version: str,
    source: dict,
    grant_outcome: dict,
    receiver_observation: dict,
    feedback_excluded: bool,
) -> dict:
    """Correlate normalized XDR receiver evidence without contacting Stellar.

    The receiver_observation mapping is an operator-supplied normalized
    readback, NOT a promise of a specific vendor webhook payload field name.
    Even a matching tuple is untrusted without independently querying the
    real deployed receiver.
    """
    import re

    allowed_states = {"APPROVED", "DENIED", "HELD", "EXPIRED"}
    if (
        not isinstance(deployed_version, str)
        or not re.fullmatch(r"[A-Za-z0-9._+-]{1,48}", deployed_version)
        or not isinstance(source, dict)
        or source.get("product") != "stellar"
        or not isinstance(grant_outcome, dict)
        or grant_outcome.get("event_type") != "grant.approval.outcome"
        or grant_outcome.get("state") not in allowed_states
        or not isinstance(receiver_observation, dict)
        or type(feedback_excluded) is not bool
        or not feedback_excluded
    ):
        raise ConsumerGuardError("STELLAR_CORRELATION_INVALID")

    for field in ("tenant_id", "case_id", "alert_id"):
        value = source.get(field)
        if (
            not isinstance(value, str)
            or not 1 <= len(value) <= 128
            or any(c in value for c in "\r\n")
        ):
            raise ConsumerGuardError("STELLAR_CORRELATION_INVALID")

    try:
        event_id = str(uuid.UUID(grant_outcome["event_id"]))
        request_id = str(uuid.UUID(grant_outcome["request_id"]))
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ConsumerGuardError("STELLAR_CORRELATION_INVALID") from None

    if (
        grant_outcome.get("event_id") != event_id
        or grant_outcome.get("request_id") != request_id
        or grant_outcome.get("source") != source
        or type(grant_outcome.get("state_revision")) is not int
        or grant_outcome["state_revision"] < 1
        or receiver_observation.get("grant_event_id") != event_id
        or receiver_observation.get("grant_request_id") != request_id
        or receiver_observation.get("tenant_id") != source["tenant_id"]
        or receiver_observation.get("case_id") != source["case_id"]
        or receiver_observation.get("state") != grant_outcome["state"]
        or not isinstance(receiver_observation.get("receiver_record_id"), str)
        or not 1 <= len(receiver_observation["receiver_record_id"]) <= 128
    ):
        raise ConsumerGuardError("STELLAR_CORRELATION_INVALID")
    return {
        "product": "stellar",
        "deployed_version": deployed_version,
        "grant_event_id": event_id,
        "grant_request_id": request_id,
        "state": grant_outcome["state"],
        "tenant_matches": True,
        "case_matches": True,
        "feedback_excluded": True,
        "independently_verified": False,
        "acceptance_state": "RECEIVER_CORRELATION_PENDING_INDEPENDENT_READBACK",
    }
