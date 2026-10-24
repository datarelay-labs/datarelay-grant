import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  prepareRequestDecisionReview,
  isCurrentRequestDecisionReview,
  RequestDecisionConfirmation,
} from '../../src/request_decision_review';
import type { RequestRow, User } from '../../src/types';

const now = 500;
const reviewer: User = {
  id: 'seat-a', username: 'reviewer', email: 'reviewer@example.invalid',
  role: 'member', mfa_enabled: false,
};
const requester: User = { ...reviewer, id: 'requester', username: 'requester' };
function request(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaa0000-0000-4000-8000-000000000001',
    external_id: 'REVIEW-DEMO', integration_id: 'test', profile_id: 'policy',
    requester_id: requester.id, approver_id: reviewer.id,
    viewer_can_decide: true, title: 'Maintenance change', reason: 'Test',
    action: { kind: 'service.deploy', target: 'isolated-service', parameters: {} },
    action_hash: 'fixed-action-fingerprint', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 4, created_at: 1, deadline: 1000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'PENDING', ...overrides,
  };
}
function confirmMarkup(
  row: RequestRow, actor: User, reason: string,
  review = prepareRequestDecisionReview(row, actor, 'APPROVED', reason, now),
): string {
  return renderToStaticMarkup(createElement(RequestDecisionConfirmation, {
    row, user: actor, reviewed: review, reason, nowSeconds: now,
    busy: false, onConfirm: () => undefined, onBack: () => undefined,
  }));
}

