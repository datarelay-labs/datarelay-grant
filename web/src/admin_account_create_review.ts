/** Review a proposed Grant administrator-created user without storing or
 * rendering their raw initial password in the review intent.
 * The privileged backend remains authoritative for all validation/RBAC.
 */
import type { User } from './types';

export type AccountCreateReview = Readonly<{
  actorId: string;
  username: string;
  email: string;
  role: 'admin' | 'member';
  secretLength: number;
}>;

export function createAccountCreationReview(
  actor: User,
  username: string, email: string, role: string, initialPassword: string,
): AccountCreateReview {
  if (actor.role !== 'admin' || !actor.id ||
    !username || !email ||
    (role !== 'admin' && role !== 'member') ||
    initialPassword.length < 12 || initialPassword.length > 256) {
    throw Error('ACCOUNT_CREATE_REVIEW_UNAVAILABLE');
  }
  return Object.freeze({
    actorId: actor.id,
    username,
    email,
    role,
    // Only an opaque property of the local password, never the credential.
    // Any real input change must separately discard this review at once.
    secretLength: initialPassword.length,
  });
}

export function isCurrentAccountCreateReview(
  intent: AccountCreateReview | null,
  actor: User,
  username: string, email: string, role: string, initialPassword: string,
): intent is AccountCreateReview {
  return Boolean(intent &&
    actor.role === 'admin' && intent.actorId === actor.id &&
    username === intent.username && email === intent.email &&
    role === intent.role && initialPassword.length === intent.secretLength &&
    initialPassword.length >= 12 && initialPassword.length <= 256);
}
