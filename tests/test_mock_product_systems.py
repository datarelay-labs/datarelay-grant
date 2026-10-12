"""Separate product-side SQLite ledgers and signed Stellar-like HTTP receiver."""

import hashlib
import hmac
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import pytest

from tests.support.mock_product_systems import (
    MockControlLedger,
    MockProductSafetyError,
    MockStellarReceiver,
)


def test_control_durable_simulation_runs_once_with_unchanged_checkpoint(tmp_path):
    p = MockControlLedger(tmp_path / 'control.sqlite', log_id=42, route_id=7, destination_id=9)
    assert p.reserve('log42-route7-dest9', 'ex-control-42').state == 'RESERVED'
    initial = p.checkpoint()
    assert p.apply_once('log42-route7-dest9', 'ex-control-42') is True
    assert p.apply_once('log42-route7-dest9', 'ex-control-42') is False
    assert p.read_effect_count('log42-route7-dest9') == 1
    assert p.checkpoint() == initial
    actual = p.independent_readback('log42-route7-dest9')
    assert actual['log_id'] == 42 and actual['route_id'] == 7
    assert actual['destination_id'] == 9
    assert actual['dry_run'] is False
    assert actual['outcome'] == 'delivered'
    assert actual['event_count'] == 1
    assert uuid.UUID(actual['replay_run_id'])
    assert p.reserve('log42-route7-dest9', 'ex-control-42').state == 'EFFECT_APPLIED'


def test_control_unknown_or_alien_binding_never_runs(tmp_path):
    p = MockControlLedger(tmp_path / 'control.sqlite', log_id=42, route_id=7, destination_id=9)
    assert p.reserve('key-a', 'ex-a').state == 'RESERVED'
    p.mark_unknown('key-a', 'ex-a')
    assert p.apply_once('key-a', 'ex-a') is False
    assert p.read_effect_count('key-a') == 0
    with pytest.raises(MockProductSafetyError):
        p.reserve('key-a', 'different-execution')
    with pytest.raises(MockProductSafetyError):
        p.apply_once('unreserved-key', 'ex-a')
    assert p.read_effect_count('key-a') == 0


def signed_event(secret, event, timestamp=None):
    encoded = json.dumps(event, sort_keys=True, separators=(',', ':')).encode()
    now = str(int(time.time()) if timestamp is None else timestamp)
    headers = {
        'X-Grant-Event-Id': event['event_id'],
        'X-Grant-Timestamp': now,
        'X-Grant-Signature': 'sha256=' + hmac.new(secret.encode(), now.encode() + b'.' + encoded, hashlib.sha256).hexdigest(),
    }
    return headers, encoded


def outcome(event_id=None, request_id=None, revision=2, state='APPROVED', tenant='t-1'):
    return {
        'event_type': 'grant.approval.outcome',
        'event_id': event_id or str(uuid.uuid4()),
        'request_id': request_id or str(uuid.uuid4()),
        'state_revision': revision, 'state': state,
        'source': {'product': 'stellar', 'tenant_id': tenant, 'case_id': 'case-17', 'alert_id': 'alert-31'},
    }


def test_stellar_signed_receiver_persists_once_and_rejects_cross_tenant(tmp_path):
    with MockStellarReceiver(tmp_path / 'stellar.sqlite', secret='fixture-only-secret', tenant='t-1') as xdr:
        assert urlsplit(xdr.url).hostname == '127.0.0.1'
        event = outcome()
        headers, body = signed_event('fixture-only-secret', event)
        accepted = httpx.post(xdr.url, headers=headers, content=body, timeout=5)
        assert accepted.status_code == 202
        assert httpx.post(xdr.url, headers=headers, content=body, timeout=5).status_code == 200
        assert len(xdr.readback(event['request_id'])) == 1
        old = outcome(request_id=event['request_id'], revision=1, state='HELD')
        h, b = signed_event('fixture-only-secret', old)
        assert httpx.post(xdr.url, headers=h, content=b, timeout=5).status_code == 202
        assert len(xdr.readback(event['request_id'])) == 1
        evil = outcome(tenant='foreign-tenant')
        h, b = signed_event('fixture-only-secret', evil)
        assert httpx.post(xdr.url, headers=h, content=b, timeout=5).status_code == 422
        assert not xdr.readback(evil['request_id'])
        corrupted = httpx.post(xdr.url, headers=headers, content=body + b' ', timeout=5)
        assert corrupted.status_code == 401
        assert xdr.attempts_count() == 5


