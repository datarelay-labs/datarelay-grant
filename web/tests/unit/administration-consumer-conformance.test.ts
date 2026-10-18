import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ControlConsumerAdministration, ControlConsumerAdministrationHubProps } from '@datarelay-labs/control-clone';
import { Administration } from '../../src/administration';
import { registeredGrantAdministrationTaskIds } from '../../src/grant_control_administration_contract';
import type { User } from '../../src/types';

/** Capture actual product-created shared Control Hub props, not a passing
 * fixture. Rendering is inert and performs no SMTP, credentials or host POST.
 */
const observed = vi.hoisted(() => ({ hub: null as unknown }));
vi.mock('@datarelay-labs/control-clone', async (importOriginal) => {
  const source = await importOriginal<typeof import('@datarelay-labs/control-clone')>();
  return {
    ...source,
    ControlConsumerAdministrationHubPage: (props: unknown) => {
      observed.hub = props;
      return null;
    },
  };
});

const admin: User = {
  id: 'synthetic-admin',
  username: 'admin',
  email: 'admin@example.invalid',
  role: 'admin',
  mfa_enabled: false,
};
const member: User = { ...admin, id: 'synthetic-member', username: 'member', role: 'member' };

function realProjection(user: User): ControlConsumerAdministrationHubProps {
  observed.hub = null;
  renderToStaticMarkup(createElement(Administration, { user }));
  if (!observed.hub) throw Error('Actual Control Administration consumer UI did not render');
  return observed.hub as ControlConsumerAdministrationHubProps;
}

function allTasks(value: ControlConsumerAdministration) {
  return value.groups.flatMap(group => group.tasks);
}

describe('Grant actual Control-source Administration consumer conformance', () => {
  it('passes the real four Control group IDs plus Grant SMTP extension with complete native task inventory', () => {
    const { consumer, onOpen, showUnavailable } = realProjection(admin);
    expect(consumer.actor).toEqual({
      label: 'Grant administrator · admin',
      canRead: true,
      canManage: true,
    });
    expect(consumer.groups.map(g => g.id)).toEqual([
      'access-security', 'platform-network', 'grant-mail-transport',
      'lifecycle-recovery', 'operations-audit',
    ]);
    expect(showUnavailable).toBe(true);
    expect(typeof onOpen).toBe('function');
    const tasks = allTasks(consumer);
    expect(new Set(tasks.map(t => t.id)).size).toBe(tasks.length);
    const supported = tasks.filter(t => t.availability !== 'unavailable' && t.target?.kind === 'action');
    const registered = registeredGrantAdministrationTaskIds();
    expect(supported.map(t => t.id).sort()).toEqual([...registered].sort());
    expect(tasks.find(t => t.id === 'core.users')).toMatchObject({
      access: 'manage', availability: 'supported',
      target: { kind: 'action', actionId: 'grant.accounts' },
    });
    expect(tasks.find(t => t.id === 'core.password')).toMatchObject({
      access: 'view',
      target: { kind: 'route', path: '/security' },
    });
  });

  it('does not report unbound Control-native effects as working Grant operations', () => {
    const tasks = allTasks(realProjection(admin).consumer);
    for (const id of ['core.acl','core.mfa','core.rbac','core.sessions','core.retention','grant.smtp.configure']) {
      const task = tasks.find(t => t.id === id);
      expect(task?.availability).toBe('unavailable');
      expect(task?.target).toBeUndefined();
    }
    const network = tasks.find(t => t.id === 'core.network');
    expect(network).toMatchObject({
      availability: 'read_only', access: 'view',
      target: { kind: 'action', actionId: 'grant.deployment.network' },
    });
  });

  it('does not expose Manage to a nonadmin despite any UI component convenience', () => {
    const { consumer } = realProjection(member);
    expect(consumer.actor).toMatchObject({
      canRead: false, canManage: false,
    });
    for (const task of allTasks(consumer)) {
      if (task.access === 'manage') {
        expect(task.availability).toBe('unavailable');
      }
    }
    expect(realProjection(admin).consumer.actor.canManage).toBe(true);
  });

  it('contains no Control hardcoded native route or fake privileged writable target', () => {
    const tasks = allTasks(realProjection(admin).consumer);
    for (const task of tasks) {
      if (task.target?.kind === 'route') {
        expect(task.target.path).not.toContain('/settings');
        expect(task.target.path).not.toContain('/operations/backup');
        expect(task.target.path).toBe('/security');
      } else if (task.target?.kind === 'action') {
        expect(task.target.actionId).toMatch(/^grant\./);
      }
    }
    expect(tasks.find(t => t.id === 'core.backup-import')?.access).toBe('view');
    expect(tasks.find(t => t.id === 'core.backup-import')?.availability).toBe('read_only');
  });
});
