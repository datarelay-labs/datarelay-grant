import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminWorkflowSetup } from '../../src/admin_workflow_setup';
import { productConfig } from '../../src/foundation.config';
import type { User } from '../../src/types';

const member: User = {
  id: 'member', username: 'member', email: 'member@example.invalid',
  role: 'member', mfa_enabled: false,
};

describe('administrator configuration is separated from requester work', () => {
  it('keeps member navigation limited to user-workspace tasks', () => {
    const config = productConfig(member);
    expect(config.capabilities['grant.requests.admin']).toBe(false);
    const visible = config.navigation.filter((item) => {
      if (!item.requiredCapability) return true;
      const value = config.capabilities[item.requiredCapability];
      return value !== false && value !== 'unavailable' && value !== undefined;
    });
    expect(visible.map((item) => item.path)).toEqual([
      '/home', '/requests/new', '/approvals', '/my-requests', '/delegations',
    ]);
    expect(new Set(visible.map((item) => item.section?.label))).toEqual(new Set(['User workspace']));
  });

  it('gives administrators one explicit setup lane plus system administration', () => {
    const config = productConfig({ ...member, role: 'admin' });
    const byPath = new Map(config.navigation.map((item) => [item.path, item]));
    expect(byPath.get('/admin/setup')?.section?.label).toBe('Approval administration');
    expect(byPath.get('/approvers')?.label).toBe('Approver groups');
    expect(byPath.get('/notifications')?.label).toBe('Notification templates');
    expect(byPath.get('/requests')?.label).toBe('All requests');
    expect(byPath.get('/system')?.section?.label).toBe('System administration');
  });

  it('documents that requesters consume administrator-owned routing and templates', () => {
    const html = renderToStaticMarkup(createElement(AdminWorkflowSetup, { navigate: vi.fn() }));
    for (const phrase of [
      'Configure once, reuse on every request',
      'Create approver accounts', 'Create approver groups', 'Register integrations',
      'Create notification templates', 'Create approval policies', 'Test and activate',
      'Create the first request', 'Open New request',
      'What requesters see', 'Choose request type', 'Enter request details',
      'Review and submit', 'read-only to the requester',
    ]) expect(html).toContain(phrase);
    expect(html).not.toContain('Requester selects approver');
    expect(html).not.toContain('Requester selects template');
    expect(html).toContain('href="/system?view=accounts"');
    expect(html).toContain('grant-admin-setup-steps--requester');
  });
});
