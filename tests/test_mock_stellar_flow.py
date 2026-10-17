"""Real Grant outbound HMAC webhook -> isolated SQLite Stellar-style receiver.

No deployed XDR, independent customer mailbox or native SIEM ingestion claimed.
"""

import json
from dataclasses import replace
from pathlib import Path

import pytest

from grant.auth import Principal
from grant.client import GrantClient, GrantClientError
from grant.consumer_guard import correlate_stellar_receiver_observation
from grant.core import Core
from grant.models import Action, Decision, Intake, Integration, Profile
from grant.transport import Worker, send_webhook
from tests.support.loopback_grant import run_loopback_grant
from tests.support.mock_product_systems import MockStellarReceiver

SCENARIOS = json.loads((Path(__file__).parent / 'fixtures/mock-integration-scenarios.json').read_text())
SOURCE = SCENARIOS['stellar']['source']
SECRET = 'isolation-hmac-only-not-a-real-credential'


def configured_stellar(env, sink_url, *, attempts=2):
    settings = replace(env.settings, callback_urls=(sink_url,),
                       max_delivery_attempts=attempts)
    env.app.state.settings = settings  # Test fixture only; rebuild actual app with exact Host.
    core = Core(env.db, settings)
    integration = core.create_integration(env.admin, Integration(
        name='Isolated Stellar response', kind='stellar', tenant='tenant-isolated',
        callback_url=sink_url, hmac_secret=SECRET,
    ))
    action = Action.model_validate(SCENARIOS['stellar']['action'])
    profile = core.create_profile(env.admin, Profile(
        name='Mock Stellar human approval', integration_id=integration['id'],
        action_kind=action.kind, approver_id=env.users['approver']['id'],
    ))
    core.transition_profile(env.admin, profile['id'], 'TESTING')
    core.transition_profile(env.admin, profile['id'], 'ACTIVE')
    token = env.auth.issue_token(env.admin, integration['id'],
                                 ['request:create', 'request:read'])['token']
    return settings, core, profile['id'], token, action


def create(producer, profile_id, action, *, source=None, ident='mock-stellar-alert-1'):
    return producer.create_request(Intake(
        external_id=ident, profile_id=profile_id, title='Mock XDR alert correlation',
        source=SOURCE if source is None else source, action=action,
    ))


def approve(env, core, row, outcome='APPROVED'):
    core.decide(Principal(env.users['approver']['id'], 'human', 'member'),
                row['id'], Decision(decision=outcome, expected_revision=row['revision']))


def webhook_row(env, request_id):
    with env.db.transaction(write=False) as conn:
        row = conn.execute(
            "SELECT * FROM outbox WHERE kind='webhook' AND request_id=? ORDER BY id DESC LIMIT 1",
            (request_id,),
        ).fetchone()
    return dict(row) if row else None


def test_grant_signed_webhook_to_persisted_stellar_simulator(env, tmp_path):
    with MockStellarReceiver(tmp_path/'stellar.sqlite', secret=SECRET, tenant='tenant-isolated') as sink:
        settings, core, profile, token, action = configured_stellar(env, sink.url)
        with run_loopback_grant(env.app) as origin, GrantClient(origin, token, dev_loopback=True) as producer:
            pending = create(producer, profile, action)
            assert pending['state'] == 'AWAITING'
            assert not sink.readback(pending['id'])
            approve(env, core, pending)
            assert Worker(env.db, settings).tick(limit=10) >= 1
            saved = webhook_row(env, pending['id'])
            assert saved is not None and saved['state'] == 'DELIVERED'
            observed = sink.readback(pending['id'])
            assert len(observed) == 1
            record = observed[0]
            assert record['grant_event_id'] == saved['id']
            assert record['tenant_id'] == SOURCE['tenant_id']
            assert record['case_id'] == SOURCE['case_id']
            assert record['alert_id'] == SOURCE['alert_id']
            assert record['state_revision'] == 2
            assert record['state'] == 'APPROVED'
            signed = settings.unseal(saved['destination'])
            # Even a second successfully signed transport attempt stays one
            # durable record; a new approval request is never emitted.
            send_webhook(settings, signed, saved['payload'], saved['id'])
            assert len(sink.readback(pending['id'])) == 1
            correlation = correlate_stellar_receiver_observation(
                deployed_version='mock.1.0', source=SOURCE,
                grant_outcome={
                    'event_type': 'grant.approval.outcome', 'event_id': saved['id'],
                    'request_id': pending['id'], 'state': 'APPROVED',
                    'state_revision': 2, 'source': SOURCE,
                }, receiver_observation=record, feedback_excluded=True,
            )
            assert correlation['independently_verified'] is False
            assert producer.read(pending['id'])['execution_state'] == 'NOT_STARTED'
            with pytest.raises(GrantClientError, match='GRANT_HTTP_422'):
                create(producer, profile, action, ident='must-not-loop', source={
                    **SOURCE, 'metadata': {'grant_event_id': saved['id'],
                                         'event_type': 'grant.approval.outcome'},
                })
            with pytest.raises(GrantClientError, match='GRANT_HTTP_403'):
                create(producer, profile, action, ident='foreign-tenant', source={
                    **SOURCE, 'tenant_id': 'foreign-tenant',
                })
            with env.db.transaction(write=False) as conn:
                assert conn.execute('SELECT count(*) FROM requests WHERE integration_id=(SELECT id FROM integrations WHERE kind="stellar" LIMIT 1)').fetchone()[0] == 1


