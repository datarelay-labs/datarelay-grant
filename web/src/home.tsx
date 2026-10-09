import { useEffect, useState } from 'react';
import { Button, Card, StatusBadge } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask, when } from './common';
import { collectVisibleRequestPages, projectHomeWorkspace, requesterProgress } from './home_pages';
import type { HomeWorkspace } from './home_pages';
import type { RequestRow, User } from './types';

type Navigate = (path: string) => void;

/** Task-first role projection: decision work is primary, administrator
 * exceptions secondary. No request is approved or executed from Home.
 */
export function HomeWorkspaceContent({
  user, view, summaryComplete, busy, feedback, navigate, refresh,
}: {
  user: User;
  view: HomeWorkspace;
  summaryComplete: boolean;
  busy: boolean;
  feedback?: React.ReactNode;
  navigate: Navigate;
  refresh: () => void;
}) {
  const count = (value: number) => summaryComplete ? String(value) : '≥' + value;
  const admin = user.role === 'admin';

  return (
    <div className="grant-stack">
      {feedback}
      <section className="grant-home-intro" aria-labelledby="grant-home-title">
        <div>
          <p className="grant-eyebrow">Your approval workspace</p>
          <h2 id="grant-home-title">Good to see you, {user.username}</h2>
          <p>Review work assigned to you and track requests you submitted.
            Approval, notification delivery and external execution are separate.</p>
        </div>
        <div className="grant-actions">
          <Button onClick={() => navigate('/requests/new')}>New request</Button>
          <Button variant="secondary" disabled={busy} onClick={refresh}>Refresh</Button>
        </div>
      </section>

      {!summaryComplete ? (
        <p role="status">These are lower-bound counts from the first 1,000 visible
          requests. Open the full work queue to see every matching request.</p>
      ) : null}

      <section
        className="grant-action-summary"
        aria-label="My work at a glance"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}
      >
        <button type="button" onClick={() => navigate('/approvals')}>
          <span>Needs my decision</span>
          <strong>{count(view.decisions.length)}</strong>
          <small>Assigned to me and ready for review</small>
        </button>
        <button type="button" onClick={() => {
          // Preserve the G12 deep link. The existing router reads pathname;
          // request_inbox reads this allowlisted query parameter on load.
          window.location.assign('/approvals?view=overdue');
        }}>
          <span>Overdue approvals</span>
          <strong>{count(view.overdue.length)}</strong>
          <small>Assigned deadlines or escalations</small>
        </button>
        <button type="button" onClick={() => navigate('/my-requests')}>
          <span>My requests</span>
          <strong>{count(view.submitted.length)}</strong>
          <small>Requests I submitted and can follow up</small>
        </button>
      </section>

      {view.needsResponse.length ? (
        <Card
          title="Your response is needed"
          description="Provide the requested information or review the changes. No approval is assumed."
          actions={<StatusBadge tone="warning">{count(view.needsResponse.length)} waiting</StatusBadge>}
        >
          {view.needsResponse.slice(0, 4).map((row) => (
            <button
              className="grant-work-item"
              type="button"
              key={row.id}
              onClick={() => navigate('/requests/' + row.id)}
            >
              <span>
                <strong>{row.title}</strong>
                <small>{requesterProgress(row)} · deadline {when(row.deadline)}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          <Button variant="secondary" onClick={() => navigate('/my-requests')}>Open my requests</Button>
        </Card>
      ) : null}

      <div className="grant-home-grid">
        <Card
          title="Decisions awaiting you"
          description="The most urgent eligible approvals first. Open a request to make an explicit decision."
          actions={<StatusBadge tone={view.decisions.length || !summaryComplete ? 'warning' : 'success'}>
            {count(view.decisions.length)} ready
          </StatusBadge>}
        >
          {view.decisions.slice(0, 5).map((row) => (
            <button
              type="button"
              className="grant-work-item"
              key={row.id}
              onClick={() => navigate('/requests/' + row.id)}
            >
              <span>
                <strong>{row.title}</strong>
                <small>{row.state === 'HELD' ? 'On hold' : 'Decision needed'}
                  {row.viewer_delegated_for ? ' · delegated to you' : ''}
                  {' · due ' + when(row.deadline)}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          {!view.decisions.length ? (
            <p>{summaryComplete
              ? 'No assigned decisions are ready right now.'
              : 'No ready decisions in the loaded subset. Check the full approval queue.'}</p>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/approvals')}>
            Open approval queue
          </Button>
        </Card>

        <Card
          title="My submitted requests"
          description="The latest requests you created, showing decision and execution progress separately."
        >
          {view.recent.map((row) => (
            <button
              type="button"
              className="grant-work-item"
              key={row.id}
              onClick={() => navigate('/requests/' + row.id)}
            >
              <span>
                <strong>{row.title}</strong>
                <small>{requesterProgress(row)} · submitted {when(row.created_at)}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          {!view.recent.length ? (
            <p>{summaryComplete
              ? 'You have not submitted a request yet.'
              : 'No submitted requests in the loaded subset. Check My requests.'}</p>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/my-requests')}>
            See all my requests
          </Button>
        </Card>
      </div>

      {admin ? (
        <Card
          title="Operations follow-up"
          description="Secondary administrative exceptions. Resolve them in the permission-checked operations queue."
          actions={<Button variant="secondary" onClick={() => navigate('/operations')}>
            Open operations
          </Button>}
        >
          <div className="grant-config-links">
            <button type="button" onClick={() => navigate('/operations/queue/delivery_failed')}>
              <strong>Delivery failures · {count(view.deliveryFailures.length)}</strong>
              <small>SMTP or callback delivery problems; acceptance is not execution</small>
            </button>
            <button type="button" onClick={() => navigate('/operations/queue/approved_unused')}>
              <strong>Approved, not consumed · {count(view.approvedUnused.length)}</strong>
              <small>Human decision recorded; the external action is still pending</small>
            </button>
            <button type="button" onClick={() => navigate('/operations/queue/execution_unknown')}>
              <strong>Execution unknown · {count(view.executionUnknown.length)}</strong>
              <small>External completion requires reconciliation</small>
            </button>
            <button type="button" onClick={() => navigate('/operations/queue/execution_failed')}>
              <strong>Execution failed · {count(view.executionFailed.length)}</strong>
              <small>Executor reported failure; approval alone does not retry execution</small>
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function Home({ user, navigate }: { user: User; navigate: Navigate }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [summaryComplete, setSummaryComplete] = useState(true);
  const task = useTask();

  async function load() {
    const snapshot = await collectVisibleRequestPages((limit, offset) =>
      api<RequestRow[]>('/requests?limit=' + limit + '&offset=' + offset),
    );
    setRows(snapshot.rows);
    setSummaryComplete(snapshot.complete);
  }

  useEffect(() => { void task.run(load); }, []);

  const view = projectHomeWorkspace(rows, user.id, user.role === 'admin', Date.now() / 1000);

  return <HomeWorkspaceContent
    user={user}
    view={view}
    summaryComplete={summaryComplete}
    busy={task.busy}
    feedback={task.feedback}
    navigate={navigate}
    refresh={() => { void task.run(load); }}
  />;
}
