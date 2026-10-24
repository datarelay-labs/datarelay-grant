import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestEvidence, approvalProgressLabel, approvalWaitingLabel } from '../../src/request_evidence';
import { RequestDeliveryResendConfirmation, createRequestDeliveryResendReview } from '../../src/request_delivery_resend_review';
import type { RequestRow } from '../../src/types';

function request(extra: Partial<RequestRow> = {}): RequestRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    external_id: 'DEMO', integration_id: 'demo', profile_id: 'demo',
    requester_id: 'u1', approver_id: 'u2', title: 'Demo',
    reason: '', action: { kind: 'test', target: 'isolated', parameters: {} },
    action_hash: 'hash', source: {}, state: 'HELD',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 1, created_at: 100, deadline: 10000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'FAILED',
    deliveries: [
      { id: 'failed1', kind: 'email', state: 'FAILED', attempts: 2,
        last_error: 'SMTP unavailable', revision: 1 },
      { id: 'pending2', kind: 'webhook', state: 'PENDING', attempts: 0,
        last_error: null, revision: 1 },
      { id: 'done3', kind: 'email', state: 'DELIVERED', attempts: 1,
        last_error: null, revision: 1 },
    ],
    timeline: [
      { id: 'audit1', at: 102, actor: 'user', action: 'request.created',
        detail: { result: 'waiting' } },
    ],
    ...extra,
  };
}

function markup(row: RequestRow, isAdmin: boolean, busy = false, blockedResendIds: string[] = []): string {
  return renderToStaticMarkup(createElement(RequestEvidence, {
    row, isAdmin, busy, onReviewResend: () => undefined, blockedResendIds,
  }));
}

describe('P0-2C decision-first request activity disclosure', () => {
  it('collapses secondary reviewer/transport/audit context behind one native summary', () => {
    const html = markup(request(), false);
    expect(html).toContain('<details class="grant-activity-disclosure">');
    expect(html).toContain('Activity &amp; supporting evidence');
    expect(html).toContain('Reviewer vote count unavailable');
    expect(html).toContain('3 delivery attempts');
    expect(html).toContain('1 timeline event');
    expect(html).not.toContain('<details class="grant-activity-disclosure" open');
    expect(html.indexOf('Activity &amp; supporting evidence')).toBeLessThan(html.indexOf('Reviewer decisions'));
    expect(html.indexOf('dr-card__title\">Reviewer decisions')).toBeLessThan(html.indexOf('dr-card__title\">Delivery history'));
    expect(html.indexOf('dr-card__title\">Delivery history')).toBeLessThan(html.indexOf('dr-card__title\">Request timeline'));
  });

  it('does not manufacture zero events when the role-scoped server omits a list', () => {
    const html = markup(request({ deliveries: undefined, timeline: undefined, decisions: undefined }), false);
    expect(html).toContain('Reviewer vote count unavailable');
    expect(html).toContain('Delivery count unavailable');
    expect(html).toContain('Timeline count unavailable');
    expect(html).not.toContain('0 recorded votes');
    expect(html).toContain('Reviewer vote list unavailable.');
    expect(html).not.toContain('0 delivery attempts');
    expect(html).not.toContain('0 timeline events');
  });

  it('keeps the existing admin resend/confirmation and audit evidence inside disclosure', () => {
    const html = markup(request({ decisions: [] }), true);
    expect(html).toContain('0 reviewer votes');
    expect(html).toContain('Review resend email');
    expect(html).toContain('Event evidence');
    expect(html).toContain('Recorded events · 1');
    expect(html).toContain('Transport acceptance does not prove external execution.');
  });
});

