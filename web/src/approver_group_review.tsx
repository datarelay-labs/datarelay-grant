import { Alert, Button } from '@datarelay-labs/foundation';
import type { ApproverGroup } from './types';

/** Reviewable human intent, not a group mutation. Group member ORDER is
 * persisted by Grant and can be used by SEQUENTIAL approval policies.
 */
export type ApproverGroupSaveReview = {
  groupId: string | null;
  expectedUpdatedAt: number | null;
  originalName: string | null;
  originalEnabled: boolean | null;
  originalMembers: string[];
  name: string;
  memberIds: string[];
  added: string[];
  removed: string[];
  orderChanged: boolean;
};

export function prepareApproverGroupReview(
  baseline: ApproverGroup | null,
  name: string,
  memberIds: readonly string[],
): ApproverGroupSaveReview {
  if (!name.trim() || name.length > 100 || memberIds.length < 1 || memberIds.length > 50
    || memberIds.some((id) => typeof id !== 'string' || !id)
    || new Set(memberIds).size !== memberIds.length
    || (baseline && (!baseline.id || !Number.isFinite(baseline.updated_at)
      || baseline.updated_at <= 0))) {
    throw new Error('APPROVER_GROUP_REVIEW_INVALID');
  }
  const prior = baseline?.member_ids ?? [];
  const previousMembers = new Set(prior);
  const selectedMembers = new Set(memberIds);
  const oldRetained = prior.filter((id) => selectedMembers.has(id));
  const newRetained = memberIds.filter((id) => previousMembers.has(id));
  return {
    groupId: baseline?.id ?? null,
    expectedUpdatedAt: baseline?.updated_at ?? null,
    originalName: baseline?.name ?? null,
    originalEnabled: baseline?.enabled ?? null,
    originalMembers: [...prior],
    name,
    memberIds: [...memberIds],
    added: memberIds.filter((id) => !previousMembers.has(id)),
    removed: prior.filter((id) => !selectedMembers.has(id)),
    orderChanged: JSON.stringify(oldRetained) !== JSON.stringify(newRetained),
  };
}

export function isCurrentApproverGroupReview(
  reviewed: ApproverGroupSaveReview | null,
  baseline: ApproverGroup | null,
  name: string,
  memberIds: readonly string[],
): boolean {
  if (!reviewed) return false;
  try {
    return JSON.stringify(prepareApproverGroupReview(baseline, name, memberIds))
      === JSON.stringify(reviewed);
  } catch {
    return false;
  }
}

/** Move precisely one ID without mutation or implicit member replacement. */
export function moveApproverGroupMember(
  members: readonly string[], memberId: string, delta: -1 | 1,
): string[] {
  const index = members.indexOf(memberId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= members.length) return [...members];
  const reordered = [...members];
  [reordered[index], reordered[next]] = [reordered[next]!, reordered[index]!];
  return reordered;
}

/** The HTTP GET is a freshness guard; the backend's expected_updated_at
 * check inside the serialized transaction remains the atomic CAS.
 */
function sameSavedGroup(reviewed: ApproverGroupSaveReview, current: ApproverGroup | undefined) {
  return Boolean(reviewed.groupId && current
    && reviewed.groupId === current.id
    && reviewed.expectedUpdatedAt === current.updated_at
    && reviewed.originalName === current.name
    && reviewed.originalEnabled === current.enabled
    && JSON.stringify(reviewed.originalMembers) === JSON.stringify(current.member_ids));
}

/** React busy state is not synchronous. If a server write may have started,
 * do not issue another group POST until the operator explicitly refreshes.
 */
export function createApproverGroupSaveGuard() {
  let inFlight = false;
  let attempted = false;
  let postStarted = false;
  return {
    claim(): boolean {
      if (inFlight || attempted) return false;
      inFlight = true;
      attempted = true;
      postStarted = false;
      return true;
    },
    markPostStarted(): void {
      if (!inFlight) throw new Error('APPROVER_GROUP_SAVE_CLAIM_REQUIRED');
      postStarted = true;
    },
    settled(): void {
      inFlight = false;
      if (!postStarted) attempted = false;
    },
    readSucceeded(): boolean {
      if (inFlight) return false;
      attempted = false;
      postStarted = false;
      return true;
    },
    blocked(): boolean { return inFlight || attempted; },
  };
}

