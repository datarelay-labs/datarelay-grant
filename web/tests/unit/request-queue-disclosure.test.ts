import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { countAdvancedFilters, queryFor, RequestList } from '../../src/request_inbox';
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


describe('Grant server-scoped request date filters use UTC calendar days', () => {
  it('preserves UTC day boundaries even for a reviewer in Asia/Seoul', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Asia/Seoul';
    try {
      const result = new URL(queryFor({
        ...emptyFilters(), created_after: '2026-10-01', created_before: '2026-10-01',
      }, 0), 'http://testserver');
      const params = result.searchParams;
      expect(Number(params.get('created_after'))).toBe(Date.UTC(2026, 9, 1) / 1000);
      expect(Number(params.get('created_before'))).toBe(
        Date.UTC(2026, 9, 2) / 1000 - 0.000001,
      );
      expect(params.get('limit')).toBe('50');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it('does not silently drop invalid calendar days or inverted dates', () => {
    expect(() => queryFor({
      ...emptyFilters(), created_after: '2026-02-30',
    }, 0)).toThrow('INVALID_REQUEST_DATE');
    expect(() => queryFor({
      ...emptyFilters(), created_after: '2026-10-03', created_before: '2026-10-01',
    }, 0)).toThrow('INVALID_REQUEST_DATE_RANGE');
    expect(() => queryFor(emptyFilters(), -50)).toThrow('INVALID_REQUEST_PAGE');
  });
});
