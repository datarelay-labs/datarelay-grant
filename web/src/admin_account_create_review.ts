/** Review a proposed Grant administrator-created user without storing or
 * rendering their raw initial password in the review intent.
 * The privileged backend remains authoritative for all validation/RBAC.
 */
import type { User } from './types';

export const GRANT_PASSWORD_PATTERN = '(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,256}';
export const GRANT_PASSWORD_GUIDANCE = 'Use 8 or more characters with at least one uppercase letter, one number, and one special character.';

export function isValidGrantPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 256 &&
    /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
}

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
    !isValidGrantPassword(initialPassword)) {
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
    isValidGrantPassword(initialPassword));
}
