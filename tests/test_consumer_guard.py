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

# Match the actual staged Control G11 pilot operation contract, never a free-form request.
TRUSTED_GRANT_INTEGRATION_ID = "control-verified-installation-integration"
ACTION = Action(
    kind="datarelay.control.delivery_log.replay",
    target="delivery-log/42",
    parameters={"log_id": 42, "route_id": 7, "destination_id": 9},
)
RID = str(uuid.uuid4())
HASH = fingerprint(ACTION.model_dump())
REQUEST = {
    "id": RID, "state": "APPROVED", "integration_id": TRUSTED_GRANT_INTEGRATION_ID,
    "action": ACTION.model_dump(), "action_hash": HASH,
    # Exact current Core.get() projection before product calls consume().
    "execution_state": "NOT_STARTED", "execution_id": None, "committed_at": None,
}
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
        expected_integration_id=TRUSTED_GRANT_INTEGRATION_ID,
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
        "route_id": 7, "destination_id": 9,
    }
    evidence = validate_control_replay_readback(
        delivery_log_id=42, expected_route_id=7, expected_destination_id=9, response=info,
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
        "route_id": 7, "destination_id": 9,
    }
    with pytest.raises(ConsumerGuardError):
        validate_control_replay_readback(
            delivery_log_id=42, expected_route_id=7, expected_destination_id=9, response={**info, **bad},
            checkpoint_before={}, checkpoint_after={},
        )


