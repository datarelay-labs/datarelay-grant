import { useEffect, useRef } from 'react';
import { Alert, Button } from '@datarelay-labs/foundation';
import type { Outcome, RequestRow, User } from './types';

export type RequestDecisionChoice = Outcome | 'CANCELLED';
export type RequestDecisionReview = {
  requestId: string;
  actorId: string;
  /** Server records the represented approval seat for delegated decisions. */
  representedSeatId: string;
  revision: number;
  actionHash: string;
  actionKind: string;
  actionTarget: string;
  /** Exact immutable request and action snapshot shown at final Confirm. */
  requestTitle: string;
  externalId: string;
  actionParametersJson: string;
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
    requestId: row.id, actorId: user.id,
    representedSeatId: choice === 'CANCELLED' ? user.id : (row.viewer_delegated_for || user.id),
    revision: row.revision,
    actionHash: row.action_hash, actionKind: row.action.kind,
    actionTarget: row.action.target,
    requestTitle: row.title, externalId: row.external_id,
    actionParametersJson: JSON.stringify(row.action.parameters, null, 2),
    choice, reason,
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
    && current.representedSeatId === reviewed.representedSeatId
    && current.revision === reviewed.revision
    && current.actionHash === reviewed.actionHash
    && current.actionKind === reviewed.actionKind
    && current.actionTarget === reviewed.actionTarget
    && current.requestTitle === reviewed.requestTitle
    && current.externalId === reviewed.externalId
    && current.actionParametersJson === reviewed.actionParametersJson
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
  const reviewRegion = useRef<HTMLDivElement>(null);
  // Choosing a human vote opens a new review stage, not the committed POST.
  // Move focus to its named region so keyboard and screen-reader reviewers
  // can inspect the exact current seat/action before the separate Confirm.
  useEffect(() => {
    if (reviewed) reviewRegion.current?.focus();
  }, [reviewed]);
  if (!reviewed || !isCurrentRequestDecisionReview(
    reviewed, row, user, reason, nowSeconds,
  )) return null;
  return (
    <div ref={reviewRegion} role="region" aria-label="Review exact human decision" tabIndex={-1}>
    <Alert tone="warning" title={'Confirm: ' + reviewed.choice}>
      <p>Review the exact human decision before recording it. No external action is executed by this confirmation.</p>
      <dl className="grant-facts">
        <dt>Request title</dt><dd>{reviewed.requestTitle}</dd>
        <dt>External ID</dt><dd>{reviewed.externalId}</dd>
        <dt>Request ID</dt><dd><code>{reviewed.requestId}</code></dd>
        <dt>Operation</dt><dd>{reviewed.actionKind}</dd>
        <dt>Target</dt><dd>{reviewed.actionTarget}</dd>
        <dt>Action fingerprint</dt><dd><code>{reviewed.actionHash}</code></dd>
        <dt>Revision</dt><dd>{reviewed.revision}</dd>
        <dt>Acting user</dt><dd>{reviewed.actorId}</dd>
        {reviewed.choice !== 'CANCELLED' && <><dt>Reviewing approval seat</dt><dd>{reviewed.representedSeatId}</dd></>}
        <dt>Action parameters</dt><dd><pre>{reviewed.actionParametersJson}</pre></dd>
        <dt>Decision</dt><dd>{reviewed.choice}</dd>
        <dt>Reason</dt><dd>{reviewed.reason || 'Not provided'}</dd>
      </dl>
      <p>Approval does not itself execute the action. A different reason, target, reviewer, or request revision requires a new review.</p>
      <Button disabled={busy} onClick={onConfirm}>
        Confirm {reviewed.choice.toLowerCase()}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onBack}>Go back</Button>
    </Alert>
    </div>
  );
}