def test_stellar_receiver_recovery_after_503(tmp_path):
    with MockStellarReceiver(tmp_path / 'stellar.sqlite', secret='fixture-only-secret', tenant='t-1') as sink:
        sink.fail_next(503)
        event = outcome()
        headers, body = signed_event('fixture-only-secret', event)
        assert httpx.post(sink.url, headers=headers, content=body, timeout=5).status_code == 503
        assert not sink.readback(event['request_id'])
        assert httpx.post(sink.url, headers=headers, content=body, timeout=5).status_code == 202
        assert len(sink.readback(event['request_id'])) == 1


def test_product_ledger_survives_reopen_and_concurrent_duplicate_attempts(tmp_path):
    path = tmp_path / 'persistent-control.sqlite'
    ledger = MockControlLedger(path, log_id=42, route_id=7, destination_id=9)
    ledger.reserve('operation-persisted', 'execution-101')
    with ThreadPoolExecutor(max_workers=8) as threads:
        attempts = list(threads.map(
            lambda _: ledger.apply_once('operation-persisted', 'execution-101'),
            range(12),
        ))
    assert attempts.count(True) == 1
    assert attempts.count(False) == 11
    reopened = MockControlLedger.reopen(path, log_id=42, route_id=7, destination_id=9)
    assert reopened.reserve('operation-persisted', 'execution-101').state == 'EFFECT_APPLIED'
    assert reopened.read_effect_count('operation-persisted') == 1
    assert reopened.apply_once('operation-persisted', 'execution-101') is False
    assert reopened.checkpoint() == {'offset': 100}
    with pytest.raises(MockProductSafetyError):
        MockControlLedger.reopen(path, log_id=42, route_id=7, destination_id=10)
    with pytest.raises(MockProductSafetyError):
        MockControlLedger.reopen(tmp_path / 'missing.sqlite', log_id=42, route_id=7, destination_id=9)


def test_stellar_same_revision_conflicting_event_never_replaces_receiver_readback(tmp_path):
    with MockStellarReceiver(tmp_path / 'stellar.sqlite', secret='fixture-only-secret', tenant='t-1') as receiver:
        approved = outcome()
        headers, body = signed_event('fixture-only-secret', approved)
        assert httpx.post(receiver.url, headers=headers, content=body, timeout=5).status_code == 202
        conflicting = outcome(request_id=approved['request_id'], revision=2, state='DENIED')
        headers, body = signed_event('fixture-only-secret', conflicting)
        assert httpx.post(receiver.url, headers=headers, content=body, timeout=5).status_code == 409
        assert receiver.readback(approved['request_id'])[0]['state'] == 'APPROVED'


def test_test_dataset_is_explicitly_mock_only_and_contains_no_live_urls():
    path = Path(__file__).parent / 'fixtures/mock-integration-scenarios.json'
    content = path.read_text()
    manifest = json.loads(content)
    assert manifest['schema_version'] == 1
    assert manifest['target_systems_connected'] is False
    assert manifest['test_scope'] == 'ISOLATED_LOOPBACK_AND_DISPOSABLE_SQLITE_ONLY'
    assert manifest['control']['action']['kind'] == 'datarelay.control.delivery_log.replay'
    assert manifest['stellar']['source']['tenant_id'] == 'tenant-isolated'
    assert manifest['stellar']['accepted_grant_event_type'] == 'grant.approval.outcome'
    assert '://' not in content
    assert all(marker not in content.casefold() for marker in ('api_key', 'password', 'private_key', 'access_token'))
