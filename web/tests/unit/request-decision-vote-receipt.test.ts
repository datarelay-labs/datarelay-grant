import { describe, expect, it } from 'vitest';
import { recordDecisionThenRead } from '../../src/request_decision_receipt';
import type { RequestRow } from '../../src/types';
import type { RequestDecisionReview } from '../../src/request_decision_review';

function row(partial: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'approval-test', integration_id: 'test', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'seat-a', title: 'Authorize change',
    reason: '', action: { kind: 'service.deploy', target: 'test-node', parameters: {} },
    action_hash: 'immutable-fingerprint', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 9, created_at: 1, deadline: 3000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING',
    approval_plan: { mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2 },
    decisions: [],
    ...partial,
  };
}
function review(
  choice: RequestDecisionReview['choice'] = 'APPROVED',
  partial: Partial<RequestDecisionReview> = {},
): RequestDecisionReview {
  return {
    requestId: row().id, actorId: 'seat-a', representedSeatId: 'seat-a',
    revision: 8, actionHash: 'immutable-fingerprint',
    actionKind: 'service.deploy', actionTarget: 'test-node',
    requestTitle: 'Authorize change', externalId: 'approval-test',
    actionParametersJson: '{}',
    choice, reason: 'Reviewed maintenance', ...partial,
  };
}
function vote(actor: string, decision: string, reason = 'Reviewed maintenance') {
  return { actor_id: actor, decision, reason, decided_at: 100 };
}
function post(
  result: RequestRow, intent: RequestDecisionReview,
  read = async () => { throw new Error('read offline'); },
) {
  return recordDecisionThenRead(async () => result, read, intent);
}

describe('B1 exact human decision outcome proof without re-POST', () => {
  it('accepts a partial ALL-quorum approval only with the selected assigned-seat vote', async () => {
    const result = row({ state: 'AWAITING', decisions: [vote('seat-a', 'APPROVED')] });
    expect(await post(result, review())).toEqual({ row: result, refreshed: false });
  });

  it('accepts an attributed delegated vote under the represented approval seat', async () => {
    const result = row({ decisions: [vote('seat-a', 'APPROVED')] });
    expect(await post(result, review('APPROVED', {
      actorId: 'delegate-one', representedSeatId: 'seat-a',
    }))).toEqual({ row: result, refreshed: false });
  });

  it('accepts actual Hold, Deny and requester cancellation with separate outcomes', async () => {
    const hold = row({ state: 'HELD', decisions: [vote('seat-a', 'HELD')] });
    const denied = row({ state: 'DENIED', decision: 'DENIED',
      decisions: [vote('seat-a', 'DENIED')] });
    const cancelled = row({ state: 'CANCELLED', decisions: [] });
    expect((await post(hold, review('HELD'))).row.state).toBe('HELD');
    expect((await post(denied, review('DENIED'))).row.state).toBe('DENIED');
    expect((await post(cancelled, review('CANCELLED', { actorId: 'requester' }))).row.state).toBe('CANCELLED');
  });

  it('does not accept a final APPROVED state caused by another approval seat', async () => {
    const unrelated = row({ state: 'APPROVED', decision: 'APPROVED',
      decisions: [vote('seat-b', 'APPROVED')] });
    await expect(post(unrelated, review())).rejects.toThrow('DECISION_POST_OUTCOME_UNVERIFIED');
  });

  it('rejects a missing, different, or changed selected-seat decision and reason', async () => {
    for (const decisions of [
      undefined, [],
      [vote('seat-a', 'HELD')],
      [vote('seat-a', 'APPROVED', 'Different recorded reason')],
      [vote('seat-b', 'APPROVED')],
    ]) {
      await expect(post(row({ decisions }), review()))
        .rejects.toThrow('DECISION_POST_OUTCOME_UNVERIFIED');
    }
  });

  it('does not accept a cancellation response which remains active', async () => {
    await expect(post(row({ state: 'AWAITING' }), review('CANCELLED', { actorId: 'requester' })))
      .rejects.toThrow('DECISION_POST_OUTCOME_UNVERIFIED');
  });

  it('rejects a stale same-revision vote receipt even if the selected vote appears', async () => {
    await expect(post(row({ revision: 8, decisions: [vote('seat-a', 'APPROVED')] }), review()))
      .rejects.toThrow('DECISION_POST_PROJECTION_MISMATCH');
  });

  it('rejects an inconsistent Hold/Denied outcome even with matching seat vote', async () => {
    await expect(post(row({ state: 'AWAITING', decisions: [vote('seat-a', 'HELD')] }),
      review('HELD'))).rejects.toThrow('DECISION_POST_OUTCOME_UNVERIFIED');
    await expect(post(row({ state: 'APPROVED', decisions: [vote('seat-a', 'DENIED')] }),
      review('DENIED'))).rejects.toThrow('DECISION_POST_OUTCOME_UNVERIFIED');
  });

  it('keeps an accepted POST receipt if a newer GET loses evidence of the selected vote', async () => {
    const acknowledged = row({ decisions: [vote('seat-a', 'APPROVED')] });
    const unrelatedRead = row({ revision: 10, state: 'APPROVED',
      decisions: [vote('seat-b', 'APPROVED')] });
    expect(await post(acknowledged, review(), async () => unrelatedRead))
      .toEqual({ row: acknowledged, refreshed: false });
  });
});
