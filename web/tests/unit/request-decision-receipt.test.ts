import { describe, expect, it } from 'vitest';
import { recordDecisionThenRead } from '../../src/request_decision_receipt';
import type { RequestRow } from '../../src/types';

function request(revision: number, state: string): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'example', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'reviewer', title: 'Demo',
    reason: '', action: { kind: 'service.test', target: 'test', parameters: {} },
    action_hash: 'hash', source: {}, state,
    collaboration_state: 'OPEN', decision: null, decision_actor: null, decision_at: null,
    revision, created_at: 1, deadline: 3000, grant_until: null,
    predecessor_id: null, execution_id: null, execution_state: 'NOT_STARTED',
    execution_result: null, delivery_state: 'PENDING',
  };
}

describe('No ambiguous double submit after an explicit request decision', () => {
  it('uses successful server POST receipt when subsequent read fails', async () => {
    const calls: string[] = [];
    const receipt = request(9, 'APPROVED');
    const result = await recordDecisionThenRead(
      async () => { calls.push('POST'); return receipt; },
      async () => { calls.push('GET'); throw new Error('offline read'); },
    );
    expect(calls).toEqual(['POST', 'GET']);
    expect(result).toEqual({ row: receipt, refreshed: false });
    expect(result.row.state).toBe('APPROVED');
  });

  it('prefers the authoritative fresh read when it is not older than the receipt', async () => {
    const receipt = request(9, 'HELD');
    const newer = request(10, 'APPROVED');
    const result = await recordDecisionThenRead(
      async () => receipt, async () => newer,
    );
    expect(result).toEqual({ row: newer, refreshed: true });
  });

  it('never replaces the server POST receipt with an older or unrelated GET row', async () => {
    const receipt = request(9, 'APPROVED');
    const older = request(8, 'AWAITING');
    const unrelated = { ...request(10, 'APPROVED'), id: 'other-request' };
    expect(await recordDecisionThenRead(
      async () => receipt, async () => older,
    )).toEqual({ row: receipt, refreshed: false });
    expect(await recordDecisionThenRead(
      async () => receipt, async () => unrelated,
    )).toEqual({ row: receipt, refreshed: false });
  });

  it('propagates failed or ambiguous POST without GET or any retry', async () => {
    let posts = 0;
    let reads = 0;
    await expect(recordDecisionThenRead(
      async () => { posts++; throw new Error('POST_RESULT_UNKNOWN'); },
      async () => { reads++; return request(5, 'AWAITING'); },
    )).rejects.toThrow('POST_RESULT_UNKNOWN');
    expect(posts).toBe(1);
    expect(reads).toBe(0);
  });

  it('treats a successful cancellation the same as a human vote response', async () => {
    const canceled = request(12, 'CANCELLED');
    const result = await recordDecisionThenRead(
      async () => canceled, async () => { throw new Error('lost read'); },
    );
    expect(result).toEqual({ row: canceled, refreshed: false });
  });
});
