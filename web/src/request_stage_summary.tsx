import { State } from './common';
import type { RequestRow } from './types';

/** The external integration owns effects and readback; Grant only reports the
 * state it has been told. Neither human approval nor SMTP transport proves it.
 */
function executionExplanation(state: string): string {
  switch (state) {
    case 'NOT_STARTED':
      return 'No external effect is confirmed by this request state.';
    case 'COMMITTED':
      return 'An execution commitment was recorded, but no external effect is independently verified.';
    case 'RUNNING':
      return 'The connected system reports work in progress; the effect is not independently verified.';
    case 'REPORTED_SUCCEEDED':
      return 'The connected system reported success; this is not independently verified by Grant.';
    case 'REPORTED_FAILED':
      return 'The connected system reported failure; this is not independently verified by Grant.';
    case 'UNKNOWN':
      return 'The outcome is unknown; do not assume success or repeat execution without reconciliation.';
    default:
      return 'External execution state is a report, not independently verified evidence of an effect.';
  }
}

/** Task-first, safe presentation only: no approval, resend or execution CTA. */
export function RequestStageSummary({ row }: { row: RequestRow }) {
  return (
    <section aria-label="Request action and workflow stages">
      <p><strong>Action requiring approval</strong></p>
      <dl className="grant-facts">
        <dt>Operation</dt><dd>{row.action.kind}</dd>
        <dt>Target</dt><dd>{row.action.target}</dd>
      </dl>
      <div className="grant-statuses" role="group" aria-label="Separate human, transport and external-effect states">
        <div>
          <strong>Human decision</strong>
          <p><State value={row.state} /></p>
          <small>A human approval authorizes only a bounded grant; it does not execute the action.</small>
        </div>
        <div>
          <strong>Notification transport</strong>
          <p><State value={row.delivery_state} /></p>
          <small>Delivery is transport status, not proof of mailbox receipt or human approval.</small>
        </div>
        <div>
          <strong>Reported external execution</strong>
          <p><State value={row.execution_state} /></p>
          <small>{executionExplanation(row.execution_state)}</small>
        </div>
      </div>
      {row.collaboration_state === 'INFO_REQUESTED' && (
        <p role="status"><strong>Waiting for requester information.</strong> Approval is paused until the requester responds.</p>
      )}
      {row.collaboration_state === 'CHANGES_REQUESTED' && (
        <p role="status"><strong>Request changes required.</strong> The action needs a replacement request and fresh approval.</p>
      )}
    </section>
  );
}