describe('Grant progressive evidence and resend boundary', () => {
  it('provides collapsed delivery attempts and recorded events with nested audit JSON', () => {
    const html = markup(request(), false);
    expect(html).toContain('Delivery attempts · 3');
    expect(html).toContain('Recorded events · 1');
    expect(html).toContain('Event evidence');
    expect(html).toContain('SMTP unavailable');
    expect(html).toContain('request.created');
    expect(html).toContain('waiting');
    expect(html).not.toContain('<details open=""');
    expect(html).toContain('Transport acceptance does not prove external execution.');
  });

  it('keeps retry controls hidden from member users regardless of delivery state', () => {
    const html = markup(request(), false);
    expect(html).not.toContain('Review resend email');
    expect(html).not.toContain('Review resend webhook');
  });

  it('exposes admin resend only for FAILED; PENDING is already queued', () => {
    const html = markup(request(), true);
    expect(html).toContain('Review resend email');
    expect(html).not.toContain('Review resend webhook');
    expect(html).toContain('Already queued for transport');
    expect(html.match(/Review resend email/g)).toHaveLength(1);
    const failedWebhook = markup(request({ deliveries: [
      { id: 'failed-webhook', kind: 'webhook', state: 'FAILED', attempts: 1,
        last_error: 'Callback unavailable', revision: 1 },
    ] }), true);
    expect(failedWebhook).toContain('Review resend webhook');
    const pendingOnly = markup(request({ deliveries: [
      { id: 'pending-mail', kind: 'email', state: 'PENDING', attempts: 0,
        last_error: null, revision: 1 },
    ] }), true);
    expect(pendingOnly).not.toContain('Review resend email');
    expect(pendingOnly).toContain('Already queued for transport');
  });

  it('uses the existing busy guard on eligible FAILED resend controls only', () => {
    const html = markup(request(), true, true);
    expect(html).toContain('Review resend email');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Review resend webhook');
  });

  it('suppresses repeated delivery review until explicit refreshed evidence', () => {
    const html = markup(request(), true, false, ['failed1']);
    expect(html).not.toContain('Review resend email');
    expect(html).toContain('A resend was requested or attempted');
    expect(html).toContain('Refresh the request before another review');
    expect(html).not.toContain('Review resend webhook');
    expect(html).toContain('Already queued for transport');
  });

  it('renders the explicit confirmation inside Delivery history next to the review action', () => {
    const row = request();
    const intent = createRequestDeliveryResendReview(row, row.deliveries![0]);
    const html = renderToStaticMarkup(createElement(RequestEvidence, {
      row, isAdmin: true, busy: false,
      onReviewResend: () => undefined,
      resendConfirmation: createElement(RequestDeliveryResendConfirmation, {
        row, isAdmin: true, intent, busy: false,
        onConfirm: () => undefined, onCancel: () => undefined,
      }),
    }));
    expect(html).toContain('Confirm notification resend');
    expect(html.indexOf('Delivery history')).toBeLessThan(html.indexOf('Confirm notification resend'));
    expect(html.indexOf('Confirm notification resend')).toBeLessThan(html.indexOf('Delivery attempts'));
    expect(html).toContain('Review resend email');
  });

  it('can show an empty history without fabricating evidence or exposing actions', () => {
    const html = markup(request({ deliveries: [], timeline: [] }), true);
    expect(html).toContain('Delivery attempts · 0');
    expect(html).toContain('Recorded events · 0');
    expect(html).not.toContain('request.created');
    expect(html).not.toContain('Review resend email</button>');
    expect(html).not.toContain('Review resend webhook</button>');
  });
});


describe('G-CI reviewer history is visible but never self-asserts identity or execution', () => {
  it('shows the existing server-authorized current seat votes without inventing a person', () => {
    const item = request({
      state: 'HELD',
      approval_plan: { mode: 'ALL', group_id: 'test-group', members: ['seat-a', 'seat-b'], required: 2 },
      approval_progress: {
        mode: 'ALL', approved_count: 1, required_count: 2, total_members: 2,
        waiting_approver_ids: ['seat-a'], waiting_approvers: [{ id: 'seat-a', username: 'First reviewer' }],
        group_name: 'Operations reviewers', waiting_on: 'APPROVERS',
      },
      decisions: [
        { actor_id: 'seat-a', decision: 'HELD', reason: 'Need details', decided_at: 105 },
        { actor_id: 'seat-b', decision: 'APPROVED', reason: 'Reviewed', decided_at: 107 },
      ],
    });
    const html = markup(item, false);
    expect(html).toContain('Reviewer decisions');
    expect(html).toContain('1 of 2 approved');
    expect(html).toContain('Approval seat 1');
    expect(html).toContain('Approval seat 2');
    expect(html).toContain('Need details');
    expect(html).toContain('Reviewed');
    expect(html).toContain('Current seat votes');
    expect(html).toContain('not proof of the person');
    expect(html).toContain('Request timeline');
    expect(html).not.toContain('Review resend email');
  });

  it('does not turn an empty vote record into a decision or successful execution', () => {
    const html = markup(request({ decisions: [], state: 'AWAITING' }), false);
    expect(html).toContain('No reviewer decisions recorded');
    expect(html).toContain('not itself authorization to execute');
    expect(html).not.toContain('Execution succeeded');
  });
});


