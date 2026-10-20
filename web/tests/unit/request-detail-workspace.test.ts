import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestDetailOverview } from '../../src/request_detail_overview';
import { RequestDetail } from '../../src/requests';
import type { RequestRow, User } from '../../src/types';

const row: RequestRow = {
  id: 'aaaa0000-0000-4000-8000-000000000001',
  external_id: 'CASE-2026-019', integration_id: 'integration-1',
  profile_id: 'policy-1', profile_version_id: 'policy-v3',
  requester_id: 'requester', approver_id: 'approver',
  viewer_assigned: true, viewer_can_decide: true,
  title: 'Production change approval', reason: 'Urgent maintenance',
  action: { kind: 'service.deploy', target: 'customer-api',
    parameters: { version: '1.2.3', dry_run: true } },
  action_hash: 'immutable-action-digest',
  source: { channel: 'grant.web' },
  state: 'AWAITING', collaboration_state: 'OPEN',
  decision: null, decision_actor: null, decision_at: null,
  revision: 4, created_at: 1000, deadline: 5000,
  grant_until: null, predecessor_id: null, execution_id: null,
  execution_state: 'NOT_STARTED', execution_result: null,
  delivery_state: 'PENDING',
};

function html(changes: Partial<RequestRow> = {}) {
  return renderToStaticMarkup(createElement(RequestDetailOverview, {
    row: { ...row, ...changes }, canReplace: false, navigate: () => undefined,
  }));
}

describe('P0 ServiceNow/Jira inspired RequestDetail exact-action-first presentation', () => {
  it('shows the request heading then the immutable operation and target before detailed status', () => {
    const output = html();
    for (const text of ['Production change approval', 'Urgent maintenance',
      'Exact action requiring approval', 'service.deploy', 'customer-api',
      'CASE-2026-019', 'Decision status and deadline']) {
      expect(output).toContain(text);
    }
    expect(output.indexOf('Production change approval'))
      .toBeLessThan(output.indexOf('Exact action requiring approval'));
    expect(output.indexOf('Exact action requiring approval'))
      .toBeLessThan(output.indexOf('Decision status and deadline'));
  });

  it('keeps business parameters visible while technical state is progressively disclosed', () => {
    const output = html();
    expect(output).toContain('1.2.3');
    expect(output).toContain('dry_run');
    expect(output).toContain('Technical request metadata');
    expect(output).toMatch(/<details><summary>Technical request metadata<\/summary>/);
    expect(output).not.toContain('<details open=');
  });

  it('exposes approval deadline and role-scoped server progress rather than inventing a seat', () => {
    const output = html({
      approval_progress: {
        mode: 'N_OF_M', approved_count: 1, required_count: 2,
        total_members: 3, waiting_approver_ids: ['second'],
        waiting_approvers: [{ id: 'second', username: 'Reviewer B' }],
        group_name: 'Operations', waiting_on: 'APPROVERS',
      },
    });
    expect(output).toContain('1 of 2 approved');
    expect(output).toContain('Reviewer B');
    expect(output).toContain('Approval deadline');
    expect(output).toContain('Operation');
    expect(output).not.toContain('Execution verified');
    expect(output).not.toContain('Execute</button>');
  });

  it('does not infer a one-seat approval plan when server role projection is absent', () => {
    const output = html({ approval_progress: undefined, approval_plan: undefined });
    expect(output).toContain('Approval progress unavailable');
    expect(output).toContain('Waiting status unavailable');
    expect(output).not.toContain('1 of 1 approved');
  });

  it('keeps delegated identities explicit without offering a decision or execution from overview', () => {
    const output = html({ viewer_delegated_for: 'original-seat' });
    expect(output).toContain('recorded substitute');
    expect(output).toContain('auditable');
    expect(output).not.toContain('Approve</button>');
    expect(output).not.toContain('Deny</button>');
    expect(output).not.toContain('Execute</button>');
  });

  it('shows the server-confirmed overdue approval next to the decision deadline', () => {
    const output = html({ state: 'AWAITING', decision: null, overdue: true, deadline: 1000 });
    expect(output).toContain('Decision deadline and authoritative approval status');
    expect(output).toContain('Approval overdue — human decision still outstanding');
    expect(output).toContain('Approval deadline');
    expect(output).not.toContain('Execute</button>');
  });

  it('does not turn an expired, previously approved grant into an overdue human task', () => {
    const output = html({ state: 'EXPIRED', decision: 'APPROVED', overdue: true, deadline: 1000 });
    expect(output).toContain('Grant expired after approval — not an overdue approval');
    expect(output).not.toContain('Approval overdue — human decision still outstanding');
  });

  it('does not invent a deadline when the server projection is unavailable', () => {
    const output = html({ state: 'HELD', overdue: false, deadline: 0 });
    expect(output).toContain('Decision deadline unavailable');
    expect(output).not.toContain('Approval overdue — human decision still outstanding');
  });

  it('escapes user-controlled title, action target and reason in business-first layout', () => {
    const output = html({
      title: '<script>alert(1)</script>',
      reason: '<img src=x onerror=alert(1)>',
      action: { kind: 'service.deploy', target: '<svg onload=alert(1)>', parameters: {} },
    });
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;img');
    expect(output).toContain('&lt;svg');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<img src=x');
    expect(output).not.toContain('<svg onload');
  });
});

describe('Request Detail initial navigation clarity', () => {
  it('announces the current request loading instead of rendering an unexplained empty page', () => {
    const user: User = {
      id: 'member', username: 'member', email: 'member@example.invalid',
      role: 'member', mfa_enabled: false,
    };
    const output = renderToStaticMarkup(createElement(RequestDetail, {
      id: row.id, user, navigate: () => undefined,
    }));
    expect(output).toContain('Loading request details');
    expect(output).toContain('role="status"');
    expect(output).not.toContain('Approve</button>');
    expect(output).not.toContain('Confirm</button>');
  });
});
