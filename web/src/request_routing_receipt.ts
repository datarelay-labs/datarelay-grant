import type { RequestRow } from './types';

type RoutingBase = {
  requestId: string;
  actionHash: string;
  revision: number;
};
export type AdminRoutingIntent =
  | (RoutingBase & { kind: 'escalation'; target: string; afterSeconds: number })
  | (RoutingBase & { kind: 'reassignment'; from: string; to: string; reason: string });

export type EscalationReceipt = { request_id: string; revision: number };
export type ReassignmentPayload = {
  from_approver_id: string;
  to_approver_id: string;
  reason: string;
  expected_revision: number;
};
export type RoutingReadback =
  | { status: 'updated'; row: RequestRow }
  | { status: 'readback_unavailable'; row: null }
  | { status: 'receipt_unverified'; row: null };

/** Fail closed on the current role-scoped request projection before the
 * administrator's one explicit routing POST. The server owns final RBAC,
 * seat availability, revision/CAS, and durable routing consequences.
 */
export function isCurrentAdminRoutingIntent(
  review: AdminRoutingIntent | null,
  row: RequestRow,
): boolean {
  if (!review || row.id !== review.requestId
    || !Number.isSafeInteger(review.revision) || review.revision < 1
    || row.revision !== review.revision
    || row.action_hash !== review.actionHash
    || !['AWAITING', 'HELD'].includes(row.state)
    || row.execution_id !== null) return false;
  if (review.kind === 'escalation') {
    const [category, personId] = review.target.split(':', 2);
    return (category === 'user' || category === 'group')
      && Boolean(personId)
      && Number.isSafeInteger(review.afterSeconds)
      && review.afterSeconds >= 60 && review.afterSeconds <= 604800;
  }
  const members = row.approval_plan?.members ?? [row.approver_id];
  const oldSeatVoted = (row.decisions ?? []).some((vote) => vote.actor_id === review.from);
  return !!review.from && !!review.to && review.from !== review.to
    && !!review.reason.trim() && review.reason.length <= 2000
    && members.includes(review.from) && !members.includes(review.to)
    && row.requester_id !== review.to && !oldSeatVoted;
}

/** Only a projection with the reviewed immutable action may be shown as the
 * current routing result. The server still makes the actual routing decision.
 */
function matchesRoutingProjection(
  updated: RequestRow, reviewed: AdminRoutingIntent, original: RequestRow,
  minimumRevision: number,
): boolean {
  return updated?.id === reviewed.requestId
    && updated.action_hash === reviewed.actionHash
    && updated.action?.kind === original.action.kind
    && updated.action?.target === original.action.target
    && Number.isSafeInteger(updated.revision)
    && updated.revision >= minimumRevision;
}

/** POST is never retried. Reassignment's own projected RequestRow is already
 * authoritative and avoids a fragile mandatory secondary GET. Escalation's
 * server reply is only a revision receipt, so one read-only GET is useful,
 * but its failure after successful POST must not be portrayed as POST failure.
 */
export async function submitReviewedRequestRouting(
  review: AdminRoutingIntent,
  row: RequestRow,
  postEscalation: (intent: Extract<AdminRoutingIntent, {kind:'escalation'}>) => Promise<EscalationReceipt>,
  postReassignment: (payload: ReassignmentPayload) => Promise<RequestRow>,
  readCurrent: () => Promise<RequestRow>,
): Promise<RoutingReadback> {
  if (!isCurrentAdminRoutingIntent(review, row)) {
    throw new Error('ROUTING_CHANGED_REVIEW_REQUIRED');
  }
  if (review.kind === 'reassignment') {
    const projection = await postReassignment({
      from_approver_id: review.from, to_approver_id: review.to,
      reason: review.reason, expected_revision: review.revision,
    });
    // A mismatched POST projection cannot prove this approver replacement.
    // Reading some independently advanced revision would not prove it either.
    const seats = projection?.approval_plan?.members;
    if (!matchesRoutingProjection(projection, review, row, review.revision + 1)
        || !seats?.includes(review.to) || seats?.includes(review.from) === true) {
      return { status: 'receipt_unverified', row: null };
    }
    return { status: 'updated', row: projection };
  }

  // The escalation reply is only a revision acknowledgement, never a
  // role-visible projected request. Validate it before any optional readback.
  const receipt = await postEscalation(review);
  if (receipt?.request_id !== review.requestId
      || !Number.isSafeInteger(receipt.revision)
      || receipt.revision <= review.revision) {
    return { status: 'receipt_unverified', row: null };
  }
  try {
    const fresh = await readCurrent();
    if (matchesRoutingProjection(fresh, review, row, receipt.revision)) {
      return { status: 'updated', row: fresh };
    }
  } catch {
    // An acknowledged POST must never be retried because a later GET fails.
  }
  return { status: 'readback_unavailable', row: null };
}
