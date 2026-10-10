import { Alert, Button } from '@datarelay-labs/foundation';
import type { Outcome, RequestRow, User } from './types';

export type RequestDecisionChoice = Outcome | 'CANCELLED';
export type RequestDecisionReview = {
  requestId: string;
  actorId: string;
  revision: number;
  actionHash: string;
  actionKind: string;
  actionTarget: string;
  choice: RequestDecisionChoice;
  reason: string;
};

/** Presentation permission guard only; server revalidates role, seat,
 * policy, revision, requester identity and all execution boundaries.
 */
function canReviewChoice(
  row: RequestRow, user: User, choice: RequestDecisionChoice, nowSeconds: number,
): boolean {
  if (choice === 'CANCELLED') {
    return !row.execution_id && !['CANCELLED', 'DENIED', 'EXPIRED'].includes(row.state)
      && (row.requester_id === user.id || user.role === 'admin');
  }
  return ['APPROVED', 'HELD', 'DENIED'].includes(choice)
    && ['AWAITING', 'HELD'].includes(row.state)
    && row.deadline > nowSeconds
    && row.collaboration_state === 'OPEN'
    && row.viewer_can_decide === true
    && row.requester_id !== user.id;
}

export function prepareRequestDecisionReview(
  row: RequestRow, user: User, choice: RequestDecisionChoice,
  reason: string, nowSeconds: number,
): RequestDecisionReview | null {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1
    || reason.length > 2000 || !canReviewChoice(row, user, choice, nowSeconds)) {
    return null;
  }
  return {
    requestId: row.id, actorId: user.id, revision: row.revision,
    actionHash: row.action_hash, actionKind: row.action.kind,
    actionTarget: row.action.target, choice, reason,
  };
}

/** A reason edit, changed user/seat, state, action or revision invalidates
 * the displayed confirmation, before the only POST is attempted.
 */
export function isCurrentRequestDecisionReview(
  reviewed: RequestDecisionReview | null,
  row: RequestRow, user: User, reason: string, nowSeconds: number,
): boolean {
  if (!reviewed) return false;
  const current = prepareRequestDecisionReview(
    row, user, reviewed.choice, reason, nowSeconds,
  );
  return current !== null
    && current.requestId === reviewed.requestId
    && current.actorId === reviewed.actorId
    && current.revision === reviewed.revision
    && current.actionHash === reviewed.actionHash
    && current.actionKind === reviewed.actionKind
    && current.actionTarget === reviewed.actionTarget
    && current.choice === reviewed.choice
    && current.reason === reviewed.reason;
}

export function RequestDecisionConfirmation({
  row, user, reviewed, reason, nowSeconds, busy, onConfirm, onBack,
}: {
  row: RequestRow;
  user: User;
  reviewed: RequestDecisionReview | null;
  reason: string;
  nowSeconds: number;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  if (!reviewed || !isCurrentRequestDecisionReview(
    reviewed, row, user, reason, nowSeconds,
  )) return null;
  return (
    <Alert tone="warning" title={'Confirm: ' + reviewed.choice}>
      <p>Review the exact human decision before recording it. No external action is executed by this confirmation.</p>
      <dl className="grant-facts">
        <dt>Operation</dt><dd>{reviewed.actionKind}</dd>
        <dt>Target</dt><dd>{reviewed.actionTarget}</dd>
        <dt>Revision</dt><dd>{reviewed.revision}</dd>
        <dt>Decision</dt><dd>{reviewed.choice}</dd>
        <dt>Reason</dt><dd>{reviewed.reason || 'Not provided'}</dd>
      </dl>
      <p>Approval does not itself execute the action. A different reason, target, reviewer, or request revision requires a new review.</p>
      <Button disabled={busy} onClick={onConfirm}>
        Confirm {reviewed.choice.toLowerCase()}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onBack}>Go back</Button>
    </Alert>
  );
}
