import { Button, Card } from '@datarelay-labs/foundation';
import { State, when } from './common';
import type { RequestRow } from './types';

/** Technical transport/audit evidence follows the primary business decision.
 * Resending remains product-owned and is only surfaced to current administrators.
 */
export function RequestEvidence({
  row, isAdmin, busy, onResend,
}: {
  row: RequestRow;
  isAdmin: boolean;
  busy: boolean;
  onResend: (deliveryId: string) => void;
}) {
  // The server already role-scopes this projection. Current votes represent
  // assigned approval seats, not independently verified human identities.
  // A later decision may supersede a Hold; the timeline retains the history.
  const votes = row.decisions ?? [];
  const seats = row.approval_plan?.members ?? [row.approver_id];
  // Current quorum is authoritative only when the server supplies its
  // role-scoped approval progress. Archived votes may refer to superseded
  // approval seats and cannot establish a current approval threshold.
  const progress = row.approval_progress;
  return (
    <>
      <Card title="Reviewer decisions" description="Current seat votes, not a complete chronological history. Email PIN alone is not proof of the person. A vote is not itself authorization to execute. See Request timeline for prior changes.">
        <p>
          {progress ? (
            <strong>{progress.approved_count} of {progress.required_count} approved</strong>
          ) : (
            <>
              <strong>Approval progress unavailable</strong>
              {' · '}{votes.length} recorded vote{votes.length === 1 ? '' : 's'} (not verified quorum)
            </>
          )}
          {' · '}{row.approval_plan?.mode ?? 'Single approver'}
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
        ) : <p>No reviewer decisions recorded.</p>}
      </Card>
      <Card title="Delivery history" description="Transport acceptance does not prove external execution. Resend repeats only the notification.">
        <details>
          <summary>Delivery attempts · {row.deliveries?.length ?? 0}</summary>
          {row.deliveries?.map((delivery) => (
            <div className="grant-delivery" key={delivery.id}>
              <div>
                <strong>{delivery.kind}</strong> · <State value={delivery.state} />
                <small>{delivery.attempts} attempts {delivery.last_error ? '· ' + delivery.last_error : ''}</small>
              </div>
              {isAdmin && ['FAILED', 'PENDING'].includes(delivery.state) && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onResend(delivery.id)}
                >
                  Resend {delivery.kind}
                </Button>
              )}
            </div>
          ))}
        </details>
      </Card>
      <Card title="Request timeline" description="An auditable record of request decisions and delivery/interaction events.">
        <details>
          <summary>Recorded events · {row.timeline?.length ?? 0}</summary>
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
    </>
  );
}
