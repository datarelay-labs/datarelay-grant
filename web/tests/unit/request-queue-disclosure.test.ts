import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { countAdvancedFilters, RequestList } from '../../src/request_inbox';
import type { Filters } from '../../src/request_inbox';
import type { User } from '../../src/types';

const viewer: User = {
  id: 'test-user', username: 'test-user', email: 'test@example.invalid',
  role: 'member', mfa_enabled: false,
};

function emptyFilters(): Filters {
  return {
    view: 'needs', search: '', state: '', collaboration_state: '',
    policy_id: '', action_kind: '', created_after: '', created_before: '',
    delivery_state: '', execution_state: '', requester_id: '',
    approver_id: '', group_id: '', integration_id: '',
  };
}

function display(role: 'admin' | 'member', preset?: Partial<Filters>): string {
  return renderToStaticMarkup(createElement(RequestList, {
    user: { ...viewer, role },
    mode: 'all',
    navigate: () => undefined,
    ...(preset ? { preset } : {}),
  }));
}

describe('Grant request queue progressive disclosure', () => {
  it('keeps the four high-frequency filters immediately visible', () => {
    const html = display('member');
    const beforeAdvanced = html.slice(0, html.indexOf('<details'));
    expect(beforeAdvanced).toContain('Search requests');
    expect(beforeAdvanced).toContain('Work view');
    expect(beforeAdvanced).toContain('Decision status');
    expect(beforeAdvanced).toContain('Information status');
    expect(beforeAdvanced).not.toContain('Approval policy');
    expect(beforeAdvanced).not.toContain('Created through');
    expect(html).toContain('<details');
    expect(html).toContain('Advanced filters');
    expect(html).toContain('Approval policy');
    expect(html).toContain('Execution status');
    expect(html).toContain('Apply filters');
    expect(html).toContain('Clear filters');
    expect(html).toContain('<table');
    expect(html).not.toContain('<details open=""');
  });

  it('never renders administrator selectors for members', () => {
    const member = display('member');
    const admin = display('admin');
    expect(member).not.toContain('>Any requester</option>');
    expect(member).not.toContain('>Any approver</option>');
    expect(member).not.toContain('>Any group</option>');
    expect(member).not.toContain('>Any integration</option>');
    expect(admin).toContain('>Any requester</option>');
    expect(admin).toContain('>Any approver</option>');
    expect(admin).toContain('>Any group</option>');
    expect(admin).toContain('>Any integration</option>');
  });

  it('opens advanced controls by default when an admin operation preset has an active field', () => {
    const html = display('admin', { integration_id: 'demo-integration', execution_state: 'FAILED' });
    expect(html).toContain('<details open=""');
    expect(html).toContain('Advanced filters · 2 set');
    expect(html).toContain('Apply filters');
    expect(html).toContain('Clear filters');
  });

  it('counts applied and draft advanced filters without counting primary selections', () => {
    const none = emptyFilters();
    expect(countAdvancedFilters(none)).toBe(0);
    expect(countAdvancedFilters({
      ...none, view: 'overdue', search: 'incident',
      state: 'HELD', collaboration_state: 'INFO_REQUESTED',
    })).toBe(0);
    expect(countAdvancedFilters({
      ...none,
      created_after: '2026-10-01', policy_id: 'profile',
      integration_id: 'connector', action_kind: 'incident.restart',
    })).toBe(4);
  });
});
