/** Grant-owned explicit account-disable review of an existing admin API.
 *
 * Foundation supplies the already-loaded account projection but does NOT
 * authorize or perform any user mutation. The current Grant server session
 * and /admin/users/{id}/disable remain the authoritative security boundary.
 */
import type { AccountProjection } from '@datarelay-labs/foundation';
import type { User } from './types';

export type AccountDisableReview = Readonly<{
  actorId: string;
  accountId: string;
  displayName: string;
  detail: string | null;
  roleValue: string | null;
  status: 'enabled';
}>;

export function createAccountDisableReview(
  target: AccountProjection,
  actor: User,
): AccountDisableReview {
  if (actor.role !== 'admin' ||
    !target.id || target.id === actor.id ||
    !target.displayName?.trim() || target.status !== 'enabled') {
    throw Error('ACCOUNT_DISABLE_REVIEW_UNAVAILABLE');
  }
  return Object.freeze({
    actorId: actor.id,
    accountId: target.id,
    displayName: target.displayName,
    detail: target.detail ?? null,
    roleValue: target.role?.value ?? null,
    status: 'enabled' as const,
  });
}

/** Match the exact account snapshot again after a fresh authenticated GET. */
export function isCurrentAccountDisableReview(
  intent: AccountDisableReview | null,
  actor: User,
  accounts: readonly AccountProjection[],
): intent is AccountDisableReview {
  if (!intent || actor.role !== 'admin' || !actor.id ||
    intent.actorId !== actor.id || intent.accountId === actor.id) return false;
  const matches = accounts.filter((account) => account.id === intent.accountId);
  if (matches.length !== 1) return false;
  const current = matches[0];
  if (!current) return false;
  return current.status === 'enabled' &&
    current.displayName === intent.displayName &&
    (current.detail ?? null) === intent.detail &&
    (current.role?.value ?? null) === intent.roleValue;
}
