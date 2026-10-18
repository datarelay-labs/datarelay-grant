import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdministrationHubComposition } from '@datarelay-labs/foundation';
import { verifyAdministrationConsumer } from '@datarelay-labs/testkit';
import { Administration } from '../../src/administration';
import { registeredGrantAdministrationTaskIds } from '../../src/grant_control_administration_contract';
import { productConfig } from '../../src/foundation.config';
import type { User } from '../../src/types';

// Capture the REAL product-created Foundation Hub props in an inert server
// render. Do not patch Grant's previously platform-blocked app/styles files,
// issue real HTTP requests, or treat this as a Browser/User E2E gate.
const observed = vi.hoisted(() => ({ hub: null as unknown }));
vi.mock('@datarelay-labs/foundation', async (importOriginal) => {
  const source = await importOriginal<typeof import('@datarelay-labs/foundation')>();
  return {
    ...source,
    AdministrationHub: (props: unknown) => {
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
const member: User = {
  ...admin,
  id: 'synthetic-member',
  username: 'member',
  role: 'member',
};

function productRegisteredActions(): string[] {
  // The real implementation derives its known paths/operations from the same
  // product-owned binding table as Administration.openTask, not a stale
  // source-regex match of an old inline dispatcher.
  const actions = registeredGrantAdministrationTaskIds();
  if (!actions.length || new Set(actions).size !== actions.length) {
    throw new Error('Grant Administration task binding inventory is invalid');
  }
  return actions;
}

function realComposition(user: User): AdministrationHubComposition {
  observed.hub = null;
  renderToStaticMarkup(createElement(Administration, { user }));
  if (!observed.hub) throw new Error('Actual Grant AdministrationHub did not render');
  const { productId, tasks, extensionGroups } = observed.hub as AdministrationHubComposition;
  return { productId, tasks, extensionGroups };
}

function structuralReport(user: User, dispatchTaskIds = productRegisteredActions()) {
  const config = productConfig(user);
  const composition = realComposition(user);
  const targets = [
    ...composition.tasks,
    ...(composition.extensionGroups ?? []).flatMap((group) => group.tasks),
  ];
  // The actual Grant callback switch keys by task ID, whereas the shared
  // adapter target has its own product-owned action ID. Require BOTH to exist.
  const registeredActionIds = targets.flatMap((task) =>
    dispatchTaskIds.includes(task.id) && task.target?.kind === 'action'
      ? [task.target.actionId] : [],
  );
  return verifyAdministrationConsumer({
    composition,
    registeredPaths: [
      ...config.navigation.flatMap(
        (item) => 'path' in item && typeof item.path === 'string' ? [item.path] : [],
      ),
      // Account & security is a real shell route reached from the user menu and
      // System Management Password Management task, not a primary nav record.
      '/security',
    ],
    registeredActionIds,
    requiredCoreTaskIds: user.role === 'admin'
      ? ['core.users', 'core.audit', 'core.health'] : [],
  });
}

describe('B2 Grant exact B1 Foundation consumer conformance', () => {
  it('verifies the actual admin four-group composition and source-owned actions', () => {
    expect(structuralReport(admin)).toEqual({ ok: true, findings: [] });
  });

  it('keeps the member Administration task projection consistent with real unavailable capabilities', () => {
    const result = structuralReport(member);
    expect(result).toEqual({ ok: true, findings: [] });
    const composition = realComposition(member);
    const scopedTasks = [
      ...composition.tasks,
      ...(composition.extensionGroups ?? []).flatMap((group) => group.tasks),
    ];
    for (const id of ['core.users', 'grant.smtp.test']) {
      const task = scopedTasks.find((item) => item.id === id);
      expect(task).toBeDefined();
      expect(task?.availability).toBe('unavailable');
      expect(task?.access).toBe('view');
    }
    expect(structuralReport(admin)).toEqual({ ok: true, findings: [] });
  });

  it('fails closed when the real audit callback is absent from the observed inventory', () => {
    const withoutAudit = productRegisteredActions().filter((id) => id !== 'core.audit');
    const result = structuralReport(admin, withoutAudit);
    expect(result.ok).toBe(false);
    expect(result.findings.map((x) => x.id)).toContain('ADMIN_TARGET_UNREGISTERED');
  });

  it('documents the exact real product callback inventory without declaring an E2E PASS', () => {
    expect(productRegisteredActions().sort()).toEqual([
      'core.users', 'core.audit', 'core.health',
      'core.backup-import', 'core.https', 'core.network', 'core.timezone',
      'grant.smtp.test',
    ].sort());
  });
});
