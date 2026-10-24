import { describe, expect, it } from 'vitest';
import { validControlConsumerAppShell } from '@datarelay-labs/control-clone';
import { grantControlShellConfiguration } from '../../src/grant_control_shell_composition';
import type { User } from '../../src/types';

const admin: User = {
  id: 'grant-admin-fixture', username: 'admin', email: 'admin@example.invalid',
  role: 'admin', mfa_enabled: false,
};
const member: User = {
  ...admin, id: 'grant-member-fixture', username: 'approver', role: 'member',
};

describe('PF106 real Grant Control AppShell projection', () => {
  it('mounts the original Control shell with actual safe native Grant routes', () => {
    const projected = grantControlShellConfiguration(admin);
    expect(validControlConsumerAppShell(projected)).toBe(true);
    expect(projected.actor).toMatchObject({ name: 'admin', canRead: true, canManage: true });
    expect(projected.homePath).toBe('/home');
    expect(projected.groups.map(g => g.label)).toEqual([
      'User workspace', 'Approval administration', 'System administration',
    ]);
    const routes = projected.groups.flatMap(g => g.items);
    for (const route of routes) {
      expect(route.path).toMatch(/^\/(?!\/)[a-z0-9/_-]+$/);
      expect(route.path).not.toContain('/streams');
      expect(route.path).not.toContain('/connectors');
      expect(route.path).not.toContain('/governance');
    }
    expect(routes.find(r => r.path === '/system')?.access).toBe('view');
    expect(routes.find(r => r.path === '/notifications')?.access).toBe('manage');
    expect(routes.find(r => r.path === '/security')?.access).toBe('view');
  });

  it('never exposes administrator tasks to approver/member persona', () => {
    const projected = grantControlShellConfiguration(member);
    expect(validControlConsumerAppShell(projected)).toBe(true);
    expect(projected.actor.canManage).toBe(false);
    const all = projected.groups.flatMap(g => g.items);
    const usable = all.filter(item => item.access !== 'none');
    expect(usable.map(item => item.path)).toEqual(expect.arrayContaining([
      '/home', '/requests/new', '/approvals', '/my-requests', '/security',
    ]));
    for (const route of ['/system', '/operations', '/audit', '/admin/setup',
      '/approvers', '/integrations', '/notifications', '/profiles', '/requests']) {
      expect(usable.some(item => item.path === route)).toBe(false);
    }
    expect(usable.every(item => item.access === 'view')).toBe(true);
  });

  it('has no duplicate navigation IDs/routes or magic security capabilities', () => {
    for (const user of [admin, member]) {
      const projected = grantControlShellConfiguration(user);
      const all = projected.groups.flatMap(g => g.items);
      expect(new Set(all.map(row => row.id)).size).toBe(all.length);
      expect(new Set(all.map(row => row.path)).size).toBe(all.length);
      expect(all.some(row => row.path === '/settings' || row.path.includes('/operations/backup'))).toBe(false);
    }
  });
});
