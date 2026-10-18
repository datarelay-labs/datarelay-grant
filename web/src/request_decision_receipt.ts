import type { RequestRow } from './types';
import type { RequestDecisionReview } from './request_decision_review';

export type DecisionReceiptBinding = Pick<
  RequestDecisionReview,
  'requestId' | 'revision' | 'actionHash' | 'actionKind' | 'actionTarget'
  | 'actorId' | 'representedSeatId' | 'choice' | 'reason'
>;

/** Only a projection of the exact reviewed immutable request may be shown
 * as recorded. An invalid POST receipt is an uncertain outcome, NOT permission
 * to retry. The server still owns the actual human decision and quorum.
 */
function matchesReviewedRequest(
  row: RequestRow, review: DecisionReceiptBinding, minimumRevision: number,
): boolean {
  return row?.id === review.requestId
    && row.action_hash === review.actionHash
    && row.action?.kind === review.actionKind
    && row.action?.target === review.actionTarget
    && Number.isSafeInteger(row.revision) && row.revision >= minimumRevision;
}

/** A decision is not proved by the request state alone: ALL/SEQUENTIAL
 * approvals may remain AWAITING after a particular seat votes. The backend
 * stores decisions under the represented seat, not necessarily the user
 * who acted as a time-limited delegate.
 */
function matchesHumanOutcome(row: RequestRow, review: DecisionReceiptBinding): boolean {
  if (review.choice === 'CANCELLED') {
    return row.state === 'CANCELLED' && row.execution_id === null;
  }
  const vote = row.decisions?.find((entry) =>
    entry.actor_id === review.representedSeatId,
  );
  if (!vote || vote.decision !== review.choice || vote.reason !== review.reason) {
    return false;
  }
  if (review.choice === 'APPROVED') {
    return ['APPROVED', 'AWAITING', 'HELD'].includes(row.state);
  }
  return row.state === review.choice;
}

/** A successful POST is authoritative ONLY for the exact reviewed action.
 * GET is a separate presentation refresh. Failed/lagging/changed readback
 * cannot turn a committed decision into a failed write or justify retry.
 */
export async function recordDecisionThenRead(
  submitOnce: () => Promise<RequestRow>,
  readOnlyRefresh: () => Promise<RequestRow>,
  review: DecisionReceiptBinding,
): Promise<{ row: RequestRow; refreshed: boolean }> {
  // Never retry or intercept an ambiguous POST.
  const receipt = await submitOnce();
  if (!matchesReviewedRequest(receipt, review, review.revision + 1)) {
    throw new Error('DECISION_POST_PROJECTION_MISMATCH');
  }
  if (!matchesHumanOutcome(receipt, review)) {
    throw new Error('DECISION_POST_OUTCOME_UNVERIFIED');
  }
  try {
    const current = await readOnlyRefresh();
    if (matchesReviewedRequest(current, review, receipt.revision)
        && matchesHumanOutcome(current, review)) {
      return { row: current, refreshed: true };
    }
  } catch {
    // Optional readback has no authority to undo a confirmed POST receipt.
  }
  return { row: receipt, refreshed: false };
}
