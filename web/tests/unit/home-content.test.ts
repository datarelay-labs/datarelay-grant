import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Home, HomeWorkspaceContent } from '../../src/home';
import { projectHomeWorkspace } from '../../src/home_pages';
import type { RequestRow, User } from '../../src/types';

const member: User = {
  id: 'requester', username: 'requester', email: 'requester@example.invalid',
  role: 'member', mfa_enabled: false,
};

function row(id: string, extra: Partial<RequestRow> = {}): RequestRow {
  return {
    id, external_id: id, integration_id: 'i', profile_id: 'p',
    requester_id: 'requester', approver_id: 'approver',
    viewer_assigned: false, viewer_can_decide: false,
    title: 'Sample ' + id, reason: '', action: {
      kind: 'example.action', target: 'synthetic', parameters: {},
    },
    action_hash: 'hash', source: {}, state: 'AWAITING',
    collaboration_state: 'OPEN', decision: null, decision_actor: null,
    decision_at: null, revision: 1, created_at: 100, deadline: 1_000,
    grant_until: null, predecessor_id: null, execution_id: null,
    execution_state: 'NOT_STARTED', execution_result: null,
    delivery_state: 'QUEUED', ...extra,
  };
}

function markup(
  user: User, rows: RequestRow[], complete = true,
): string {
  return renderToStaticMarkup(createElement(HomeWorkspaceContent, {
    user,
    view: projectHomeWorkspace(rows, user.id, user.role === 'admin', 500),
    summaryComplete: complete,
    busy: false,
    navigate: () => undefined,
    refresh: () => undefined,
  }));
}

