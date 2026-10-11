import { describe, expect, it } from 'vitest';
import { recordDecisionThenRead } from '../../src/request_decision_receipt';
import type { RequestRow } from '../../src/types';
import type { RequestDecisionReview } from '../../src/request_decision_review';

function request(revision: number, state: string): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'example', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'reviewer', title: 'Demo',
    reason: '', action: { kind: 'service.test', target: 'test', parameters: {} },
    action_hash: 'hash', source: {}, state,
    collaboration_state: 'OPEN',
    decision: state === 'APPROVED' ? 'APPROVED' : state === 'DENIED' ? 'DENIED' : null,
    decision_actor: null, decision_at: null,
    decisions: ['APPROVED', 'HELD', 'DENIED'].includes(state)
      ? [{ actor_id: 'reviewer', decision: state, reason: '', decided_at: 100 }] : [],
    revision, created_at: 1, deadline: 3000, grant_until: null,
    predecessor_id: null, execution_id: null, execution_state: 'NOT_STARTED',
    execution_result: null, delivery_state: 'PENDING',
  };
}

describe('No ambiguous double submit after an explicit request decision', () => {
  const reviewed = {
    actorId: 'reviewer', representedSeatId: 'reviewer',
    choice: 'APPROVED', reason: '',
    requestId: request(8, 'AWAITING').id,
    revision: 8,
    actionHash: 'hash',
    actionKind: 'service.test',
    actionTarget: 'test',
  } satisfies RequestDecisionReview;

  it('uses successful server POST receipt when subsequent read fails', async () => {
    const calls: string[] = [];
    const receipt = request(9, 'APPROVED');
    const result = await recordDecisionThenRead(
      async () => { calls.push('POST'); return receipt; },
      async () => { calls.push('GET'); throw new Error('offline read'); },
      reviewed,
    );
    expect(calls).toEqual(['POST', 'GET']);
    expect(result).toEqual({ row: receipt, refreshed: false });
    expect(result.row.state).toBe('APPROVED');
  });

  it('prefers the authoritative fresh read when it is not older than the receipt', async () => {
    const receipt = request(9, 'APPROVED');
    const newer = request(10, 'APPROVED');
    const result = await recordDecisionThenRead(
      async () => receipt, async () => newer,
      reviewed,
    );
    expect(result).toEqual({ row: newer, refreshed: true });
  });

  it('never replaces the server POST receipt with an older or unrelated GET row', async () => {
    const receipt = request(9, 'APPROVED');
    const older = request(8, 'AWAITING');
    const unrelated = { ...request(10, 'APPROVED'), id: 'other-request' };
    expect(await recordDecisionThenRead(
      async () => receipt, async () => older,
      reviewed,
    )).toEqual({ row: receipt, refreshed: false });
    expect(await recordDecisionThenRead(
      async () => receipt, async () => unrelated,
      reviewed,
    )).toEqual({ row: receipt, refreshed: false });
  });

  it('propagates failed or ambiguous POST without GET or any retry', async () => {
    let posts = 0;
    let reads = 0;
    await expect(recordDecisionThenRead(
      async () => { posts++; throw new Error('POST_RESULT_UNKNOWN'); },
      async () => { reads++; return request(5, 'AWAITING'); },
      reviewed,
    )).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(posts).toBe(1);
    expect(reads).toBe(0);
  });

  it('treats a successful cancellation the same as a human vote response', async () => {
    const canceled = request(12, 'CANCELLED');
    const result = await recordDecisionThenRead(
      async () => canceled, async () => { throw new Error('lost read'); },
      { ...reviewed, actorId: 'requester', representedSeatId: 'requester', choice: 'CANCELLED' },
    );
    expect(result).toEqual({ row: canceled, refreshed: false });
  });

  it('rejects a successful POST response for a different request before any readback', async () => {
    let reads = 0;
    await expect(recordDecisionThenRead(
      async () => ({ ...request(9, 'APPROVED'), id: 'other-request' }),
      async () => { reads++; return request(9, 'APPROVED'); },
      reviewed,
    )).rejects.toThrow('DECISION_POST_PROJECTION_MISMATCH');
    expect(reads).toBe(0);
  });

  it('rejects a successful POST projection with changed immutable action fingerprint or target', async () => {
    for (const change of [
      { action_hash: 'other-hash' },
      { action: { kind: 'service.test', target: 'wrong-resource', parameters: {} } },
      { action: { kind: 'service.other', target: 'test', parameters: {} } },
    ]) {
      await expect(recordDecisionThenRead(
        async () => ({ ...request(9, 'APPROVED'), ...change }),
        async () => request(10, 'APPROVED'),
        reviewed,
      )).rejects.toThrow('DECISION_POST_PROJECTION_MISMATCH');
    }
  });

  it('rejects stale or invalid POST revision rather than claiming human decision recorded', async () => {
    for (const revision of [7, Number.NaN, -1]) {
      await expect(recordDecisionThenRead(
        async () => request(revision, 'APPROVED'),
        async () => request(10, 'APPROVED'),
        reviewed,
      )).rejects.toThrow('DECISION_POST_PROJECTION_MISMATCH');
    }
  });

  it('ignores same-request fresh GET that changes action hash, kind or target', async () => {
    const receipt = request(9, 'APPROVED');
    for (const change of [
      { action_hash: 'other-hash' },
      { action: { kind: 'service.other', target: 'test', parameters: {} } },
      { action: { kind: 'service.test', target: 'elsewhere', parameters: {} } },
    ]) {
      expect(await recordDecisionThenRead(
        async () => receipt,
        async () => ({ ...request(10, 'APPROVED'), ...change }),
        reviewed,
      )).toEqual({ row: receipt, refreshed: false });
    }
  });

  it('retains the valid server receipt when the follow-up GET has invalid revision', async () => {
    const receipt = request(9, 'APPROVED');
    for (const revision of [Number.NaN, -1]) {
      expect(await recordDecisionThenRead(
        async () => receipt,
        async () => request(revision, 'AWAITING'),
        reviewed,
      )).toEqual({ row: receipt, refreshed: false });
    }
  });
});
