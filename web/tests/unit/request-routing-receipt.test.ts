import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestAdminControls } from '../../src/request_admin';
import {
  submitReviewedRequestRouting,
  type AdminRoutingIntent,
} from '../../src/request_routing_receipt';
import type { RequestRow } from '../../src/types';

function request(changes: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'sandbox', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'seat-a',
    title: 'Production-safe test', reason: 'change window',
    action: { kind: 'service.restart', target: 'test-unit', parameters: {} },
    action_hash: 'immutable-fingerprint', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 7, created_at: 100, deadline: 3000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING',
    approval_plan: { mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2 },
    decisions: [], ...changes,
  };
}
function reassign(): AdminRoutingIntent {
  return {
    kind: 'reassignment', requestId: request().id,
    actionHash: 'immutable-fingerprint', revision: 7,
    from: 'seat-a', to: 'seat-c', reason: 'On call rotation',
  };
}
function escalate(): AdminRoutingIntent {
  return {
    kind: 'escalation', requestId: request().id,
    actionHash: 'immutable-fingerprint', revision: 7,
    target: 'group:reviewers', afterSeconds: 3600,
  };
}
function notCalled() {
  throw new Error('unexpected routing call');
}

describe('B1 RequestDetail routing receipt and independent readback', () => {
  it('adopts successful reassignment POST response without any second GET', async () => {
    const calls: string[] = [];
    const updated = request({ revision: 8, approver_id: 'seat-c',
      approval_plan: { mode: 'ALL', members: ['seat-c', 'seat-b'], required: 2 } });
    const result = await submitReviewedRequestRouting(
      reassign(), request(),
      async () => { calls.push('POST escalation'); throw new Error('wrong kind'); },
      async (payload) => {
        calls.push('POST reassign');
        expect(payload).toEqual({
          from_approver_id: 'seat-a', to_approver_id: 'seat-c',
          reason: 'On call rotation', expected_revision: 7,
        });
        return updated;
      },
      async () => { calls.push('GET'); throw new Error('GET unavailable'); },
    );
    expect(calls).toEqual(['POST reassign']);
    expect(result).toEqual({ status: 'updated', row: updated });
  });

  it('a successful escalation acknowledges routing even when optional readback GET fails', async () => {
    const calls: string[] = [];
    const result = await submitReviewedRequestRouting(
      escalate(), request(),
      async (intent) => {
        calls.push('POST escalation');
        expect(intent.target).toBe('group:reviewers');
        return { request_id: request().id, revision: 8 };
      },
      async () => notCalled(),
      async () => { calls.push('GET'); throw new Error('offline after commit'); },
    );
    expect(calls).toEqual(['POST escalation', 'GET']);
    expect(result).toEqual({ status: 'readback_unavailable', row: null });
  });

  it('uses one fresh detail GET after a committed escalation and adopts its revision', async () => {
    const fresh = request({ revision: 8 });
    const result = await submitReviewedRequestRouting(
      escalate(), request(),
      async () => ({ request_id: request().id, revision: 8 }),
      async () => notCalled(),
      async () => fresh,
    );
    expect(result).toEqual({ status: 'updated', row: fresh });
  });

  it('stale review ID/revision/action state cannot POST either admin mutation', async () => {
    let posts = 0, reads = 0;
    const refused: RequestRow[] = [
      request({ id: 'another-request' }),
      request({ revision: 8 }),
      request({ action_hash: 'other-fingerprint' }),
      request({ state: 'APPROVED' }), request({ execution_id: 'committed' }),
    ];
    for (const current of refused) {
      await expect(submitReviewedRequestRouting(
        reassign(), current,
        async () => { posts++; throw new Error('not allowed'); },
        async () => { posts++; throw new Error('not allowed'); },
        async () => { reads++; return request(); },
      )).rejects.toThrow('ROUTING_CHANGED_REVIEW_REQUIRED');
    }
    expect(posts).toBe(0); expect(reads).toBe(0);
  });

  it('rejects selecting already-decided/from-no-longer-assigned/replacement-in-plan', async () => {
    let posts = 0;
    const changed: Partial<RequestRow>[] = [
      { approval_plan: { mode: 'ALL', members: ['seat-b'], required: 1 } },
      { decisions: [{ actor_id: 'seat-a', decision: 'HELD', reason: '', decided_at: 100 }] },
      { requester_id: 'seat-c' },
    ];
    for (const partial of changed) {
      await expect(submitReviewedRequestRouting(
        reassign(), request(partial),
        async () => { posts++; return { request_id: request().id, revision: 8 }; },
        async () => { posts++; return request({ revision: 8 }); },
        async () => request(),
      )).rejects.toThrow('ROUTING_CHANGED_REVIEW_REQUIRED');
    }
    await expect(submitReviewedRequestRouting(
      { ...reassign(), to: 'seat-b' }, request(),
      async () => notCalled(), async () => { posts++; return request(); },
      async () => request(),
    )).rejects.toThrow('ROUTING_CHANGED_REVIEW_REQUIRED');
    expect(posts).toBe(0);
  });

  it('a successful POST with invalid or stale projection reports readback unavailable, not false failure', async () => {
    const output = await submitReviewedRequestRouting(
      reassign(), request(),
      async () => notCalled(),
      async () => request({ revision: 7 }),
      async () => { throw new Error('GET failed'); },
    );
    expect(output).toEqual({ status: 'readback_unavailable', row: null });
  });

  it('does not retry a POST with ambiguous outcome', async () => {
    let posts = 0, reads = 0;
    await expect(submitReviewedRequestRouting(
      reassign(), request(),
      async () => notCalled(),
      async () => { posts++; throw new Error('ROUTING_POST_UNKNOWN'); },
      async () => { reads++; return request(); },
    )).rejects.toThrow('ROUTING_POST_UNKNOWN');
    expect(posts).toBe(1); expect(reads).toBe(0);
  });

  it('mounts reviewed routing controls without a direct mutation button', () => {
    const html = renderToStaticMarkup(createElement(RequestAdminControls, {
      row: request(),
      onReload: async () => undefined,
      onRecorded: () => undefined,
      onReadbackUnavailable: () => undefined,
    }));
    expect(html).toContain('Escalation');
    expect(html).toContain('Review escalation');
    expect(html).toContain('Reassign approver');
    expect(html).toContain('Review reassignment');
    expect(html).not.toContain('Confirm routing change</button>');
    expect(html).not.toContain('Execute</button>');
  });

  it('refuses invalid escalation payload without POST or GET', async () => {
    let mutation = 0;
    await expect(submitReviewedRequestRouting(
      { ...escalate(), afterSeconds: 2 }, request(),
      async () => { mutation++; return { request_id: request().id, revision: 8 }; },
      async () => { mutation++; return request(); },
      async () => request(),
    )).rejects.toThrow('ROUTING_CHANGED_REVIEW_REQUIRED');
    expect(mutation).toBe(0);
  });
});
