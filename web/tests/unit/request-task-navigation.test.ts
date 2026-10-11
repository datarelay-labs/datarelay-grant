import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { requestDetailReturnTarget, RequestTaskBackLink } from '../../src/request_task_navigation';
import type { RequestRow, User } from '../../src/types';

const requester: User = {
  id: 'requester', username: 'requester', email: 'requester@example.invalid',
  role: 'member', mfa_enabled: false,
};
const approver: User = {
  ...requester, id: 'approver', username: 'approver',
};
const admin: User = { ...requester, id: 'administrator', role: 'admin' };
const row: Pick<RequestRow,'requester_id'|'viewer_assigned'|'viewer_delegated_for'> = {
  requester_id: requester.id, viewer_assigned: false, viewer_delegated_for: null,
};

describe('P0 task-first RequestDetail return to the work queue the actor came to complete', () => {
  it('returns current assigned approver to role-scoped My approvals', () => {
    const target = requestDetailReturnTarget({ ...row, viewer_assigned: true }, approver);
    expect(target).toEqual({ path: '/approvals', label: 'Back to my approvals' });
  });

  it('uses delegated approval queue for an assigned substitute without inventing membership', () => {
    const target = requestDetailReturnTarget({
      ...row, viewer_assigned: true, viewer_delegated_for: 'original-seat',
    }, approver);
    expect(target.path).toBe('/approvals');
  });

  it('returns request owner to My requests rather than the admin work queue', () => {
    expect(requestDetailReturnTarget(row, requester))
      .toEqual({ path: '/my-requests', label: 'Back to my requests' });
  });

  it('does not offer an approval queue for an unrelated administrative audit viewer', () => {
    expect(requestDetailReturnTarget(row, admin))
      .toEqual({ path: '/requests', label: 'Back to requests' });
  });

  it('keeps a safe default until server-scoped request details actually load', () => {
    expect(requestDetailReturnTarget(null, approver))
      .toEqual({ path: '/requests', label: 'Back to requests' });
  });

  it('renders a single nonmutating return button for role-scoped task navigation', () => {
    const html = renderToStaticMarkup(createElement(RequestTaskBackLink, {
      row: { ...row, viewer_assigned: true }, user: approver,
      navigate: () => undefined,
    }));
    expect(html).toContain('Back to my approvals');
    expect(html).not.toContain('Approve</button>');
    expect(html).not.toContain('Execute</button>');
    expect(html.match(/<button/g)?.length).toBe(1);
  });
});
