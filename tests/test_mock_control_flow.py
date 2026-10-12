"""Actual Grant HTTP + disposable product-owned Control ledger; NO real replay."""

import json
import uuid
from pathlib import Path

import pytest

from grant.auth import Principal
from grant.client import GrantClient, GrantClientError
from grant.consumer_guard import check_product_claim, validate_control_replay_readback
from grant.models import Action, Decision, Intake, Profile
from tests.support.loopback_grant import run_loopback_grant
from tests.support.mock_product_systems import MockControlLedger

SCENARIOS = json.loads((Path(__file__).parent / 'fixtures/mock-integration-scenarios.json').read_text())


def configured_control(env):
    action = Action.model_validate(SCENARIOS['control']['action'])
    profile = env.core.create_profile(env.admin, Profile(
        name='Simulated Control route 7', integration_id=env.integration['id'],
        approver_id=env.users['approver']['id'], action_kind=action.kind,
    ))
    env.core.transition_profile(env.admin, profile['id'], 'TESTING')
    env.core.transition_profile(env.admin, profile['id'], 'ACTIVE')
    producer = env.auth.issue_token(env.admin, env.integration['id'],
                                    ['request:create', 'request:read'])
    executor = env.auth.issue_token(env.admin, env.integration['id'],
                                    ['request:read', 'grant:consume', 'result:write'])
    intake = Intake(**env.intake(
        profile_id=profile['id'], action=action.model_dump(),
        title='Isolated Control replay approval',
    ))
    return action, intake, producer['token'], executor['token']


def test_actual_grant_http_control_product_simulated_effect_once(env, tmp_path):
    action, intake, producer_token, executor_token = configured_control(env)
    ledger = MockControlLedger(tmp_path/'control-product.sqlite', log_id=42, route_id=7, destination_id=9)
    with (
        run_loopback_grant(env.app) as origin,
        GrantClient(origin, producer_token, dev_loopback=True) as producer,
        GrantClient(origin, executor_token, dev_loopback=True) as executor,
    ):
        request = producer.create_request(intake)
        assert request['state'] == 'AWAITING'
        assert producer.create_request(intake)['id'] == request['id']
        with pytest.raises(GrantClientError, match='GRANT_HTTP_403'):
            producer.claim(request['id'], 'control-ex-42', action)
        with pytest.raises(GrantClientError, match='GRANT_HTTP_409'):
            executor.claim(request['id'], 'control-ex-42', action)
        assert ledger.read_effect_count('control-log42-route7-dest9') == 0
        env.core.decide(
            Principal(env.users['approver']['id'], 'human', 'member'),
            request['id'], Decision(decision='APPROVED', expected_revision=1),
        )
        before = executor.read(request['id'])
        assert before['state'] == 'APPROVED'
        reservation = ledger.reserve('control-log42-route7-dest9', 'control-ex-42')
        committed = executor.claim(request['id'], 'control-ex-42', action)
        disposition = check_product_claim(
            request=before, claim=committed, operation_key=reservation.operation_key,
            execution_id=reservation.execution_id, expected_action=action,
            expected_integration_id=env.integration['id'], reservation=reservation,
        )
        assert disposition.product_may_attempt_one_effect
        original_offset = ledger.checkpoint()
        assert ledger.apply_once(reservation.operation_key, reservation.execution_id)
        result = ledger.independent_readback(reservation.operation_key)
        evidence = validate_control_replay_readback(
            delivery_log_id=42, expected_route_id=7, expected_destination_id=9,
            response=result, checkpoint_before=original_offset,
            checkpoint_after=ledger.checkpoint(),
        )
        assert evidence['independently_verified'] is False
        assert evidence['checkpoint_unchanged']
        reported = executor.report(request['id'], 'control-ex-42', action,
                                   'REPORTED_SUCCEEDED', 'mock-product-only')
        assert reported['execution_state'] == 'REPORTED_SUCCEEDED'
        assert executor.claim(request['id'], 'control-ex-42', action)['replay'] is True
        assert not ledger.apply_once(reservation.operation_key, reservation.execution_id)
        assert ledger.read_effect_count(reservation.operation_key) == 1
        assert check_product_claim(
            request=before, claim={**committed, 'replay': True},
            operation_key=reservation.operation_key, execution_id=reservation.execution_id,
            expected_action=action, expected_integration_id=env.integration['id'],
            reservation=ledger.reserve(reservation.operation_key, reservation.execution_id),
        ).kind == 'RECONCILE_NO_SEND'
        with pytest.raises(GrantClientError, match='GRANT_HTTP_409'):
            executor.claim(request['id'], 'another-execution', action)
        # A reported result is not independent external business execution.
        assert ledger.read_effect_count(reservation.operation_key) == 1
        with env.db.transaction(write=False) as conn:
            assert conn.execute('SELECT count(*) FROM requests').fetchone()[0] == 1


@pytest.mark.parametrize('outcome', ['HELD', 'DENIED'])
def test_mock_control_must_not_execute_unapproved_decision(env, tmp_path, outcome):
    action, intake, producer_token, executor_token = configured_control(env)
    ledger = MockControlLedger(tmp_path/'control.sqlite', log_id=42, route_id=7, destination_id=9)
    with (
        run_loopback_grant(env.app) as origin,
        GrantClient(origin, producer_token, dev_loopback=True) as producer,
        GrantClient(origin, executor_token, dev_loopback=True) as executor,
    ):
        request = producer.create_request(intake)
        env.core.decide(
            Principal(env.users['approver']['id'], 'human', 'member'),
            request['id'], Decision(decision=outcome, expected_revision=1),
        )
        with pytest.raises(GrantClientError, match='GRANT_HTTP_409'):
            executor.claim(request['id'], 'ex-'+str(uuid.uuid4()), action)
        assert ledger.read_effect_count('key-unapproved') == 0


def test_ambiguous_product_reservation_cannot_execute_even_after_grant_commit(env, tmp_path):
    action, intake, producer_token, executor_token = configured_control(env)
    ledger = MockControlLedger(tmp_path/'control.sqlite', log_id=42, route_id=7, destination_id=9)
    with (
        run_loopback_grant(env.app) as origin,
        GrantClient(origin, producer_token, dev_loopback=True) as producer,
        GrantClient(origin, executor_token, dev_loopback=True) as executor,
    ):
        request = producer.create_request(intake)
        env.core.decide(Principal(env.users['approver']['id'], 'human', 'member'),
                        request['id'], Decision(decision='APPROVED', expected_revision=1))
        before = executor.read(request['id'])
        local = ledger.reserve('uncertain-control-effect', 'control-ex-uncertain')
        committed = executor.claim(request['id'], 'control-ex-uncertain', action)
        ledger.mark_unknown(local.operation_key, local.execution_id)
        decision = check_product_claim(
            request=before, claim=committed, operation_key=local.operation_key,
            execution_id=local.execution_id, expected_action=action,
            expected_integration_id=env.integration['id'],
            reservation=ledger.reserve(local.operation_key, local.execution_id),
        )
        assert decision.kind == 'RECONCILE_NO_SEND'
        assert not ledger.apply_once(local.operation_key, local.execution_id)
        assert ledger.read_effect_count(local.operation_key) == 0
        assert executor.read(request['id'])['execution_id'] == 'control-ex-uncertain'
        assert executor.report(request['id'], 'control-ex-uncertain', action,
                               'UNKNOWN', 'mock-crash-uncertain')['execution_state'] == 'UNKNOWN'
