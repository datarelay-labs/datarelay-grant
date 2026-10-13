import { Card } from '@datarelay-labs/foundation';
import { when } from './common';
import { RequestActionSummary } from './request_action_summary';
import { RequestStageSummary } from './request_stage_summary';
import { RequestWorkflowGuide } from './request_workflow_guide';
import { RequestGrantScope } from './request_grant_scope';
import { InboxDeadlineTruth } from './request_inbox_deadline_truth';
import { approvalProgressLabel, approvalWaitingLabel } from './request_evidence';
import type { RequestRow } from './types';

/** Task-first request details as described by the accepted competitive
 * Grant UX blueprint: exact action before dense technical state/evidence.
 * This component is read-only, and cannot approve or execute anything.
 */
export function RequestDetailOverview({
  row, canReplace, navigate,
}: {
  row: RequestRow;
  canReplace: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <>
      <section className="grant-home-intro" aria-labelledby="grant-request-task-title">
        <div>
          <p className="grant-eyebrow">Request for human approval</p>
          <h2 id="grant-request-task-title">{row.title}</h2>
          <p>{row.reason || 'No additional reason supplied.'}</p>
        </div>
      </section>
      <RequestActionSummary row={row} canReplace={canReplace} navigate={navigate} />
      <Card
        title="Decision status and deadline"
        description="Current server-projected approval progress and assignment. Approval, delivery and external execution remain separate."
      >
        <RequestWorkflowGuide row={row} />
        {row.viewer_can_decide === true && ['AWAITING', 'HELD'].includes(row.state)
          && row.collaboration_state === 'OPEN' && row.deadline * 1000 > Date.now() && (
          <div className="grant-detail-next">
            <strong>Your next step</strong>
            <a href="#grant-decision-actions">Review the action, then choose Approve, Hold or Deny ↓</a>
          </div>
        )}
        {row.requester_id && row.viewer_can_decide !== true &&
          ['AWAITING', 'HELD'].includes(row.state) && (
          <p className="grant-intake-field-guide">Waiting for an assigned reviewer. Track the decision and delivery here; creating a request did not execute the action.</p>
        )}
        <dl className="grant-facts">
          <dt>External ID</dt><dd>{row.external_id}</dd>
          <dt>Approval deadline</dt><dd><InboxDeadlineTruth row={row} /></dd>
          <dt>Approval progress</dt><dd>{approvalProgressLabel(row)}</dd>
          <dt>Waiting on</dt><dd>{approvalWaitingLabel(row)}</dd>
        </dl>
        <details className="grant-detail-status-disclosure">
          <summary>Review current status and technical evidence</summary>
          <div>
            <RequestStageSummary row={row} />
            <RequestGrantScope row={row} />
            {row.viewer_delegated_for && (
              <p>You are acting as the recorded substitute for an assigned
                approver. Both identities remain auditable.</p>
            )}
            <details>
              <summary>Technical request metadata</summary>
              <dl className="grant-facts">
            <dt>Request ID</dt><dd><code>{row.id}</code></dd>
            <dt>Decision by / at</dt>
            <dd>{row.decision_actor ?? 'Not decided'} / {when(row.decision_at)}</dd>
            <dt>Revision</dt><dd>{row.revision}</dd>
              </dl>
            </details>
          </div>
        </details>
      </Card>
    </>
  );
}