describe('Grant task-oriented Home composition', () => {
  it('places actionable work before requester history, removes NOC first-row alert metrics', () => {
    const html = markup(member, [
      row('mine', { title: 'My submitted item' }),
      row('waiting', { title: 'Review this first', requester_id: 'other',
        viewer_assigned: true, viewer_can_decide: true, deadline: 800 }),
    ]);
    expect(html).toContain('Your approval workspace');
    expect(html).toContain('Decisions awaiting you');
    expect(html).toContain('My submitted requests');
    expect(html).toContain('Review this first');
    expect(html).toContain('My submitted item');
    expect(html.indexOf('Decisions awaiting you')).toBeLessThan(html.indexOf('My submitted requests'));
    expect(html).not.toContain('Operations follow-up');
    expect(html).not.toContain('Delivery failures');
    expect(html).not.toContain('Configure Grant');
    expect(html).toContain('New request');
  });

  it('prioritizes administrator configuration in Home actions while retaining an explicit request shortcut', () => {
    const admin = markup({...member,id:'admin',role:'admin'},[]);
    const intro = admin.slice(admin.indexOf('class="grant-home-intro"'),
      admin.indexOf('class="grant-guided-start"'));
    expect(intro).toContain('Workflow setup');
    expect(intro).toContain('New request');
    expect(intro.indexOf('Workflow setup')).toBeLessThan(intro.indexOf('New request'));
    const memberIntro = markup(member,[]);
    expect(memberIntro).toContain('New request');
    expect(memberIntro).not.toContain('Configure approval workflow');
  });

  it('exposes exact operation and target in the approval queue without entering details', () => {
    const html = markup(member, [
      row('approve-prod', {
        requester_id: 'other', title: 'Approve production rollout',
        viewer_assigned: true, viewer_can_decide: true, deadline: 810,
        action: { kind: 'service.deploy', target: 'customer-api-prod', parameters: {} },
      }),
    ]);
    const decisionSection = html.slice(html.indexOf('Decisions awaiting you'),
      html.indexOf('My submitted requests'));
    expect(decisionSection).toContain('Approve production rollout');
    expect(decisionSection).toContain('Operation');
    expect(decisionSection).toContain('service.deploy');
    expect(decisionSection).toContain('Target');
    expect(decisionSection).toContain('customer-api-prod');
    expect(decisionSection).toContain('Decision needed');
    expect(decisionSection).not.toContain('Execute</button>');
  });

  it('escapes untrusted operation and target in the approval worklist', () => {
    const html = markup(member, [
      row('untrusted', {
        requester_id: 'other', viewer_assigned: true, viewer_can_decide: true,
        action: {
          kind: '<script>alert(1)</script>',
          target: '<img src=x onerror=alert(1)>',
          parameters: {},
        },
      }),
    ]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });

  it('shows exact action context for requester follow-up and submitted history', () => {
    const html = markup(member, [
      row('needs-info', {
        title: 'Provide supporting documents',
        collaboration_state: 'INFO_REQUESTED', created_at: 300,
        action: { kind: 'account.review', target: 'customer-42', parameters: {} },
      }),
      row('recent', {
        title: 'Scheduled restart', created_at: 200,
        action: { kind: 'service.restart', target: 'reporting-worker', parameters: {} },
      }),
    ]);
    expect(html).toContain('Your response is needed');
    expect(html).toMatch(/<strong>Provide supporting documents<\/strong><small>Operation: account\.review · Target: customer-42<\/small>/);
    expect(html).toMatch(/<strong>Scheduled restart<\/strong><small>Operation: service\.restart · Target: reporting-worker<\/small>/);
    expect(html).not.toContain('Execute</button>');
  });

  it('prioritizes requester questions but hides other requesters personal data', () => {
    const html = markup(member, [
      row('mine', { title: 'Provide new details', collaboration_state: 'INFO_REQUESTED' }),
      row('not-mine', { title: 'Another customer confidential', requester_id: 'other',
        collaboration_state: 'INFO_REQUESTED' }),
    ]);
    expect(html).toContain('Your response is needed');
    expect(html).toContain('Provide new details');
    expect(html).toContain('Information requested');
    expect(html).not.toContain('Another customer confidential');
    expect(html).not.toContain('not-mine');
  });

  it('shows executor reported outcomes as unverified in the actual requester Home', () => {
    const output = markup(member, [
      row('reported-success', {
        state: 'APPROVED', execution_state: 'REPORTED_SUCCEEDED',
        title: 'Reported completed deployment',
      }),
      row('reported-failure', {
        state: 'APPROVED', execution_state: 'REPORTED_FAILED',
        title: 'Reported failed deployment',
      }),
    ]);
    expect(output).toContain('executor reported success (not independently verified)');
    expect(output).toContain('executor reported failure (not independently verified)');
    expect(output).not.toContain('Approved · execution completed');
    expect(output).not.toContain('Approved · execution failed');
    expect(output).not.toContain('Execution verified');
  });

  it('shows operational exception counts only to administrators and keeps each status separate', () => {
    const rows = [
      row('email-failed', { requester_id: 'other', state: 'HELD',
        delivery_state: 'FAILED', title: 'Private delivery issue' }),
      row('approved-not-run', { requester_id: 'other', state: 'APPROVED',
        execution_state: 'NOT_STARTED' }),
      row('execution-unknown', { requester_id: 'other', state: 'APPROVED',
        execution_state: 'UNKNOWN' }),
    ];
    const adminHtml = markup({ ...member, role: 'admin', id: 'admin' }, rows);
    const memberHtml = markup(member, rows);
    expect(adminHtml).toContain('Operations follow-up');
    expect(adminHtml).toContain('Delivery failures · 1');
    expect(adminHtml).toContain('Approved, not consumed · 1');
    expect(adminHtml).toContain('Execution unknown · 1');
    expect(memberHtml).not.toContain('Operations follow-up');
    expect(memberHtml).not.toContain('Private delivery issue');
  });

  it('does not report exact zero totals when the role-scoped API pagination was capped', () => {
    const html = markup(member, [], false);
    expect(html).toContain('lower-bound counts');
    expect(html).toContain('≥0');
    expect(html).toContain('No ready decisions in the loaded subset');
    expect(html).not.toContain('No assigned decisions are ready right now.');
  });
});

describe('First-time Home initial data truth', () => {
  it('does not show zero approvals as a successful server result before the first GET', () => {
    const html = renderToStaticMarkup(createElement(Home, {
      user: member, navigate: () => undefined,
    }));
    expect(html).toContain('Loading your approval workspace');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('0 ready');
    expect(html).not.toContain('No assigned decisions are ready right now.');
    expect(html).not.toContain('You have not submitted a request yet.');
    expect(html).toContain('Create approval request');
  });

  it('keeps task navigation available while the summary is loading', () => {
    const html = renderToStaticMarkup(createElement(HomeWorkspaceContent, {
      user: member, view: projectHomeWorkspace([], member.id, false, 500),
      summaryComplete: true, busy: true, loaded: false,
      navigate: () => undefined, refresh: () => undefined,
    }));
    expect(html).toContain('Loading your approval workspace');
    expect(html).toContain('Open my approvals');
    expect(html).not.toContain('0 ready');
  });
});