def test_control_replay_checkpoint_mismatch_rejected():
    with pytest.raises(ConsumerGuardError):
        validate_control_replay_readback(
            delivery_log_id=42, expected_route_id=7, expected_destination_id=9,
            response={
                "log_id": 42, "dry_run": False, "outcome": "delivered",
                "event_count": 1, "replay_run_id": str(uuid.uuid4()),
                "route_id": 7, "destination_id": 9,
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
        "alert_id": original["alert_id"], "state_revision": outcome["state_revision"],
        "state": "APPROVED", "receiver_record_id": "xdr-isolated-event",
    }
    candidate = correlate_stellar_receiver_observation(
        deployed_version="7.0.xs", source=original, grant_outcome=outcome,
        receiver_observation=observed, feedback_excluded=True,
    )
    assert candidate["tenant_matches"]
    assert candidate["case_matches"]
    assert candidate["alert_matches"] and candidate["revision_matches"]
    assert candidate["independently_verified"] is False
    assert candidate["acceptance_state"] != "PASS"
    for drift in (
        {"tenant_id": "other"},
        {"case_id": "other"},
        {"alert_id": "other"},
        {"state_revision": outcome["state_revision"] + 1},
        {"state_revision": True},
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


def test_control_pilot_exact_action_and_canonical_hash_contract():
    assert ACTION.kind == "datarelay.control.delivery_log.replay"
    assert ACTION.target == "delivery-log/42"
    assert ACTION.parameters == {"log_id": 42, "route_id": 7, "destination_id": 9}
    assert HASH == fingerprint(ACTION.model_dump())
    assert decide().kind == "PRODUCT_LEDGER_ONCE_ONLY"


@pytest.mark.parametrize("unsafe_request", [
    {},
    {"integration_id": None},
    {"integration_id": "another-integration"},
    {"integration_id": TRUSTED_GRANT_INTEGRATION_ID.upper()},
    {"integration_id": 7},
    {"integration_id": True},
    {"integration_id": TRUSTED_GRANT_INTEGRATION_ID + "\n"},
])
def test_untrusted_or_missing_request_integration_never_qualifies(unsafe_request):
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        decide(request={**REQUEST, **unsafe_request} if unsafe_request else
               {key: value for key, value in REQUEST.items() if key != "integration_id"})


@pytest.mark.parametrize("untrusted_expected_id", [
    "", "another-integration", "control-verified-installation-integration\n",
    42, None, True, "a" * 101,
])
def test_wrong_or_invalid_product_owned_integration_binding_rejected(untrusted_expected_id):
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        check_product_claim(
            request=REQUEST, claim=CLAIM, operation_key=RESERVATION.operation_key,
            execution_id=RESERVATION.execution_id, expected_action=ACTION,
            expected_integration_id=untrusted_expected_id, reservation=RESERVATION,
        )


@pytest.mark.parametrize("parameters", [
    {"log_id": 43, "route_id": 7, "destination_id": 9},
    {"log_id": 42, "route_id": 8, "destination_id": 9},
    {"log_id": 42, "route_id": 7, "destination_id": 10},
])
def test_control_pilot_changed_product_route_destination_or_log_rejected(parameters):
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        decide(action=Action(kind=ACTION.kind, target=ACTION.target, parameters=parameters))


@pytest.mark.parametrize("state", ["APPROVED", "DENIED", "HELD", "EXPIRED"])
def test_stellar_normalized_observation_requires_exact_alert_and_revision(state):
    from grant.consumer_guard import correlate_stellar_receiver_observation

    source = {
        "product": "stellar",
        "tenant_id": "tenant-a",
        "case_id": "case-a",
        "alert_id": "alert-1",
    }
    event = {
        "event_type": "grant.approval.outcome",
        "event_id": str(uuid.uuid4()),
        "request_id": str(uuid.uuid4()),
        "state": state,
        "state_revision": 3,
        "source": source,
    }
    valid = {
        "grant_event_id": event["event_id"],
        "grant_request_id": event["request_id"],
        "tenant_id": source["tenant_id"],
        "case_id": source["case_id"],
        "alert_id": source["alert_id"],
        "state_revision": event["state_revision"],
        "state": state,
        "receiver_record_id": "local-normalized-record",
    }

    def validate(observed):
        return correlate_stellar_receiver_observation(
            deployed_version="7.0.xs",
            source=source,
            grant_outcome=event,
            receiver_observation=observed,
            feedback_excluded=True,
        )

    candidate = validate(valid)
    assert candidate["alert_matches"] is True
    assert candidate["revision_matches"] is True
    assert candidate["independently_verified"] is False
    assert candidate["acceptance_state"] == (
        "RECEIVER_CORRELATION_PENDING_INDEPENDENT_READBACK"
    )

    for field, invalid in (
        ("alert_id", "other-alert"),
        ("alert_id", ""),
        ("alert_id", None),
        ("state_revision", 2),
        ("state_revision", 4),
        ("state_revision", True),
        ("state_revision", 3.0),
        ("state_revision", "3"),
        ("state_revision", 0),
        ("receiver_record_id", "injected\nrecord"),
    ):
        with pytest.raises(ConsumerGuardError, match="STELLAR_CORRELATION_INVALID"):
            validate({**valid, field: invalid})

    for missing in ("alert_id", "state_revision"):
        with pytest.raises(ConsumerGuardError, match="STELLAR_CORRELATION_INVALID"):
            validate({key: value for key, value in valid.items() if key != missing})


@pytest.mark.parametrize("unsafe", ["bad\x00id", "bad\x1fid", "bad\x7fid"])
def test_stellar_source_identity_control_characters_fail_closed(unsafe):
    from grant.consumer_guard import correlate_stellar_receiver_observation

    source = {
        "product": "stellar",
        "tenant_id": unsafe,
        "case_id": "case-a",
        "alert_id": "alert-1",
    }
    event = {
        "event_type": "grant.approval.outcome",
        "event_id": str(uuid.uuid4()),
        "request_id": str(uuid.uuid4()),
        "state": "APPROVED",
        "state_revision": 1,
        "source": source,
    }
    readback = {
        "grant_event_id": event["event_id"],
        "grant_request_id": event["request_id"],
        "tenant_id": unsafe,
        "case_id": "case-a",
        "alert_id": "alert-1",
        "state_revision": 1,
        "state": "APPROVED",
        "receiver_record_id": "local-record-1",
    }
    with pytest.raises(ConsumerGuardError, match="STELLAR_CORRELATION_INVALID"):
        correlate_stellar_receiver_observation(
            deployed_version="7.0.xs",
            source=source,
            grant_outcome=event,
            receiver_observation=readback,
            feedback_excluded=True,
        )


def test_control_readback_requires_product_owned_route_and_destination_binding():
    # Product-owned exact IDs must match the actual Control ReplayExecutionResult.
    run_id = str(uuid.uuid4())
    received = {
        "log_id": 42, "dry_run": False, "outcome": "delivered",
        "event_count": 1, "replay_run_id": run_id,
        "route_id": 7, "destination_id": 9,
    }

    def check(actual, *, expected_route=7, expected_destination=9):
        return validate_control_replay_readback(
            delivery_log_id=42,
            expected_route_id=expected_route,
            expected_destination_id=expected_destination,
            response=actual,
            checkpoint_before={}, checkpoint_after={},  # legitimate Control empty checkpoint
        )

    valid = check(received)
    assert valid["route_id"] == 7
    assert valid["destination_id"] == 9
    assert valid["independently_verified"] is False
    assert valid["acceptance_state"] == "PRODUCT_READBACK_NEEDS_INDEPENDENT_CONFIRMATION"

    for field, incorrect in (
        ("route_id", 1), ("route_id", 0), ("route_id", "7"),
        ("route_id", True), ("route_id", 7.0), ("route_id", None),
        ("destination_id", 1), ("destination_id", 0),
        ("destination_id", "9"), ("destination_id", True),
        ("destination_id", 9.0), ("destination_id", None),
    ):
        with pytest.raises(ConsumerGuardError, match="CONTROL_REPLAY_EVIDENCE_INVALID"):
            check({**received, field: incorrect})
    for missing in ("route_id", "destination_id"):
        with pytest.raises(ConsumerGuardError, match="CONTROL_REPLAY_EVIDENCE_INVALID"):
            check({k: v for k, v in received.items() if k != missing})

    for expected_route, expected_destination in (
        (999, 9), (7, 999), (True, 9), (7, False),
        (0, 9), (7, 0), (7.0, 9), (7, 9.0),
        ("7", 9), (7, "9"), (None, 9), (7, None),
    ):
        with pytest.raises(ConsumerGuardError, match="CONTROL_REPLAY_EVIDENCE_INVALID"):
            check(received, expected_route=expected_route,
                  expected_destination=expected_destination)


@pytest.mark.parametrize("state", [
    "COMMITTED", "RUNNING", "UNKNOWN", "REPORTED_SUCCEEDED", "REPORTED_FAILED",
])
def test_preconsume_snapshot_cannot_claim_a_previously_executed_request(state):
    """The existing Grant projection contradicts a fresh first-use claim."""
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        decide(request={
            **REQUEST,
            "execution_state": state,
            "execution_id": "prior-product-effect",
            "committed_at": 1700000000.0,
        })


@pytest.mark.parametrize("changes", [
    {"execution_state": None},
    {"execution_state": ""},
    {"execution_id": "unrelated-earlier-commit"},
    {"committed_at": 1700000000.0},
])
def test_preconsume_snapshot_rejects_partial_or_conflicting_execution_identity(changes):
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        decide(request={**REQUEST, **changes})


@pytest.mark.parametrize("missing", ["execution_state", "execution_id", "committed_at"])
def test_preconsume_snapshot_requires_explicit_current_execution_fields(missing):
    incomplete = {key: value for key, value in REQUEST.items() if key != missing}
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        decide(request=incomplete)


def test_actual_grant_request_projection_only_accepts_preconsume_snapshot(env):
    """Use real scoped Grant API states, not invented JSON-only fixture fields."""
    created = env.api.post("/api/v1/requests", json=env.intake())
    assert created.status_code == 202, created.text
    row = created.json()
    approved = env.human("approver").post(
        f"/api/v1/requests/{row['id']}/decision",
        json={"decision": "APPROVED", "expected_revision": row["revision"]},
    )
    assert approved.status_code == 200, approved.text
    before_response = env.api.get(f"/api/v1/requests/{row['id']}")
    assert before_response.status_code == 200, before_response.text
    before = before_response.json()
    assert before["state"] == "APPROVED"
    assert before["execution_state"] == "NOT_STARTED"
    assert before["execution_id"] is None and before["committed_at"] is None

    action = Action.model_validate(before["action"])
    execution = str(uuid.uuid4())
    operation = "isolated-test-operation-" + row["id"]
    local = ProductReservation(
        operation_key=operation, execution_id=execution,
        state="RESERVED", effect_count=0, durable=True,
    )
    consumed = env.api.post(
        f"/api/v1/requests/{row['id']}/consume",
        json={"execution_id": execution, "action_hash": row["action_hash"]},
    )
    assert consumed.status_code == 200, consumed.text
    claim = consumed.json()
    assert claim["committed"] is True and claim["replay"] is False
    arguments = {
        "claim": claim, "operation_key": operation, "execution_id": execution,
        "expected_action": action, "expected_integration_id": env.integration["id"],
        "reservation": local,
    }
    assert check_product_claim(request=before, **arguments).kind == "PRODUCT_LEDGER_ONCE_ONLY"

    after_response = env.api.get(f"/api/v1/requests/{row['id']}")
    assert after_response.status_code == 200, after_response.text
    after = after_response.json()
    assert after["execution_state"] == "COMMITTED"
    assert after["execution_id"] == execution
    assert after["committed_at"] is not None
    with pytest.raises(ConsumerGuardError, match="PRODUCT_GRANT_BINDING_INVALID"):
        check_product_claim(request=after, **arguments)

    replay = env.api.post(
        f"/api/v1/requests/{row['id']}/consume",
        json={"execution_id": execution, "action_hash": row["action_hash"]},
    )
    assert replay.status_code == 200 and replay.json()["replay"] is True
    # A legitimate repeated consume never permits a second product effect.
    assert check_product_claim(request=before, claim=replay.json(),
                               **{k: v for k, v in arguments.items() if k != "claim"}
                               ).kind == "RECONCILE_NO_SEND"


@pytest.mark.parametrize("spoofed_log_id", [True, 1.0])
def test_control_replay_log_id_never_accepts_numeric_type_alias(spoofed_log_id):
    """A Control log is bound to an exact integer, not Python bool/float equality."""
    info = {
        "log_id": spoofed_log_id, "dry_run": False, "outcome": "delivered",
        "event_count": 1, "replay_run_id": str(uuid.uuid4()),
        "route_id": 3, "destination_id": 4,
    }
    with pytest.raises(ConsumerGuardError, match="CONTROL_REPLAY_EVIDENCE_INVALID"):
        validate_control_replay_readback(
            delivery_log_id=1, expected_route_id=3,
            expected_destination_id=4, response=info,
            checkpoint_before={"offset": 1}, checkpoint_after={"offset": 1},
        )


@pytest.mark.parametrize(("before", "after"), [
    ({"offset": 1}, {"offset": True}),
    ({"offset": True}, {"offset": 1}),
    ({"offset": 1}, {"offset": 1.0}),
    ({"state": {"cursor": 1}}, {"state": {"cursor": True}}),
    ({"state": [{"cursor": 1}]}, {"state": [{"cursor": 1.0}]}),
])
def test_control_checkpoint_requires_exact_json_typed_readback(before, after):
    """Python True==1==1.0 is NOT identical JSON checkpoint evidence."""
    response = {
        "log_id": 1, "dry_run": False, "outcome": "delivered",
        "event_count": 1, "replay_run_id": str(uuid.uuid4()),
        "route_id": 3, "destination_id": 4,
    }
    with pytest.raises(ConsumerGuardError, match="CONTROL_REPLAY_EVIDENCE_INVALID"):
        validate_control_replay_readback(
            delivery_log_id=1, expected_route_id=3,
            expected_destination_id=4, response=response,
            checkpoint_before=before, checkpoint_after=after,
        )


def test_control_checkpoint_json_equivalence_preserves_key_order_and_empty():
    """Identical JSON with re-ordered object keys remains unchanged evidence."""
    response = {
        "log_id": 1, "dry_run": False, "outcome": "delivered",
        "event_count": 1, "replay_run_id": str(uuid.uuid4()),
        "route_id": 3, "destination_id": 4,
    }
    for before, after in [
        ({}, {}),
        ({"nested": {"cursor": 1, "active": False}, "offset": 4},
         {"offset": 4, "nested": {"active": False, "cursor": 1}}),
    ]:
        evidence = validate_control_replay_readback(
            delivery_log_id=1, expected_route_id=3,
            expected_destination_id=4, response=response,
            checkpoint_before=before, checkpoint_after=after,
        )
        assert evidence["checkpoint_unchanged"] is True
        assert evidence["independently_verified"] is False


@pytest.mark.parametrize("bad", [float("nan"), object()])
def test_control_checkpoint_non_json_payload_fails_closed(bad):
    response = {
        "log_id": 1, "dry_run": False, "outcome": "delivered",
        "event_count": 1, "replay_run_id": str(uuid.uuid4()),
        "route_id": 3, "destination_id": 4,
    }
    with pytest.raises(ConsumerGuardError, match="CONTROL_REPLAY_EVIDENCE_INVALID"):
        validate_control_replay_readback(
            delivery_log_id=1, expected_route_id=3,
            expected_destination_id=4, response=response,
            checkpoint_before={"cursor": bad}, checkpoint_after={"cursor": bad},
        )
