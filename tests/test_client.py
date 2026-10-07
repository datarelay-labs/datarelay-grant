import hashlib
import hmac
import json

import httpx
import pytest

from grant.client import GrantClient, GrantClientError, verify_outcome
from grant.core import fingerprint
from grant.models import Action


def test_client_claim_hashes_the_consumers_actual_action_not_an_event():
    calls=[]
    action=Action(kind='test.operation',target='test-target')
    def handler(request):
        calls.append(request)
        return httpx.Response(200,json={'committed':True,'replay':True})
    with GrantClient('https://grant.example.invalid','test-only',transport=httpx.MockTransport(handler)) as client:
        result=client.claim('00000000-0000-0000-0000-000000000001','durable-operation-id',action)
    assert result['replay'] is True
    assert len(calls)==1
    assert json.loads(calls[0].content)['action_hash']==fingerprint(action.model_dump())


def test_client_does_not_retry_ambiguous_claim():
    calls=[]
    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout('simulated lost reply')
    with GrantClient('https://grant.example.invalid','test-only',transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(GrantClientError,match='TRANSPORT_AMBIGUOUS'):
            client.claim('00000000-0000-0000-0000-000000000001','operation-id',Action(kind='test.operation',target='t'))
    assert len(calls)==1


def test_client_rejects_remote_plain_http():
    with pytest.raises(ValueError):
        GrantClient('http://remote.example.invalid','test-only')


def test_signed_outcome_verification_and_tampering():
    event={'event_type':'grant.approval.outcome','event_id':'event-1','state':'APPROVED'}
    body=json.dumps(event).encode(); secret='isolated-test-secret'
    headers={'X-Grant-Event-Id':'event-1','X-Grant-Timestamp':'1000','X-Grant-Signature':'sha256='+hmac.new(secret.encode(),b'1000.'+body,hashlib.sha256).hexdigest()}
    assert verify_outcome(secret,headers,body,now=1001)==event
    with pytest.raises(GrantClientError):
        verify_outcome(secret,headers,body+b' ',now=1001)
    with pytest.raises(GrantClientError,match='TIME_WINDOW'):
        verify_outcome(secret,headers,body,now=2000)
    with pytest.raises(GrantClientError):
        verify_outcome(secret,{**headers,'X-Grant-Event-Id':'other'},body,now=1001)
