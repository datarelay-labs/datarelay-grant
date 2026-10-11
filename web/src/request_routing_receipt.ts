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
  | { status: 'readback_unavailable'; row: null };

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
  let projection: RequestRow | null = null;
  if (review.kind === 'escalation') {
    // The acknowledged revision is not the role-scoped current request.
    await postEscalation(review);
  } else {
    projection = await postReassignment({
      from_approver_id: review.from, to_approver_id: review.to,
      reason: review.reason, expected_revision: review.revision,
    });
  }
  if (projection?.id === review.requestId && projection.revision > review.revision) {
    return { status: 'updated', row: projection };
  }
  try {
    const fresh = await readCurrent();
    if (fresh.id === review.requestId && fresh.revision > review.revision) {
      return { status: 'updated', row: fresh };
    }
  } catch {
    // A successful POST is already recorded; no automatic retry of a write.
  }
  return { status: 'readback_unavailable', row: null };
}
