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

const htmlFor = (user: User) =>
  renderToStaticMarkup(createElement(Administration, { user }));

describe('Grant consumes actual Control-source Foundation Administration with native Grant tasks', () => {
  it('shows original Control task-grid, canonical sections and real Grant extension', () => {
    const html = htmlFor(administrator);
    expect(html).toContain('data-testid="administration-hub-page"');
    expect(html).toContain('data-testid="admin-hub-task-groups"');
    expect(html).toContain('data-testid="administration-purpose-header"');
    for (const section of [
      'access-security', 'platform-network', 'lifecycle-recovery',
      'operations-audit', 'grant-mail-transport',
    ]) {
      expect(html).toContain('data-testid="admin-hub-group-' + section + '"');
    }
    for (const task of [
      'core.https', 'core.users', 'core.password', 'core.acl',
      'core.mfa', 'core.rbac', 'core.sessions', 'core.timezone',
      'core.network', 'core.retention', 'core.backup-import',
      'core.audit', 'core.health', 'grant.smtp.test',
    ]) {
      expect(html).toContain('data-testid="' + task + '"');
    }
    expect(html).toContain('Grant administrator');
    expect(html).toContain('Mail &amp; Notifications');
    expect(html).not.toContain('foundation-administration-hub');
  });

  it('keeps unsupported Grant-host controls visible but inert', () => {
    const html = htmlFor(administrator);
    for (const id of ['core.acl', 'core.mfa', 'core.rbac', 'core.sessions',
      'core.retention', 'grant.smtp.configure']) {
      expect(html).toContain('data-testid="' + id + '"');
    }
    expect(html).toContain('no accepted editable Web API');
    expect(html).toContain('This action is not available to the current product account.');
    expect(html).not.toContain('aria-label="Manage Management Access (ACL)"');
    expect(html).not.toContain('aria-label="Manage Roles &amp; Permissions"');
    expect(html).not.toContain('Confirm restore');
    expect(html).not.toContain('Apply SSH rule');
  });

  it('keeps Grant-owned authenticated account and configuration shortcuts', () => {
    const html = htmlFor(administrator);
    expect(html).toContain('class="grant-admin-shortcuts"');
    expect(html).toContain('My account &amp; MFA');
    expect(html).toContain('Configuration preview');
    expect(html).toContain('data-testid="core.users"');
    expect(html).toContain('data-testid="core.health"');
  });

  it('shows no privileged Control actions to a Grant member', () => {
    const member: User = { ...administrator, id: 'member', username: 'member', role: 'member' };
    const html = htmlFor(member);
    expect(html).toContain('data-testid="administration-hub-page"');
    expect(html).toContain('Grant member');
    expect(html).toContain('No authorized administration access');
    expect(html).not.toContain('class="dr-button dr-button--primary');
    expect(html).not.toContain('Configuration preview');
    expect(html).toContain('My account &amp; MFA');
  });
});
