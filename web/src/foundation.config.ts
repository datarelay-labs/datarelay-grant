import {
  defineProduct,
  type AccountsAdapter,
  type AuthAdapter,
  type AuthSessionSummary,
  type OperationsAdapter,
} from '@datarelay-labs/foundation';
import { api, setCsrf } from './api';
import type { Session, User } from './types';

export async function readSession(): Promise<Session> {
  const session = await api<Session>('/auth/session');
  setCsrf(session.csrf);
  return session;
}

export const authAdapter: AuthAdapter<User> = {
  async getPrincipal() {
    return (await readSession()).user;
  },
  async signIn(credentials) {
    const result = await api<{ state: string; csrf: string }>('/auth/login', 'POST', credentials);
    setCsrf(result.csrf);
    if (result.state === 'mfa_required') {
      return { state: 'mfa_required', methods: ['totp', 'recovery_code'] };
    }
    const session = await readSession();
    if (!session.user) throw new Error('Missing authenticated principal');
    return { state: 'authenticated', principal: session.user };
  },
  async signOut() {
    await api('/auth/logout', 'POST');
    setCsrf('');
  },
  async changePassword(input) {
    await api('/auth/password', 'POST', {
      current_password: input.currentPassword,
      new_password: input.newPassword,
    });
    setCsrf('');
  },
  async verifyMfa(input) {
    const result = await api<{ csrf: string }>('/auth/mfa/verify', 'POST', {
      code: input.value,
      recovery: input.method === 'recovery_code',
    });
    setCsrf(result.csrf);
    const session = await readSession();
    if (!session.user) throw new Error('Missing authenticated principal');
    return { state: 'authenticated', principal: session.user };
  },
  async listSessions() {
    return api<AuthSessionSummary[]>('/auth/sessions');
  },
  async revokeSession(id) {
    await api('/auth/sessions/' + encodeURIComponent(id), 'DELETE');
  },
};

export const accountsAdapter: AccountsAdapter = {
  list: () => api('/admin/users'),
};

export const operationsAdapter: OperationsAdapter = {
  readHealth: () => api('/admin/health'),
  readSystemInfo: () => api('/admin/info'),
  listAudit: () => api('/admin/audit'),
};

// Flat route records continue to power Grant's existing title/router lookup.
// Foundation projects the sections into role-filtered two-level navigation.
const USER_SECTION = { id: 'user-workspace', label: 'User workspace', icon: 'activity', defaultExpanded: true } as const;
const APPROVAL_ADMIN_SECTION = { id: 'approval-administration', label: 'Approval administration', icon: 'settings' } as const;
const SYSTEM_ADMIN_SECTION = { id: 'system-administration', label: 'System administration', icon: 'settings' } as const;

export function productConfig(user: User) {
  const admin = user.role === 'admin';
  return defineProduct({
    product: {
      id: 'grant',
      name: 'DataRelay Grant',
      shortName: 'Grant',
      subtitle: 'Approval Control Platform',
      homePath: '/home',
    },
    navigation: [
      { id: 'home', label: 'Home', path: '/home', icon: 'home', group: 'User workspace', section: USER_SECTION },
      { id: 'new-request', label: 'New request', path: '/requests/new', icon: 'activity', group: 'User workspace', section: USER_SECTION },
      { id: 'approvals', label: 'My approvals', path: '/approvals', icon: 'activity', group: 'User workspace', section: USER_SECTION },
      { id: 'my-requests', label: 'My requests', path: '/my-requests', icon: 'activity', group: 'User workspace', section: USER_SECTION },
      { id: 'delegations', label: 'Delegations', path: '/delegations', icon: 'users', group: 'User workspace', section: USER_SECTION },
      {
        id: 'workflow-setup',
        label: 'Workflow setup',
        path: '/admin/setup',
        icon: 'settings',
        group: 'Approval administration',
        section: APPROVAL_ADMIN_SECTION,
        requiredCapability: 'grant.approval_policy.manage',
      },
      {
        id: 'approvers',
        label: 'Approver groups',
        path: '/approvers',
        icon: 'settings',
        group: 'Approval administration',
        section: APPROVAL_ADMIN_SECTION,
        requiredCapability: 'grant.approval_policy.manage',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        path: '/integrations',
        icon: 'settings',
        group: 'Approval administration',
        section: APPROVAL_ADMIN_SECTION,
        requiredCapability: 'grant.integrations.manage',
      },
      {
        id: 'notifications',
        label: 'Notification templates',
        path: '/notifications',
        icon: 'settings',
        group: 'Approval administration',
        section: APPROVAL_ADMIN_SECTION,
        requiredCapability: 'grant.notifications.manage',
      },
      {
        id: 'profiles',
        label: 'Approval policies',
        path: '/profiles',
        icon: 'settings',
        group: 'Approval administration',
        section: APPROVAL_ADMIN_SECTION,
        requiredCapability: 'grant.approval_policy.manage',
      },
      {
        id: 'requests',
        label: 'All requests',
        path: '/requests',
        icon: 'activity',
        group: 'Approval administration',
        section: APPROVAL_ADMIN_SECTION,
        requiredCapability: 'grant.requests.admin',
      },
      {
        id: 'operations',
        label: 'Operations',
        path: '/operations',
        icon: 'activity',
        group: 'System administration',
        section: SYSTEM_ADMIN_SECTION,
        requiredCapability: 'health.read',
      },
      {
        id: 'audit',
        label: 'Audit explorer',
        path: '/audit',
        icon: 'activity',
        group: 'System administration',
        section: SYSTEM_ADMIN_SECTION,
        requiredCapability: 'audit.read',
      },
      {
        id: 'system',
        label: 'System management',
        path: '/system',
        icon: 'settings',
        group: 'System administration',
        section: SYSTEM_ADMIN_SECTION,
        requiredCapability: 'health.read',
      },
    ],
    capabilities: {
      'grant.integrations.manage': admin,
      'grant.requests.admin': admin,
      'grant.approval_policy.manage': admin,
      'grant.notifications.manage': admin,
      'grant.smtp.test': admin ? 'supported' : 'unavailable',
      'grant.lifecycle.guidance': admin ? 'read_only' : 'unavailable',
      'health.read': admin ? 'read_only' : 'unavailable',
      'system.info.read': admin ? 'read_only' : 'unavailable',
      'users.read': admin ? 'read_only' : 'unavailable',
      'users.manage': admin ? 'supported' : 'unavailable',
      'audit.read': admin ? 'read_only' : 'unavailable',
      'identity.password.change': 'supported',
      'identity.mfa.totp': 'supported',
      'identity.mfa.recovery': 'supported',
      'session.list': 'supported',
      'session.revoke': 'supported',
      'tls.configure': 'unavailable',
      'upgrade.product.apply': 'unavailable',
      'backup.disaster_recovery.restore': 'unavailable',
    },
    adapters: {
      auth: authAdapter,
      accounts: accountsAdapter,
      operations: operationsAdapter,
    },
  });
}