def test_stellar_retry_keeps_one_event_and_grant_separates_transport_from_effect(env, tmp_path):
    with MockStellarReceiver(tmp_path/'stellar.sqlite', secret=SECRET, tenant='tenant-isolated') as sink:
        settings, core, profile, token, action = configured_stellar(env, sink.url)
        sink.fail_next(503)
        with run_loopback_grant(env.app) as origin, GrantClient(origin, token, dev_loopback=True) as producer:
            pending = create(producer, profile, action, ident='unstable-receiver-test')
            approve(env, core, pending)
            worker = Worker(env.db, settings)
            assert worker.tick(limit=10) >= 1
            failed = webhook_row(env, pending['id'])
            assert failed['state'] == 'PENDING' and failed['attempts'] == 1
            assert sink.readback(pending['id']) == []
            with env.db.transaction() as conn:
                conn.execute('UPDATE outbox SET available_at=0 WHERE id=?', (failed['id'],))
            assert worker.tick(limit=10) >= 1
            delivered = webhook_row(env, pending['id'])
            assert delivered['state'] == 'DELIVERED' and delivered['attempts'] == 2
            assert delivered['id'] == failed['id']
            assert len(sink.readback(pending['id'])) == 1
            assert producer.read(pending['id'])['execution_state'] == 'NOT_STARTED'
            assert sink.attempts_count() == 2


def test_denied_stellar_response_does_not_execute_or_create_control_effect(env, tmp_path):
    with MockStellarReceiver(tmp_path/'stellar.sqlite', secret=SECRET, tenant='tenant-isolated') as sink:
        settings, core, profile, token, action = configured_stellar(env, sink.url)
        with run_loopback_grant(env.app) as origin, GrantClient(origin, token, dev_loopback=True) as producer:
            pending = create(producer, profile, action, ident='denied-alert-1')
            approve(env, core, pending, outcome='DENIED')
            Worker(env.db, settings).tick(limit=10)
            rows = sink.readback(pending['id'])
            assert len(rows) == 1 and rows[0]['state'] == 'DENIED'
            assert producer.read(pending['id'])['execution_state'] == 'NOT_STARTED'
            assert env.api.get('/api/v1/admin/notification-destinations').status_code == 403


def test_grant_webhook_lost_ack_recovers_without_double_receiver_record(env, tmp_path):
    with MockStellarReceiver(tmp_path/'stellar-ack-loss.sqlite', secret=SECRET, tenant='tenant-isolated') as sink:
        settings, core, profile, token, action = configured_stellar(env, sink.url)
        sink.fail_after_commit_once(503)
        with run_loopback_grant(env.app) as origin, GrantClient(origin, token, dev_loopback=True) as producer:
            request = create(producer, profile, action, ident='ack-lost-after-write')
            approve(env, core, request)
            worker = Worker(env.db, settings)
            assert worker.tick(limit=10) >= 1
            pending = webhook_row(env, request['id'])
            assert pending['state'] == 'PENDING' and pending['attempts'] == 1
            first = sink.readback(request['id'])
            assert len(first) == 1
            with env.db.transaction() as conn:
                conn.execute('UPDATE outbox SET available_at=0 WHERE id=?', (pending['id'],))
            assert worker.tick(limit=10) >= 1
            done = webhook_row(env, request['id'])
            assert done['state'] == 'DELIVERED' and done['attempts'] == 2
            assert done['id'] == pending['id']
            assert sink.readback(request['id']) == first
            assert sink.attempts_count() == 2
            assert producer.read(request['id'])['execution_state'] == 'NOT_STARTED'
