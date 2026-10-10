import { describe, expect, it } from 'vitest';
import { submitReviewedCollaboration, type CollaborationReview } from '../../src/collaboration';
import type { RequestRow } from '../../src/types';

function request(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'DEMO-1', integration_id: 'demo', profile_id: 'policy',
    requester_id: 'requester', approver_id: 'reviewer',
    title: 'Need information', reason: '',
    action: { kind: 'service.deploy', target: 'test-only', parameters: {} },
    action_hash: 'hash', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 4, created_at: 100, deadline: 1000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING', ...overrides,
  };
}

function reviewed(
  overrides: Partial<CollaborationReview> = {},
): CollaborationReview {
  return {
    requestId: request().id, revision: 4, actorId: 'reviewer',
    kind: 'REQUEST_INFO', body: 'Provide CRQ reference',
    ...overrides,
  };
}

describe('Grant collaboration successful POST receipt is immediately authoritative', () => {
  it('posts exactly once and projects returned request without a mandatory second GET', async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const projections: RequestRow[] = [];
    const saved = request({
      revision: 5, collaboration_state: 'INFO_REQUESTED',
      comments: [{ id: 'new', author_id: 'reviewer', kind: 'REQUEST_INFO',
        body: 'Provide CRQ reference', created_at: 110 }],
    });
    const result = await submitReviewedCollaboration(
      reviewed(),
      async (path, method, body) => {
        calls.push({ path, method, body });
        return saved;
      },
      (row) => projections.push(row),
    );
    expect(calls).toEqual([{
      path: '/requests/' + saved.id + '/comments',
      method: 'POST',
      body: { kind: 'REQUEST_INFO', body: 'Provide CRQ reference', expected_revision: 4 },
    }]);
    expect(projections).toEqual([saved]);
    expect(result).toBe(saved);
    expect(result.collaboration_state).toBe('INFO_REQUESTED');
    expect(result.comments).toHaveLength(1);
  });

  it('a successful information response directly resumes the presented request state', async () => {
    const saved = request({ revision: 7, collaboration_state: 'OPEN' });
    let projected: RequestRow | null = null;
    await submitReviewedCollaboration(
      reviewed({ kind: 'INFO_RESPONSE', revision: 6, actorId: 'requester', body: 'CRQ-001' }),
      async () => saved,
      (row) => { projected = row; },
    );
    expect(projected).toBe(saved);
    expect(projected?.collaboration_state).toBe('OPEN');
  });

  it('does not apply any receipt or retry when the POST fails', async () => {
    let postCount = 0;
    let projectionCount = 0;
    await expect(submitReviewedCollaboration(
      reviewed(),
      async () => { postCount++; throw new Error('AMBIGUOUS_COMMENT_POST'); },
      () => { projectionCount++; },
    )).rejects.toThrow('AMBIGUOUS_COMMENT_POST');
    expect(postCount).toBe(1);
    expect(projectionCount).toBe(0);
  });

  it('encodes a request identifier without changing a reviewed comment or revision', async () => {
    const values: { path: string; body: unknown }[] = [];
    await submitReviewedCollaboration(
      reviewed({ requestId: 'opaque/segment with space', kind: 'QUESTION',
        body: '<img src=x onerror=alert(1)>', revision: 8 }),
      async (path, _method, body) => {
        values.push({ path, body });
        return request({ revision: 9 });
      },
      () => undefined,
    );
    expect(values).toEqual([{
      path: '/requests/opaque%2Fsegment%20with%20space/comments',
      body: {
        kind: 'QUESTION', body: '<img src=x onerror=alert(1)>',
        expected_revision: 8,
      },
    }]);
  });

  it('never claims the updated notification or approval state as an external execution', async () => {
    const saved = request({ revision: 5, execution_state: 'UNKNOWN',
      delivery_state: 'FAILED', collaboration_state: 'CHANGES_REQUESTED' });
    const result = await submitReviewedCollaboration(
      reviewed({ kind: 'REQUEST_CHANGES', body: 'Review target' }),
      async () => saved,
      () => undefined,
    );
    expect(result.execution_state).toBe('UNKNOWN');
    expect(result.delivery_state).toBe('FAILED');
    expect(result.collaboration_state).toBe('CHANGES_REQUESTED');
    expect(result.execution_result).toBeNull();
  });
});