describe('RequestDetail explicit human decision reviewed intent', () => {
  it('binds reviewer, immutable action, request revision and the exact reason before POST', () => {
    const row = request();
    const reviewed = prepareRequestDecisionReview(row, reviewer, 'APPROVED', 'Window confirmed', now);
    expect(reviewed).toEqual({
      requestId: row.id, actorId: reviewer.id, representedSeatId: reviewer.id,
      revision: 4,
      actionHash: row.action_hash, actionKind: row.action.kind,
      actionTarget: row.action.target, requestTitle: row.title,
      externalId: row.external_id, actionParametersJson: '{}',
      choice: 'APPROVED', reason: 'Window confirmed',
    });
    expect(isCurrentRequestDecisionReview(reviewed, row, reviewer, 'Window confirmed', now)).toBe(true);
  });

  it('forces fresh review after reason, choice, request, action or revision changes', () => {
    const row = request();
    const snapshot = prepareRequestDecisionReview(row, reviewer, 'APPROVED', 'one', now);
    for (const altered of [
      { ...row, id: 'other-request' },
      { ...row, revision: 5 },
      { ...row, action_hash: 'new-fingerprint' },
      { ...row, action: { ...row.action, kind: 'service.reboot' } },
      { ...row, action: { ...row.action, target: 'different-service' } },
      { ...row, state: 'APPROVED' },
      { ...row, collaboration_state: 'INFO_REQUESTED' as const },
      { ...row, viewer_can_decide: false },
    ]) {
      expect(isCurrentRequestDecisionReview(snapshot, altered, reviewer, 'one', now)).toBe(false);
    }
    expect(isCurrentRequestDecisionReview(snapshot, row, reviewer, 'two', now)).toBe(false);
    expect(isCurrentRequestDecisionReview(snapshot, row, reviewer, 'one', 1001)).toBe(false);
    expect(prepareRequestDecisionReview(row, reviewer, 'DENIED', 'one', now)?.choice).toBe('DENIED');
    expect(confirmMarkup(row, reviewer, 'changed', snapshot)).toBe('');
  });

  it('shows the exact immutable action parameters and request identity at final Confirm', () => {
    const row = request({
      title: 'Production-safe request preview',
      external_id: 'CASE-314',
      action: {
        kind: 'service.deploy', target: 'isolated-service',
        parameters: { rollout: { batch: 2, dry_run: true }, hosts: ['one', 'two'] },
      },
    });
    const html = confirmMarkup(row, reviewer, 'Approved maintenance');
    for (const value of [
      'Production-safe request preview', 'CASE-314', row.id,
      'Action fingerprint', 'fixed-action-fingerprint',
      'Action parameters', '"rollout"', '"batch"', '2', '"dry_run"',
      '"hosts"', '"one"', '"two"',
      'Reviewing approval seat', 'seat-a',
    ]) expect(html).toContain(value.replaceAll('"', '&quot;'));
    expect(html).not.toContain('Execute</button>');
    expect(html).not.toContain('type="submit"');
  });

  it('invalidates final Confirm when a parameter changes despite unchanged action hash', () => {
    const original = request({
      action: { kind: 'service.deploy', target: 'isolated-service',
        parameters: { rollout: { batch: 2, dry_run: true }, hosts: ['one', 'two'] } },
    });
    const snapshot = prepareRequestDecisionReview(original, reviewer, 'APPROVED', 'reviewed', now);
    expect(snapshot?.actionParametersJson).toContain('"batch": 2');
    const changed = request({
      action: { ...original.action,
        parameters: { rollout: { batch: 3, dry_run: true }, hosts: ['one', 'two'] } },
    });
    expect(changed.action_hash).toBe(original.action_hash);
    expect(isCurrentRequestDecisionReview(snapshot, changed, reviewer, 'reviewed', now)).toBe(false);
    expect(confirmMarkup(changed, reviewer, 'reviewed', snapshot)).toBe('');
  });

  it('requires a new review if the visible request title or external identity changed', () => {
    const original = request();
    const intent = prepareRequestDecisionReview(original, reviewer, 'APPROVED', 'reviewed', now);
    for (const changed of [
      request({ title: 'Reassigned business request' }),
      request({ external_id: 'REVIEW-DIFFERENT' }),
    ]) {
      expect(changed.action_hash).toBe(original.action_hash);
      expect(isCurrentRequestDecisionReview(intent, changed, reviewer, 'reviewed', now))
        .toBe(false);
      expect(confirmMarkup(changed, reviewer, 'reviewed', intent)).toBe('');
    }
  });

  it('escapes untrusted action parameter text in the final confirmation', () => {
    const value = '<img src=x onerror=alert(1)>';
    const row = request({
      action: { kind: 'service.deploy', target: 'isolated-service',
        parameters: { note: value, approved: false } },
    });
    const html = confirmMarkup(row, reviewer, 'reviewed');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('"approved"'.replaceAll('"', '&quot;'));
  });

  it('identifies the acting delegate and represented approval seat at final Confirm', () => {
    const delegate = { ...reviewer, id: 'temporary-delegate' };
    const row = request({ viewer_delegated_for: 'seat-a' });
    const html = confirmMarkup(row, delegate, 'delegated review');
    expect(html).toContain('Acting user');
    expect(html).toContain('temporary-delegate');
    expect(html).toContain('Reviewing approval seat');
    expect(html).toContain('seat-a');
  });

  it('invalidates a prior reviewer confirmation for another valid reviewer', () => {
    const row = request({ approval_plan: {
      mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2,
    } });
    const second: User = { ...reviewer, id: 'seat-b', username: 'other-reviewer' };
    const snapshot = prepareRequestDecisionReview(row, reviewer, 'APPROVED', '', now);
    expect(isCurrentRequestDecisionReview(snapshot, row, second, '', now)).toBe(false);
  });

  it('binds a delegated reviewer to the represented server approval seat', () => {
    const delegate = { ...reviewer, id: 'delegate-one', username: 'substitute' };
    const row = request({
      viewer_delegated_for: 'seat-a',
      approval_plan: { mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2 },
    });
    const submitted = prepareRequestDecisionReview(
      row, delegate, 'APPROVED', 'Reviewed maintenance', now,
    );
    expect(submitted?.actorId).toBe('delegate-one');
    expect(submitted?.representedSeatId).toBe('seat-a');
    expect(isCurrentRequestDecisionReview(
      submitted, row, delegate, 'Reviewed maintenance', now,
    )).toBe(true);
    expect(isCurrentRequestDecisionReview(
      submitted, { ...row, viewer_delegated_for: 'seat-b' },
      delegate, 'Reviewed maintenance', now,
    )).toBe(false);
  });

  it('permits cancellation only to requester/admin while no execution has committed', () => {
    const row = request();
    expect(prepareRequestDecisionReview(row, reviewer, 'CANCELLED', 'stop', now)).toBeNull();
    expect(prepareRequestDecisionReview(row, requester, 'CANCELLED', 'stop', now)?.choice).toBe('CANCELLED');
    const administrator: User = { ...reviewer, id: 'admin', role: 'admin' };
    expect(prepareRequestDecisionReview(row, administrator, 'CANCELLED', 'stop', now)?.actorId).toBe('admin');
    expect(prepareRequestDecisionReview({ ...row, execution_id: 'committed' }, requester, 'CANCELLED', 'stop', now)).toBeNull();
    expect(prepareRequestDecisionReview({ ...row, state: 'DENIED' }, administrator, 'CANCELLED', 'stop', now)).toBeNull();
    expect(prepareRequestDecisionReview(row, requester, 'APPROVED', 'self', now)).toBeNull();
  });

  it('rejects reasons over server 2000-character limit and expired decisions', () => {
    const row = request();
    expect(prepareRequestDecisionReview(row, reviewer, 'DENIED', 'x'.repeat(2001), now)).toBeNull();
    expect(prepareRequestDecisionReview(row, reviewer, 'DENIED', 'x'.repeat(2000), now)?.reason.length).toBe(2000);
    expect(prepareRequestDecisionReview(row, reviewer, 'APPROVED', '', 1001)).toBeNull();
    expect(prepareRequestDecisionReview({ ...row, state: 'CANCELLED' }, reviewer, 'DENIED', '', now)).toBeNull();
  });

  it('renders a named, programmatically focusable review region without submitting the decision', () => {
    const html = confirmMarkup(request(), reviewer, '');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Review exact human decision"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('Confirm approved');
    expect(html).not.toContain('type="submit"');
    expect(confirmMarkup(request(), reviewer, '', null)).toBe('');
  });

  it('renders a visible immutable review with explicit confirmation and no execution CTA', () => {
    const html = confirmMarkup(request(), reviewer, 'Maintenance window');
    for (const item of ['Confirm: APPROVED', 'Operation', 'service.deploy',
      'Target', 'isolated-service', 'Revision', '4', 'Maintenance window',
      'Approval does not itself execute the action', 'Confirm approved', 'Go back']) {
      expect(html).toContain(item);
    }
    expect(html).not.toContain('Execute</button>');
    expect(html).not.toContain('Resend</button>');
    expect(confirmMarkup(request(), reviewer, '', null)).toBe('');
  });

  it('escapes untrusted strings and hides submit when pending review is no longer current', () => {
    const row = request({ action: {
      kind: '<script>alert(1)</script>',
      target: '<img src=x onerror=alert(1)>', parameters: {},
    } });
    const html = confirmMarkup(row, reviewer, '<svg onload=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;svg');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    const snapshot = prepareRequestDecisionReview(row, reviewer, 'APPROVED', 'a', now);
    expect(confirmMarkup({ ...row, revision: 6 }, reviewer, 'a', snapshot)).toBe('');
  });
});
