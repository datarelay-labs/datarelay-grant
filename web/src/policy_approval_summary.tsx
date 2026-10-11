import type { ApproverGroup, Profile } from './types';

/** Explain the effective *policy configuration*, not the incidental
 * representative approver_id projected for a group-backed policy.
 * Membership and eligibility remain authoritative on the backend.
 */
export function policyApprovalRuleSummary(
  policy: Profile,
  groups: readonly Pick<ApproverGroup, 'id' | 'name' | 'member_ids' | 'enabled'>[],
  approvers: readonly { id: string; displayName: string }[],
): string {
  if (policy.approval_mode === 'SINGLE') {
    const match = approvers.find((user) => user.id === policy.approver_id);
    return 'Single approver · ' + (match?.displayName ?? 'Approver unavailable');
  }
  if (!['ANY_ONE', 'ALL', 'N_OF_M', 'SEQUENTIAL'].includes(policy.approval_mode)) {
    return 'Approval rule unavailable';
  }
  // A malformed list projection must never fabricate group seats, quorum,
  // or an eligible reviewer. Backend group membership is authoritative.
  const candidates=groups.filter(row=>row.id===policy.approver_group_id);
  const group=candidates[0];
  if(candidates.length!==1||!group||!group.enabled||!group.member_ids.length){
    return policy.approval_mode+' · Group unavailable';
  }
  const ids=group.member_ids;
  if(ids.some(id=>typeof id!=='string'||!id.trim())
    ||new Set(ids).size!==ids.length){
    return policy.approval_mode+' · Group membership unavailable';
  }
  const total=ids.length;
  if (policy.approval_mode === 'N_OF_M') {
    const quorum = policy.approvals_required;
    if (!quorum || !Number.isSafeInteger(quorum) || quorum > total || quorum < 1) {
      return 'N_OF_M · ' + group.name + ' · Quorum unavailable';
    }
    return 'N_OF_M · ' + group.name + ' · ' + quorum + ' of ' + total + ' required';
  }
  const rule = policy.approval_mode === 'ANY_ONE'
    ? 'Any one of ' + total
    : policy.approval_mode === 'ALL'
      ? 'All ' + total
      : total + ' in group order';
  return policy.approval_mode + ' · ' + group.name + ' · ' + rule;
}

/** Read-only list cell only. It does not grant a reviewer access. */
export function PolicyApprovalSummary({
  policy, groups, approvers,
}: {
  policy: Profile;
  groups: readonly Pick<ApproverGroup, 'id' | 'name' | 'member_ids' | 'enabled'>[];
  approvers: readonly { id: string; displayName: string }[];
}) {
  return <span>{policyApprovalRuleSummary(policy, groups, approvers)}</span>;
}
