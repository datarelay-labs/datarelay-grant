import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdministrationHubComposition } from '@datarelay-labs/foundation';
import { verifyAdministrationConsumer } from '@datarelay-labs/testkit';
import { Administration } from '../../src/administration';
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
  // In this source-bound preflight, derive callback IDs from the actual
  // local Administration dispatch map, not from a fabricated passing fixture.
  // Runtime capability enforcement remains Grant-owned and must be tested
  // separately with real users in the eventual authorized browser gate.
  const file = fileURLToPath(new URL('../../src/administration.tsx', import.meta.url));
  const source = readFileSync(file, 'utf8');
  const match = /const next: Record<string, AdminSection> = \{([\s\S]*?)\n\s*\};/.exec(source);
  if (!match) throw new Error('Grant Administration action dispatch map is missing');
  const actions = [...match[1].matchAll(/'([^']+)':\s*'/g)].map((value) => value[1]);
  if (!actions.length || new Set(actions).size !== actions.length) {
    throw new Error('Grant Administration action dispatch map is invalid');
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
    registeredPaths: config.navigation.flatMap(
      (item) => 'path' in item && typeof item.path === 'string' ? [item.path] : [],
    ),
    registeredActionIds,
    requiredCoreTaskIds: user.role === 'admin'
      ? ['core.users', 'core.audit', 'core.health'] : [],
  });
}

describe('B2 Grant exact B1 Foundation consumer conformance', () => {
  it('verifies the actual admin four-group composition and source-owned actions', () => {
    expect(structuralReport(admin)).toEqual({ ok: true, findings: [] });
  });

  it('detects current unavailable-Manage contradictions for the member role', () => {
    const result = structuralReport(member);
    // KNOWN B2 product UI gap. A platform safety denial prevents editing
    // Administration source in this run; preserve the red finding as evidence
    // rather than making a false product conformance PASS claim.
    expect(result.ok).toBe(false);
    expect(result.findings.filter((x) => x.id === 'ADMIN_CAPABILITY_CONTRADICTION'))
      .toHaveLength(2);
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
      'core.backup-import', 'grant.smtp.test',
    ].sort());
  });
});
