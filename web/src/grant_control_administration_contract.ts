/** Grant-owned task routing boundary over the shared Foundation Administration UI.
 *
 * The current Control-original F31 Administration and Shell hardcode Control
 * paths and operator identity. Never mount them over Grant's native authority
 * until upstream exposes a consumer-specific router/task/capability port.
 * These bindings use stable task IDs, not copied Foundation presentation.
 */
import type { AdministrationHubTask } from '@datarelay-labs/foundation';
import type { User } from './types';

export type GrantAdminDetail =
  | 'https' | 'accounts' | 'audit' | 'mail'
  | 'network' | 'timezone' | 'lifecycle' | 'health';

export type GrantAdministrationSelection =
  | { kind: 'detail'; detail: GrantAdminDetail }
  | { kind: 'route'; path: '/security' };

type Binding = {
  target: string;
  access: 'manage' | 'view';
  destination: GrantAdministrationSelection;
};

/** No ACL, role editor, platform sessions, native host changes or SMTP setup. */
const GRANT_TASKS: Readonly<Record<string, Binding>> = Object.freeze({
  'core.https': {
    target: 'grant.deployment.https', access: 'view',
    destination: { kind: 'detail', detail: 'https' },
  },
  'core.users': {
    target: 'grant.accounts', access: 'manage',
    destination: { kind: 'detail', detail: 'accounts' },
  },
  'core.password': {
    target: '/security', access: 'view',
    destination: { kind: 'route', path: '/security' },
  },
  'core.timezone': {
    target: 'grant.display-timezone', access: 'manage',
    destination: { kind: 'detail', detail: 'timezone' },
  },
  'core.network': {
    target: 'grant.deployment.network', access: 'view',
    destination: { kind: 'detail', detail: 'network' },
  },
  'core.backup-import': {
    target: 'grant.lifecycle.guidance', access: 'view',
    destination: { kind: 'detail', detail: 'lifecycle' },
  },
  'core.audit': {
    target: 'grant.audit', access: 'view',
    destination: { kind: 'detail', detail: 'audit' },
  },
  'core.health': {
    target: 'grant.health', access: 'view',
    destination: { kind: 'detail', detail: 'health' },
  },
  'grant.smtp.test': {
    target: 'grant.smtp.test', access: 'manage',
    destination: { kind: 'detail', detail: 'mail' },
  },
});

/** Control F31 task vocabulary mapped to actually implemented Grant tasks.
 * Deliberate null is a real native capability gap, not an empty screen to
 * substitute with a weaker personal security or operator-guide route.
 */
const CONTROL_TO_GRANT_TASK: Readonly<Record<string, string | null>> = Object.freeze({
  'admin-hub-https': 'core.https',
  'admin-hub-user-management': 'core.users',
  'admin-hub-password-management': 'core.password',
  'admin-hub-mfa': null,
  'admin-hub-acl': null,
  'admin-hub-roles': null,
  'admin-hub-sessions': null,
  'admin-hub-display-timezone': 'core.timezone',
  'admin-hub-network': 'core.network',
  'admin-hub-retention': null,
  'admin-hub-backup': null,
  'admin-hub-audit': 'core.audit',
  'admin-hub-system-health': 'core.health',
});

/** The same runtime binding inventory consumed by Administration.openTask.
 * The Foundation conformance check must not rely on source-code regexes
 * after replacing the legacy inline dispatch switch.
 */
export function registeredGrantAdministrationTaskIds(): string[] {
  return Object.keys(GRANT_TASKS).filter(
    (id) => GRANT_TASKS[id]?.destination.kind === 'detail',
  );
}

export function grantTaskForControlCatalogId(controlId: string): string | null {
  return Object.hasOwn(CONTROL_TO_GRANT_TASK, controlId)
    ? CONTROL_TO_GRANT_TASK[controlId] ?? null
    : null;
}

/** Fail closed on wrong target, unauthorized actor or unavailable capability.
 * Backend Grant API authorization is independently mandatory for every write.
 */
export function resolveGrantAdministrationSelection(
  selected: AdministrationHubTask,
  role: User['role'],
): GrantAdministrationSelection | null {
  if (role !== 'admin' || selected.availability === 'unavailable'
    || selected.access === 'none') return null;
  if (!Object.hasOwn(GRANT_TASKS, selected.id)) return null;
  const contract = GRANT_TASKS[selected.id];
  if (!contract || contract.access !== selected.access || !selected.target) return null;
  if (contract.access === 'manage' && selected.availability !== 'supported') return null;
  if (selected.target.kind === 'path') {
    return contract.destination.kind === 'route' && selected.target.path === contract.target
      ? contract.destination : null;
  }
  if (selected.target.kind === 'action') {
    return contract.destination.kind === 'detail' && selected.target.actionId === contract.target
      ? contract.destination : null;
  }
  return null;
}