describe('Approval progress must not be synthesized from vote records', () => {
  const recorded = [
    { actor_id: 'former-reviewer', decision: 'APPROVED', reason: '', decided_at: 100 },
    { actor_id: 'seat-b', decision: 'APPROVED', reason: '', decided_at: 110 },
  ];

  it('marks missing server quorum as unavailable when a former reviewer is recorded', () => {
    const html = markup(request({
      state: 'AWAITING',
      approval_plan: { mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2 },
      decisions: recorded,
    }), false);
    expect(html).toContain('Approval progress unavailable');
    expect(html).toContain('2 recorded votes');
    expect(html).not.toContain('2 of 2 approved');
    expect(html).toContain('Recorded reviewer vote');
    expect(html).not.toContain('Execution succeeded');
  });

  it('does not invent one-seat approval from a legacy vote without a current plan', () => {
    const html = markup(request({
      state: 'AWAITING', decisions: [recorded[0]],
    }), false);
    expect(html).toContain('Approval progress unavailable');
    expect(html).toContain('1 recorded vote');
    expect(html).not.toContain('1 of 1 approved');
  });

  it('never labels an inferred primary approver as a current assigned seat when the server omits its plan', () => {
    const html = markup(request({
      approval_plan: undefined,
      approval_progress: undefined,
      decisions: [{ actor_id: 'u2', decision: 'APPROVED', reason: '', decided_at: 120 }],
    }), false);
    expect(html).toContain('Approval plan unavailable');
    expect(html).toContain('Recorded reviewer vote');
    expect(html).not.toContain('Single approver');
    expect(html).not.toContain('Approval seat 1');
    expect(html).not.toContain('1 of 1 approved');
  });

  it('identifies current seats only when the role-scoped server plan explicitly supplies them', () => {
    const html = markup(request({
      approval_plan: { mode: 'SINGLE', members: ['u2'], required: 1 },
      decisions: [{ actor_id: 'u2', decision: 'HELD', reason: '', decided_at: 120 }],
    }), false);
    expect(html).toContain('Approval seat 1');
    expect(html).toContain('SINGLE');
    expect(html).not.toContain('Approval plan unavailable');
  });

  it('uses authoritative server quorum even when two vote records appear approved', () => {
    const html = markup(request({
      approval_plan: { mode: 'ALL', members: ['seat-a', 'seat-b'], required: 2 },
      approval_progress: {
        mode: 'ALL', approved_count: 1, required_count: 2, total_members: 2,
        waiting_approver_ids: ['seat-a'], waiting_approvers: [{ id: 'seat-a', username: 'Reviewer A' }],
        group_name: 'Reviewers', waiting_on: 'APPROVERS',
      },
      decisions: recorded,
    }), false);
    expect(html).toContain('1 of 2 approved');
    expect(html).not.toContain('2 of 2 approved');
    expect(html).toContain('Approval seat 2');
    expect(html).not.toContain('Review resend email');
  });
});


describe('RequestDetail and reviewer evidence share server-authoritative progress', () => {
  it('discloses missing projection without inferring approval from a recorded vote', () => {
    const row = request({
      decisions: [{ actor_id: 'removed-seat', decision: 'APPROVED', reason: '', decided_at: 150 }],
    });
    expect(approvalProgressLabel(row)).toBe('Approval progress unavailable');
    expect(approvalWaitingLabel(row)).toBe('Waiting status unavailable');
    expect(markup(row, false)).toContain(approvalProgressLabel(row));
  });

  it('formats the same server-provided progress for the summary and vote card', () => {
    const row = request({
      approval_progress: {
        mode: 'ALL', approved_count: 1, required_count: 2, total_members: 2,
        waiting_approver_ids: ['seat-b'], waiting_approvers: [{ id: 'seat-b', username: 'Reviewer B' }],
        group_name: 'Production', waiting_on: 'APPROVERS',
      },
      decisions: [
        { actor_id: 'seat-a', decision: 'APPROVED', reason: '', decided_at: 200 },
        { actor_id: 'seat-b', decision: 'HELD', reason: '', decided_at: 201 },
      ],
    });
    expect(approvalProgressLabel(row)).toBe('1 of 2 approved');
    expect(approvalWaitingLabel(row)).toBe('APPROVERS · Production: Reviewer B');
    expect(markup(row, false)).toContain(approvalProgressLabel(row));
    expect(approvalProgressLabel(request({ decisions: [] }))).toBe('Approval progress unavailable');
  });
});
