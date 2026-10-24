/** Grant-native projection for the optional original-Control AppShell frame.
 * This module does not elevate Grant capabilities or use Control's login,
 * session store, hardcoded streams/router, host adapters, or API endpoints.
 */
import type {
  ControlConsumerAppShellConfiguration,
  ControlConsumerShellNavGroup,
  ControlConsumerShellIcon,
} from '@datarelay-labs/control-clone';
import { productConfig } from './foundation.config';
import type { User } from './types';

const GROUPS = [
  { id: 'user-workspace', label: 'User workspace' },
  { id: 'approval-administration', label: 'Approval administration' },
  { id: 'system-administration', label: 'System administration' },
] as const;
const ICONS: Record<string, ControlConsumerShellIcon> = {
  home: 'home', activity: 'activity', users: 'users', settings: 'settings',
  shield: 'shield', inbox: 'inbox', workflow: 'workflow',
};
const HIDDEN = new Set(['identity.admin.mfa', 'management.acl', 'roles.manage', 'sessions.admin']);

/** Only the authenticated Grant user and configured capability inventory can expose a route.
 * Backend API guards remain the definitive permission boundary.
 */
export function grantControlShellConfiguration(user: User): ControlConsumerAppShellConfiguration {
  const product = productConfig(user);
  const isAdmin = user.role === 'admin';
  const caps = product.capabilities as Record<string, unknown>;
  const groups: ControlConsumerShellNavGroup[] = GROUPS.map(group => ({
    id: group.id, label: group.label, items: [],
  }));
  for (const route of product.navigation) {
    const required = 'requiredCapability' in route ? route.requiredCapability : undefined;
    const available = typeof required === 'string' ? caps[required] : true;
    const access: 'view' | 'manage' | 'none' =
      typeof required === 'string' && HIDDEN.has(required) ? 'none'
      : available === false || available == null || available === 'unavailable' ? 'none'
      : available === 'read_only' ? 'view'
      : isAdmin && required ? 'manage' : 'view';
    const section = 'section' in route ? route.section?.id : undefined;
    const group = groups.find(row => row.id === section);
    if (!group) continue;
    group.items.push({
      id: route.id,
      label: route.label,
      path: route.path,
      icon: ICONS[route.icon ?? 'activity'] ?? 'activity',
      access,
    });
  }
  // Personal security is a real session-backed Grant route, for both roles.
  // It is not an administrator-wide MFA/ACL/Roles/Sessions entitlement.
  groups[0]!.items.push({
    id: 'account-security', label: 'Account & security',
    path: '/security', icon: 'shield', access: 'view',
  });
  return {
    productLabel: product.product.name,
    homePath: '/home',
    actor: {
      name: user.username,
      roleLabel: isAdmin ? 'Administrator' : 'Member',
      canRead: true,
      canManage: isAdmin,
    },
    groups: groups.filter(group => group.items.some(item => item.access !== 'none')),
  };
}
