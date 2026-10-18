import { describe, expect, it } from 'vitest';
import type { AdministrationHubTask } from '@datarelay-labs/foundation';
import {
  grantTaskForControlCatalogId,
  resolveGrantAdministrationSelection,
} from '../../src/grant_control_administration_contract';

type TestTarget = AdministrationHubTask['target'];

function task(
  id: string,
  target: TestTarget,
  availability: AdministrationHubTask['availability'] = 'supported',
  access: AdministrationHubTask['access'] = 'view',
): AdministrationHubTask {
  return { id, label: id, target, availability, access };
}

describe('PF-02 real Grant administration adapter, not a Control authority clone', () => {
  it('opens each native Grant task only through its exact public SDK selection', () => {
    const cases = [
      ['core.https', 'grant.deployment.https', 'https', 'view'],
      ['core.users', 'grant.accounts', 'accounts', 'manage'],
      ['core.timezone', 'grant.display-timezone', 'timezone', 'manage'],
      ['core.network', 'grant.deployment.network', 'network', 'view'],
      ['core.backup-import', 'grant.lifecycle.guidance', 'lifecycle', 'view'],
      ['core.audit', 'grant.audit', 'audit', 'view'],
      ['core.health', 'grant.health', 'health', 'view'],
      ['grant.smtp.test', 'grant.smtp.test', 'mail', 'manage'],
    ] as const;
    for (const [id, actionId, detail, access] of cases) {
      const availability = access === 'view' ? 'read_only' : 'supported';
      expect(resolveGrantAdministrationSelection(
        task(id, { kind: 'action', actionId }, availability, access), 'admin',
      )).toEqual({ kind: 'detail', detail });
    }
    expect(resolveGrantAdministrationSelection(
      task('core.password', { kind: 'path', path: '/security' }, 'supported', 'view'),
      'admin',
    )).toEqual({ kind: 'route', path: '/security' });
  });

  it('blocks undeclared, Control-native, operator-only and unsupported capabilities', () => {
    for (const id of [
      'core.acl', 'core.mfa', 'core.rbac', 'core.sessions',
      'core.retention', 'grant.smtp.configure', 'admin-hub-user-management',
      '__proto__', 'constructor',
    ]) {
      expect(resolveGrantAdministrationSelection(
        task(id, { kind: 'action', actionId: 'grant.accounts' }), 'admin',
      )).toBeNull();
    }
    expect(resolveGrantAdministrationSelection(
      task('core.users', { kind: 'action', actionId: 'grant.accounts' }, 'unavailable', 'manage'),
      'admin',
    )).toBeNull();
    expect(resolveGrantAdministrationSelection(
      task('core.users', { kind: 'action', actionId: 'grant.accounts' }, 'supported', 'none'),
      'admin',
    )).toBeNull();
  });

  it('rejects modified targets and privilege confusion for any Grant account', () => {
    const selected = task('core.users', { kind: 'action', actionId: 'grant.accounts' },
      'supported', 'manage');
    expect(resolveGrantAdministrationSelection(selected, 'member')).toBeNull();
    expect(resolveGrantAdministrationSelection(
      task('core.users', { kind: 'action', actionId: 'grant.audit' }, 'supported', 'manage'),
      'admin',
    )).toBeNull();
    expect(resolveGrantAdministrationSelection(
      task('core.users', { kind: 'path', path: '/security' }, 'supported', 'manage'),
      'admin',
    )).toBeNull();
    expect(resolveGrantAdministrationSelection(
      task('core.https', { kind: 'action', actionId: 'grant.deployment.https' },
        'supported', 'manage'),
      'admin',
    )).toBeNull();
    expect(resolveGrantAdministrationSelection(
      task('core.password', { kind: 'path', path: '//evil.invalid' },
        'supported', 'view'),
      'admin',
    )).toBeNull();
  });

  it('does not rebrand unsupported Control access, roles, sessions or backup as functional Grant', () => {
    const safe = {
      'admin-hub-https': 'core.https',
      'admin-hub-user-management': 'core.users',
      'admin-hub-password-management': 'core.password',
      'admin-hub-display-timezone': 'core.timezone',
      'admin-hub-network': 'core.network',
      'admin-hub-audit': 'core.audit',
      'admin-hub-system-health': 'core.health',
    };
    for (const [id, expected] of Object.entries(safe)) {
      expect(grantTaskForControlCatalogId(id)).toBe(expected);
    }
    for (const id of [
      'admin-hub-mfa', 'admin-hub-acl', 'admin-hub-roles', 'admin-hub-sessions',
      'admin-hub-retention', 'admin-hub-backup', 'admin-hub-no-such-task',
      'toString',
    ]) {
      expect(grantTaskForControlCatalogId(id)).toBeNull();
    }
  });
});
