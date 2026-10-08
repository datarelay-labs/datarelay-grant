"""G11 consumer contract checks; never execute external product operations."""

import uuid
from dataclasses import replace

import pytest

from grant.consumer_guard import (
    ConsumerGuardError,
    ProductReservation,
    check_product_claim,
    validate_control_replay_readback,
)
from grant.core import fingerprint
from grant.models import Action

ACTION = Action(kind="service.delivery_log.replay", target="log/42", parameters={"log_id": 42})
RID = str(uuid.uuid4())
HASH = fingerprint(ACTION.model_dump())
REQUEST = {"id": RID, "state": "APPROVED", "action": ACTION.model_dump(), "action_hash": HASH}
CLAIM = {
    "request_id": RID, "execution_id": "product-control-replay-42",
    "action_hash": HASH, "committed": True, "replay": False,
}
RESERVATION = ProductReservation(
    operation_key="control-replay-log-42",
    execution_id="product-control-replay-42",
    state="RESERVED", effect_count=0, durable=True,
)


def decide(request=None, claim=None, reservation=None, action=None):
    return check_product_claim(
        request=REQUEST if request is None else request,
        claim=CLAIM if claim is None else claim,
        reservation=RESERVATION if reservation is None else reservation,
        expected_action=ACTION if action is None else action,
        execution_id="product-control-replay-42",
        operation_key="control-replay-log-42",
    )


def test_fresh_durable_binding_only_reaches_product_ledger():
    status = decide()
    assert status.kind == "PRODUCT_LEDGER_ONCE_ONLY"
    assert status.product_may_attempt_one_effect
    assert "PRODUCT_EFFECT_LOCK" in status.reason


@pytest.mark.parametrize(
    "change",
    [
        {"request_id": str(uuid.uuid4())},
        {"execution_id": "different"},
        {"action_hash": "0" * 64},
        {"committed": False},
        {"committed": 1},
        {"committed": "true"},
        {"replay": None},
        {"replay": 0},
    ],
)
def test_mismatched_or_ambiguous_grant_claim_denied(change):
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        decide(claim={**CLAIM, **change})


@pytest.mark.parametrize("state", ["AWAITING", "HELD", "DENIED", "EXPIRED", "CANCELLED"])
def test_nonapproved_request_never_allows_product_execution(state):
    with pytest.raises(ConsumerGuardError):
        decide(request={**REQUEST, "state": state})


def test_changed_action_fingerprint_or_product_execution_key_denied():
    with pytest.raises(ConsumerGuardError):
        decide(request={**REQUEST, "action_hash": "0" * 64})
    with pytest.raises(ConsumerGuardError):
        decide(action=Action(kind=ACTION.kind, target="different", parameters=ACTION.parameters))
    with pytest.raises(ConsumerGuardError):
        decide(reservation=replace(RESERVATION, execution_id="wrong-key"))


def test_replay_never_triggers_a_second_product_effect_even_if_local_ledger_is_empty():
    status = decide(claim={**CLAIM, "replay": True})
    assert status.kind == "RECONCILE_NO_SEND"
    assert not status.product_may_attempt_one_effect


@pytest.mark.parametrize(
    "reservation",
    [
        replace(RESERVATION, state="EFFECT_APPLIED", effect_count=1),
        replace(RESERVATION, state="UNKNOWN"),
        replace(RESERVATION, state="RESERVED", effect_count=1),
    ],
)
def test_product_local_effect_or_uncertainty_requires_reconciliation(reservation):
    assert decide(reservation=reservation).kind == "RECONCILE_NO_SEND"


def test_product_reservation_must_be_marked_durable():
    with pytest.raises(ConsumerGuardError):
        decide(reservation=replace(RESERVATION, durable=False))


def test_control_replay_readback_is_evidence_not_acceptance():
    info = {
        "log_id": 42, "dry_run": False, "outcome": "delivered",
        "event_count": 2, "replay_run_id": str(uuid.uuid4()),
    }
    evidence = validate_control_replay_readback(
        delivery_log_id=42, response=info,
        checkpoint_before={"offset": 100}, checkpoint_after={"offset": 100},
    )
    assert evidence["checkpoint_unchanged"]
    assert evidence["independently_verified"] is False
    assert evidence["acceptance_state"] != "PASS"


@pytest.mark.parametrize("bad", [
    {"dry_run": True},
    {"outcome": "dry_run_ok"},
    {"event_count": 0},
    {"event_count": 501},
    {"log_id": 43},
    {"replay_run_id": "not-uuid"},
])
def test_control_replay_readback_rejects_dry_run_wrong_target_or_fake_identity(bad):
    info = {
        "log_id": 42, "dry_run": False, "outcome": "delivered",
        "event_count": 1, "replay_run_id": str(uuid.uuid4()),
    }
    with pytest.raises(ConsumerGuardError):
        validate_control_replay_readback(
            delivery_log_id=42, response={**info, **bad},
            checkpoint_before={}, checkpoint_after={},
        )


def test_control_replay_checkpoint_mismatch_rejected():
    with pytest.raises(ConsumerGuardError):
        validate_control_replay_readback(
            delivery_log_id=42,
            response={
                "log_id": 42, "dry_run": False, "outcome": "delivered",
                "event_count": 1, "replay_run_id": str(uuid.uuid4()),
            },
            checkpoint_before={"offset": 1}, checkpoint_after={"offset": 2},
        )


def test_stellar_correlated_normalized_readback_never_claims_independent_acceptance():
    from grant.consumer_guard import correlate_stellar_receiver_observation

    original = {
        "product": "stellar", "tenant_id": "tenant-isolated",
        "case_id": "case-isolated", "alert_id": "alert-isolated",
    }
    evt = str(uuid.uuid4())
    rid = str(uuid.uuid4())
    outcome = {
        "event_type": "grant.approval.outcome",
        "event_id": evt, "request_id": rid, "state": "APPROVED",
        "state_revision": 2, "source": original,
    }
    observed = {
        "grant_event_id": evt, "grant_request_id": rid,
        "tenant_id": original["tenant_id"], "case_id": original["case_id"],
        "state": "APPROVED", "receiver_record_id": "xdr-isolated-event",
    }
    candidate = correlate_stellar_receiver_observation(
        deployed_version="7.0.xs", source=original, grant_outcome=outcome,
        receiver_observation=observed, feedback_excluded=True,
    )
    assert candidate["tenant_matches"]
    assert candidate["case_matches"]
    assert candidate["independently_verified"] is False
    assert candidate["acceptance_state"] != "PASS"
    for drift in (
        {"tenant_id": "other"},
        {"case_id": "other"},
        {"grant_event_id": str(uuid.uuid4())},
        {"grant_request_id": str(uuid.uuid4())},
        {"state": "DENIED"},
    ):
        with pytest.raises(ConsumerGuardError, match="STELLAR_CORRELATION_INVALID"):
            correlate_stellar_receiver_observation(
                deployed_version="7.0.xs", source=original, grant_outcome=outcome,
                receiver_observation={**observed, **drift}, feedback_excluded=True,
            )
    with pytest.raises(ConsumerGuardError):
        correlate_stellar_receiver_observation(
            deployed_version="7.0.xs", source=original, grant_outcome=outcome,
            receiver_observation=observed, feedback_excluded=False,
        )