/** Called ONLY after a separate operator-visible final Confirm.
 * A creation needs no existing-group read; updates require exact saved
 * identity, revision, ordered membership, enabled state and name.
 * No retry, automatic group update or new permissions are introduced.
 */
export async function submitReviewedApproverGroupSave<T>(
  reviewed: ApproverGroupSaveReview,
  guard: ReturnType<typeof createApproverGroupSaveGuard>,
  readSaved: () => Promise<ApproverGroup[]>,
  postOnce: (intent: ApproverGroupSaveReview) => Promise<T>,
): Promise<T | null> {
  if (!guard.claim()) return null;
  try {
    if (reviewed.groupId) {
      const rows = await readSaved();
      if (!sameSavedGroup(reviewed, rows.find((row) => row.id === reviewed.groupId))) {
        throw new Error('APPROVER_GROUP_CHANGED_REVIEW_REQUIRED');
      }
    }
    guard.markPostStarted();
    return await postOnce(reviewed);
  } finally {
    guard.settled();
  }
}

/** An ambiguous/mismatched receipt may still represent a committed POST.
 * A successful HTTP response alone does not authorize false UI success.
 */
export function verifyApproverGroupSaveReceipt(
  reviewed: ApproverGroupSaveReview,
  result: ApproverGroup,
): ApproverGroup {
  if (!result || !result.id
      || (reviewed.groupId && result.id !== reviewed.groupId)
      || result.name !== reviewed.name
      || JSON.stringify(result.member_ids) !== JSON.stringify(reviewed.memberIds)
      || !Number.isFinite(result.updated_at)
      || result.updated_at <= (reviewed.expectedUpdatedAt ?? 0)
      || (reviewed.originalEnabled !== null
        && result.enabled !== reviewed.originalEnabled)) {
    throw new Error('APPROVER_GROUP_SAVE_RECEIPT_MISMATCH');
  }
  return result;
}

export function ApproverGroupSaveConfirmation({
  reviewed, valid, busy, accounts, onCancel, onConfirm,
}: {
  reviewed: ApproverGroupSaveReview | null;
  valid: boolean;
  busy: boolean;
  accounts: readonly { id: string; displayName: string }[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!reviewed) return null;
  const display = (id: string) =>
    accounts.find((account) => account.id === id)?.displayName ?? ('Unavailable account · ' + id);
  return (
    <Alert tone="warning" title="Confirm approver group changes">
      <p>This modifies the set of users who may be assigned to future
        approval requests. Existing request snapshots are unchanged. An
        approval decision and external execution remain separate actions.</p>
      <dl className="grant-facts">
        <dt>Change type</dt>
        <dd>{reviewed.groupId ? 'Update existing group' : 'Confirm create group'}</dd>
        <dt>Previous name</dt><dd>{reviewed.originalName ?? 'New group'}</dd>
        <dt>Reviewed group name</dt><dd>{reviewed.name}</dd>
        <dt>Previous member count</dt><dd>{reviewed.originalMembers.length}</dd>
        <dt>Reviewed member count</dt><dd>{reviewed.memberIds.length}</dd>
        <dt>Members added</dt>
        <dd>{reviewed.added.length
          ? reviewed.added.map(display).join(', ') : 'None'}</dd>
        <dt>Members removed</dt>
        <dd>{reviewed.removed.length
          ? reviewed.removed.map(display).join(', ') : 'None'}</dd>
      </dl>
      <p><strong>Approval member order</strong> (exact proposed sequence).
        Sequential approval policies can be affected by this order.</p>
      <ol>
        {reviewed.memberIds.map((id, index) =>
          <li key={id}>{index + 1}. {display(id)}</li>)}
      </ol>
      {reviewed.orderChanged && <p role="status">Sequential approval policies:
        the relative order of existing approval seats has changed.</p>}
      {!valid && <p role="alert">Group membership, sequence, name or the
        saved revision changed. Review all proposed changes again.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Back to edit</Button>
        <Button disabled={busy || !valid} onClick={onConfirm}>Confirm save group</Button>
      </div>
    </Alert>
  );
}
