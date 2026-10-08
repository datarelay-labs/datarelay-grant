import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Administration } from '../../src/administration';
import type { User } from '../../src/types';

const administrator: User = {
  id: 'test-admin',
  username: 'admin',
  email: 'admin@example.invalid',
  role: 'admin',
  mfa_enabled: true,
};

describe('Grant administration consumes the public Foundation shared Hub', () => {
  it('renders the Control-family four core groups and the product-owned mail extension', () => {
    const html = renderToStaticMarkup(createElement(Administration, { user: administrator }));
    for (const group of [
      'access-security', 'platform-network', 'lifecycle-recovery', 'operations-audit', 'grant.mail-transport',
    ]) {
      expect(html).toContain('data-group-id="' + group + '"');
    }
    expect(html).toContain('foundation-administration-hub');
    expect(html).toContain('Mail &amp; Notifications');
    expect(html).toContain('User Management');
    expect(html).toContain('Backup &amp; Import');
    expect(html).toContain('System Health');
    // The Foundation-owned nine task labels must remain visible and consistent,
    // including controls Grant has intentionally not implemented.
    for (const task of [
      'HTTPS', 'User Management', 'Password Management',
      'Display timezone', 'Network', 'Retention', 'Backup &amp; Import',
      'Audit', 'System Health',
    ]) {
      expect(html).toContain(task);
    }
    expect(html).not.toContain('dr-admin-hub__header');
    expect(html).toContain('aria-label="Manage User Management"');
    expect(html).toContain('aria-label="View System Health"');
    expect(html).toContain('aria-label="Manage Mail delivery test"');
  });

  it('does not advertise unsupported SMTP configuration as an enabled action', () => {
    const html = renderToStaticMarkup(createElement(Administration, { user: administrator }));
    expect(html).toContain('SMTP server configuration');
    expect(html).not.toContain('aria-label="Manage SMTP server configuration"');
    expect(html).toContain('no accepted editable Web API');
  });

  it('keeps non-administrators from mutating supported administrative tasks', () => {
    const member: User = { ...administrator, id: 'member', username: 'member', role: 'member' };
    const html = renderToStaticMarkup(createElement(Administration, { user: member }));
    expect(html).toContain('foundation-administration-hub');
    expect(html).not.toContain('aria-label="Manage User Management"');
    expect(html).not.toContain('aria-label="Manage Mail delivery test"');
  });
});
