import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductShell } from '@datarelay-labs/foundation';
import { productConfig } from '../../src/foundation.config';
import type { User } from '../../src/types';

const baseUser: User = {
  id: 'member-id',
  username: 'preview-approver',
  email: 'preview-approver@example.invalid',
  role: 'member',
  mfa_enabled: false,
};

function renderNavigation(user: User, path = '/home') {
  const config = productConfig(user);
  return renderToStaticMarkup(
    createElement(
      ProductShell,
      {
        product: config.product,
        navigation: config.navigation,
        capabilities: config.capabilities,
        currentPath: path,
        onNavigate: () => undefined,
        pageTitle: 'Grant approval workspace',
      },
      createElement('span', {}, 'Test screen'),
    ),
  );
}

describe('Grant PF-8 two-level approval workspace', () => {
  it('keeps every legacy URL in the flat registry for existing app title routing', () => {
    const config = productConfig({ ...baseUser, role: 'admin' });
    const paths = config.navigation.map((item) => item.path);
    expect(paths).toEqual(expect.arrayContaining([
      '/home', '/approvals', '/my-requests', '/requests', '/delegations',
      '/profiles', '/approvers', '/notifications', '/integrations',
      '/system', '/operations', '/audit',
    ]));
    expect(new Set(paths).size).toBe(paths.length);
    expect(config.navigation.find((item) => item.path === '/audit')?.label).toBe('Audit explorer');
    expect(config.navigation.find((item) => item.path === '/profiles')?.label).toBe('Approval policies');
    expect(config.navigation.find((item) => item.path === '/security')).toBeUndefined();
  });

  it('renders task-first accordion with no duplicated root-level work links', () => {
    const html = renderNavigation(baseUser);
    expect(html).toContain('data-nav-parent-id="my-work"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('My approvals');
    expect(html).toContain('My requests');
    expect(html).toContain('Delegations');
    expect(html).toContain('Requests');
    expect(html).toContain('role="group"');
    expect(html).not.toContain('data-nav-parent-id="configuration"');
    expect(html).not.toContain('data-nav-parent-id="administration"');
    expect(html).not.toContain('Approval policies');
    expect(html).not.toContain('Audit explorer');
  });

  it('shows admin-only configuration and administration as collapsed parents', () => {
    const html = renderNavigation({ ...baseUser, role: 'admin' });
    expect(html).toContain('data-nav-parent-id="my-work"');
    expect(html).toContain('data-nav-parent-id="configuration"');
    expect(html).toContain('data-nav-parent-id="administration"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('Approval policies');
    expect(html).toContain('Notifications');
    expect(html).toContain('Integrations');
    expect(html).toContain('System management');
    expect(html).toContain('Operations');
    expect(html).toContain('Audit explorer');
  });

  it('opens the current admin deep-linked section without changing backend rights', () => {
    const html = renderNavigation({ ...baseUser, role: 'admin' }, '/audit');
    expect(html).toContain('data-nav-parent-id="administration"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('aria-label="System management" disabled=""');
  });
});
