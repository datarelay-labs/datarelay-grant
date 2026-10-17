import { Button, Card } from '@datarelay-labs/foundation';
import type { ReactNode } from 'react';
import { State, when } from './common';
import type { RequestRow, Delivery } from './types';

/** A missing role-scoped server projection is not an approval or an implicit
 * default one-seat policy. Share these labels with the RequestDetail header.
 */
export function approvalProgressLabel(row: Pick<RequestRow, 'approval_progress'>): string {
  const progress = row.approval_progress;
  return progress
    ? `${progress.approved_count} of ${progress.required_count} approved`
    : 'Approval progress unavailable';
}

export function approvalWaitingLabel(row: Pick<RequestRow, 'approval_progress'>): string {
  const progress = row.approval_progress;
  if (!progress) return 'Waiting status unavailable';
  const waiting = progress.waiting_on.replaceAll('_', ' ');
  const group = progress.group_name ? ' · ' + progress.group_name : '';
  const reviewers = progress.waiting_approvers.map((person) => person.username).join(', ');
  return waiting + group + (reviewers ? ': ' + reviewers : '');
}

/** Technical transport/audit evidence follows the primary business decision.
 * Resending remains product-owned and is only surfaced to current administrators.
 */
export function RequestEvidence({
  row, isAdmin, busy, onReviewResend, blockedResendIds = [], resendConfirmation,
}: {
  row: RequestRow;
  isAdmin: boolean;
  busy: boolean;
  onReviewResend: (delivery: Delivery) => void;
  blockedResendIds?: readonly string[];
  resendConfirmation?: ReactNode;
}) {
  // The server already role-scopes this projection. Current votes represent
  // assigned approval seats, not independently verified human identities.
  // A later decision may supersede a Hold; the timeline retains the history.
  const votes = row.decisions ?? [];
  // A legacy approver_id is not an authoritative current approval plan.
  // Do not assign a visible seat number when the role-scoped plan is absent.
  const seats = row.approval_plan?.members ?? [];
  // Current quorum is authoritative only when the server supplies its
  // role-scoped approval progress. Archived votes may refer to superseded
  // approval seats and cannot establish a current approval threshold.
  const progress = row.approval_progress;
  // These are only current role-scoped arrays from this RequestDetail GET.
  // Omitted projections are unknown, never a factual zero or global count.
  const votesLabel = row.decisions === undefined
    ? 'Reviewer vote count unavailable'
    : `${votes.length} reviewer vote${votes.length === 1 ? '' : 's'}`;
  const deliveriesLabel = row.deliveries === undefined
    ? 'Delivery count unavailable'
    : `${row.deliveries.length} delivery attempt${row.deliveries.length === 1 ? '' : 's'}`;
  const timelineLabel = row.timeline === undefined
    ? 'Timeline count unavailable'
    : `${row.timeline.length} timeline event${row.timeline.length === 1 ? '' : 's'}`;
  return (
    <details className="grant-activity-disclosure">
      <summary>
        <strong>Activity & supporting evidence</strong>
        <span>{votesLabel} · {deliveriesLabel} · {timelineLabel}</span>
      </summary>
      <div className="grant-stack grant-activity-content">
        <p>Recorded decisions, notification attempts and request timeline.
          Expand these details when you need audit context; they never approve or execute an action.</p>
      <Card title="Reviewer decisions" description="Current seat votes, not a complete chronological history. Email PIN alone is not proof of the person. A vote is not itself authorization to execute. See Request timeline for prior changes.">
        <p>
          {progress ? (
            <strong>{approvalProgressLabel(row)}</strong>
          ) : (
            <>
              <strong>Approval progress unavailable</strong>
              {' · '}{row.decisions === undefined
                ? 'Recorded vote count unavailable'
                : `${votes.length} recorded vote${votes.length === 1 ? '' : 's'} (not verified quorum)`}
            </>
          )}
          {' · '}{row.approval_plan?.mode ?? 'Approval plan unavailable'}
        </p>
        {votes.length ? (
          <ul>
            {votes.map((vote) => {
              const index = seats.indexOf(vote.actor_id);
              return <li key={vote.actor_id}>
                <strong>{index >= 0 ? 'Approval seat ' + (index + 1) : 'Recorded reviewer vote'}</strong>
                {' · '}<State value={vote.decision} />
                <small>{when(vote.decided_at)}</small>
                <p>{vote.reason || 'No decision reason recorded.'}</p>
                <details>
                  <summary>Recorded approval seat reference</summary>
                  <code>{vote.actor_id}</code>
                </details>
              </li>;
            })}
          </ul>
        ) : <p>{row.decisions === undefined ? 'Reviewer vote list unavailable.' : 'No reviewer decisions recorded.'}</p>}
      </Card>
      <Card title="Delivery history" description="Transport acceptance does not prove external execution. Review before resending any notification; a reviewed resend never approves or executes the requested action.">
        {resendConfirmation}
        <details>
          <summary>Delivery attempts · {row.deliveries?.length ?? 'unavailable'}</summary>
          {row.deliveries?.map((delivery) => (
            <div className="grant-delivery" key={delivery.id}>
              <div>
                <strong>{delivery.kind}</strong> · <State value={delivery.state} />
                <small>{delivery.attempts} attempts {delivery.last_error ? '· ' + delivery.last_error : ''}</small>
              </div>
              {isAdmin && ['FAILED', 'PENDING'].includes(delivery.state) && (
                blockedResendIds.includes(delivery.id) ? (
                  <small role="status">A resend was requested or attempted. Refresh the request before another review.</small>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onReviewResend(delivery)}
                  >
                    Review resend {delivery.kind}
                  </Button>
                )
              )}
            </div>
          ))}
        </details>
      </Card>
      <Card title="Request timeline" description="An auditable record of request decisions and delivery/interaction events.">
        <details>
          <summary>Recorded events · {row.timeline?.length ?? 'unavailable'}</summary>
          {row.timeline?.map((event) => (
            <div className="grant-timeline" key={event.id}>
              <strong>{event.action}</strong>
              <small>{when(event.at)} · {event.actor}</small>
              <details>
                <summary>Event evidence</summary>
                <pre>{JSON.stringify(event.detail, null, 2)}</pre>
              </details>
            </div>
          ))}
        </details>
      </Card>
      </div>
    </details>
  );
}
