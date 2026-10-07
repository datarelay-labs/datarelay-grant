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
      { id: 'home', label: 'Home', path: '/home', icon: 'home' },
      { id: 'approvals', label: 'My approvals', path: '/approvals', icon: 'activity', group: 'Work' },
      { id: 'requests', label: 'Requests', path: '/requests', icon: 'home', group: 'Work' },
      {
        id: 'profiles',
        label: 'Approval policies',
        path: '/profiles',
        icon: 'settings',
        group: 'Configuration',
        requiredCapability: 'grant.approval_policy.manage',
      },
      {
        id: 'approvers',
        label: 'Approvers',
        path: '/approvers',
        icon: 'settings',
        group: 'Configuration',
        requiredCapability: 'grant.approval_policy.manage',
      },
      {
        id: 'notifications',
        label: 'Notifications',
        path: '/notifications',
        icon: 'settings',
        group: 'Configuration',
        requiredCapability: 'grant.notifications.manage',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        path: '/integrations',
        icon: 'settings',
        group: 'Configuration',
        requiredCapability: 'grant.integrations.manage',
      },
      {
        id: 'system',
        label: 'Administration',
        path: '/system',
        icon: 'settings',
        group: 'Administration',
        requiredCapability: 'health.read',
      },
    ],
    capabilities: {
      'grant.integrations.manage': admin,
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
