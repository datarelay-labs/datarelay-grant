import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RequestCollaboration, allowedCollaborationPurposes,
  prepareCollaborationReview, isCurrentCollaborationReview,
} from '../../src/collaboration';
import type { RequestRow, User } from '../../src/types';

const now = 200;
const approver: User = {
  id: 'seat-a', username: 'reviewer', email: 'a@example.invalid',
  role: 'member', mfa_enabled: false,
};
const requester: User = { ...approver, id: 'requester', username: 'requester' };
const outsider: User = { ...approver, id: 'stranger', username: 'stranger' };

function request(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001', external_id: 'RED-TEST',
    integration_id: 'demo', profile_id: 'policy', requester_id: requester.id,
    approver_id: approver.id, viewer_can_decide: true,
    title: 'Review bounded change', reason: '',
    action: { kind: 'service.test', target: 'isolated', parameters: {} },
    action_hash: 'synthetic', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 4, created_at: 100, deadline: 1000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING', ...overrides,
  };
}

describe('Grant collaboration explicit review of exact pending request', () => {
  it('requires the Review message step before Confirm is offered', () => {
    const html = renderToStaticMarkup(createElement(RequestCollaboration, {
      row: request(), user: approver, onRecorded: () => undefined,
    }));
    expect(html).toContain('Review message');
    expect(html).not.toContain('Confirm message');
    expect(html).not.toContain('Confirm REQUEST_INFO');
  });

  it('binds review to request, revision, purpose and unchanged message content', () => {
    const row = request();
    const review = prepareCollaborationReview(row, approver, 'REQUEST_INFO', 'Need change ticket', now);
    expect(review).toEqual({
      requestId: row.id, revision: 4, actorId: approver.id,
      kind: 'REQUEST_INFO', body: 'Need change ticket',
    });
    expect(isCurrentCollaborationReview(review, row, approver, 'REQUEST_INFO', 'Need change ticket', now)).toBe(true);
    expect(isCurrentCollaborationReview(review, { ...row, revision: 5 }, approver, 'REQUEST_INFO', 'Need change ticket', now)).toBe(false);
    expect(isCurrentCollaborationReview(review, { ...row, id: 'another' }, approver, 'REQUEST_INFO', 'Need change ticket', now)).toBe(false);
    expect(isCurrentCollaborationReview(review, row, approver, 'REQUEST_CHANGES', 'Need change ticket', now)).toBe(false);
    expect(isCurrentCollaborationReview(review, row, approver, 'REQUEST_INFO', 'Need a different ticket', now)).toBe(false);
    expect(isCurrentCollaborationReview(review, row, outsider, 'REQUEST_INFO', 'Need change ticket', now)).toBe(false);
  });

  it('does not retain a reviewed purpose after collaboration or deadline changes', () => {
    const row = request();
    const review = prepareCollaborationReview(row, approver, 'REQUEST_INFO', 'Please explain', now);
    expect(isCurrentCollaborationReview(review, {
      ...row, collaboration_state: 'CHANGES_REQUESTED',
    }, approver, 'REQUEST_INFO', 'Please explain', now)).toBe(false);
    expect(isCurrentCollaborationReview(review, {
      ...row, viewer_can_decide: false,
    }, approver, 'REQUEST_INFO', 'Please explain', now)).toBe(false);
    expect(isCurrentCollaborationReview(review, row, approver, 'REQUEST_INFO', 'Please explain', 1001)).toBe(false);
  });

  it('allows a requester reply only on a current information request, not requester approval', () => {
    const waiting = request({
      collaboration_state: 'INFO_REQUESTED', viewer_can_decide: false,
    });
    expect(allowedCollaborationPurposes(waiting, requester, now)).toContain('INFO_RESPONSE');
    expect(allowedCollaborationPurposes(waiting, requester, now)).not.toContain('REQUEST_INFO');
    expect(allowedCollaborationPurposes(waiting, outsider, now)).not.toContain('INFO_RESPONSE');
    const response = prepareCollaborationReview(waiting, requester, 'INFO_RESPONSE', 'CRQ-123', now);
    expect(response?.kind).toBe('INFO_RESPONSE');
    expect(isCurrentCollaborationReview(response, {
      ...waiting, collaboration_state: 'OPEN',
    }, requester, 'INFO_RESPONSE', 'CRQ-123', now)).toBe(false);
  });

  it('refuses whitespace, oversized content and unsupported purpose before any mutation', () => {
    const row = request();
    expect(prepareCollaborationReview(row, approver, 'COMMENT', '   ', now)).toBeNull();
    expect(prepareCollaborationReview(row, approver, 'COMMENT', 'x'.repeat(2001), now)).toBeNull();
    expect(prepareCollaborationReview(row, outsider, 'REQUEST_CHANGES', 'Not assigned', now)).toBeNull();
    expect(prepareCollaborationReview(row, requester, 'REQUEST_CHANGES', 'Self review', now)).toBeNull();
    expect(prepareCollaborationReview(row, approver, 'COMMENT', '<img src=x onerror=alert(1)>', now)?.body)
      .toBe('<img src=x onerror=alert(1)>');
  });

  it('binds the actor who reviewed the message even when both reviewers qualify', () => {
    const row = request({
      approval_plan: { mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2 },
    });
    const reviewerB: User = { ...approver, id: 'seat-b', username: 'second' };
    const reviewed = prepareCollaborationReview(row, approver, 'COMMENT', 'Check scope', now);
    expect(reviewed).toEqual({
      requestId: row.id, revision: 4, kind: 'COMMENT', body: 'Check scope',
      actorId: approver.id,
    });
    expect(prepareCollaborationReview(row, reviewerB, 'COMMENT', 'Check scope', now))
      .not.toBeNull();
    expect(isCurrentCollaborationReview(
      reviewed, row, reviewerB, 'COMMENT', 'Check scope', now,
    )).toBe(false);
  });

  it('maintains React escaping of existing collaboration evidence', () => {
    const html = renderToStaticMarkup(createElement(RequestCollaboration, {
      row: request({
        comments: [{ id: 'history', author_id: outsider.id, kind: 'COMMENT',
          body: '<img src=x onerror=alert(1)>', created_at: now }],
      }),
      user: approver, onRecorded: () => undefined,
    }));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('Confirm message');
  });
});
