/** Grant-owned task projection for the original Control Administration UI.
 * Grant backend and exact allowlisted UI dispatcher remain the authority.
 */
import {
  ADMINISTRATION_CORE_GROUPS,
  type AdministrationCoreTask,
  type AdministrationExtensionGroup,
  type AdministrationHubTask,
} from '@datarelay-labs/foundation';
import type {
  ControlConsumerAdministration,
  ControlConsumerAdminTask,
} from '@datarelay-labs/control-clone';
import type { User } from './types';

function projectTask(task: AdministrationHubTask): ControlConsumerAdminTask {
  const description = [task.description, task.notes].filter(Boolean).join(' ');
  const target = task.target
    ? task.target.kind === 'path'
      ? { kind: 'route' as const, path: task.target.path }
      : { kind: 'action' as const, actionId: task.target.actionId }
    : undefined;
  return {
    id: task.id,
    label: task.label,
    ...(description ? { description } : {}),
    availability: task.availability,
    access: task.access,
    ...(target ? { target } : {}),
  };
}

export function grantControlConsumerAdministration(
  user: User,
  tasks: readonly AdministrationCoreTask[],
  extensionGroups: readonly AdministrationExtensionGroup[],
): ControlConsumerAdministration {
  const groups: ControlConsumerAdministration['groups'] = ADMINISTRATION_CORE_GROUPS.map(
    group => ({
      id: group.id,
      title: group.title,
      description: group.description,
      tasks: tasks.filter(task => task.groupId === group.id).map(projectTask),
    }),
  );
  for (const extension of extensionGroups) {
    const id = extension.id.replace(/\./g, '-');
    const next = {
      id,
      title: extension.title,
      description: extension.description,
      tasks: extension.tasks.map(projectTask),
    };
    const after = extension.after
      ? groups.findIndex(group => group.id === extension.after) : -1;
    groups.splice(after >= 0 ? after + 1 : groups.length, 0, next);
  }
  const admin = user.role === 'admin';
  return {
    actor: {
      label: admin ? 'Grant administrator · ' + user.username : 'Grant member',
      canRead: admin,
      canManage: admin,
    },
    groups,
    purpose: 'Shared Control Administration interface with Grant-owned tasks. Unsupported native host and account privileges remain unavailable.',
  };
}
