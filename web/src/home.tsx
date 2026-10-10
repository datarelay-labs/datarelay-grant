import { useEffect, useMemo, useState } from 'react';
import { Button, Card, StatusBadge } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask, when } from './common';
import { collectVisibleRequestPages } from './home_pages';
import type { RequestRow, User } from './types';

type Navigate = (path: string) => void;

function isExecutionException(row: RequestRow): boolean {
  return (
    (row.state === 'APPROVED' && row.execution_state === 'NOT_STARTED') ||
    row.execution_state.includes('UNKNOWN') ||
    row.execution_state.includes('FAILED')
  );
}

export function Home({ user, navigate }: { user: User; navigate: Navigate }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [summaryComplete, setSummaryComplete] = useState(true);
  const task = useTask();

  async function load() {
    const snapshot = await collectVisibleRequestPages((limit, offset) =>
      api<RequestRow[]>(`/requests?limit=${limit}&offset=${offset}`),
    );
    setRows(snapshot.rows);
    setSummaryComplete(snapshot.complete);
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  const now = Date.now() / 1000;
  const mine = useMemo(() => rows.filter((row) => row.viewer_assigned), [rows]);
  const needsDecision = mine.filter((row) => row.viewer_can_decide);
  const overdue = mine.filter(
    (row) => row.overdue || (row.state === 'EXPIRED' && row.deadline <= now),
  );
  const deliveryFailures = rows.filter(
    (row) => row.delivery_state === 'FAILED' || (row.notification_failure_count ?? 0) > 0,
  );
  const executionExceptions = rows.filter(isExecutionException);
  const recent = [...rows].sort((a, b) => b.created_at - a.created_at).slice(0, 6);
  const displayCount = (value: number) => summaryComplete ? String(value) : `≥${value}`;

  return (
    <div className="grant-stack">
      {task.feedback}
      <section className="grant-home-intro" aria-labelledby="grant-home-title">
        <div>
          <p className="grant-eyebrow">Approval control</p>
          <h2 id="grant-home-title">Work that needs a human decision</h2>
          <p>
            Grant starts with actionable approval work and exceptions rather than charts.
            Every summary leads back to concrete requests.
          </p>
        </div>
        <div className="grant-actions">
          <Button onClick={() => navigate('/requests/new')}>New request</Button>
          <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>
            Refresh
          </Button>
        </div>
      </section>

      {!summaryComplete ? (
        <p role="status">Summary totals are lower bounds from the first 1,000 visible requests. Open a work queue for all matching requests.</p>
      ) : null}

      <section className="grant-action-summary" aria-label="Action summary">
        <button type="button" onClick={() => navigate('/approvals')}>
          <span>Needs my decision</span>
          <strong>{displayCount(needsDecision.length)}</strong>
          <small>Assigned approvals waiting for you</small>
        </button>
        <button type="button" onClick={() => { window.location.assign('/approvals?view=overdue'); }}>
          <span>Overdue</span>
          <strong>{displayCount(overdue.length)}</strong>
          <small>Escalation due or approval deadline expired</small>
        </button>
        <button type="button" onClick={() => navigate('/requests')}>
          <span>Delivery failures</span>
          <strong>{displayCount(deliveryFailures.length)}</strong>
          <small>Notification delivery needs attention</small>
        </button>
        <button type="button" onClick={() => navigate('/requests')}>
          <span>Execution exceptions</span>
          <strong>{displayCount(executionExceptions.length)}</strong>
          <small>Approved-not-consumed, failed or unknown</small>
        </button>
      </section>

      <div className="grant-home-grid">
        <Card
          title="Needs your attention"
          description="The approval inbox is the primary decision work queue."
          actions={<StatusBadge tone={needsDecision.length || !summaryComplete ? 'warning' : 'success'}>{displayCount(needsDecision.length)} open</StatusBadge>}
        >
          {needsDecision.slice(0, 4).map((row) => (
            <button
              type="button"
              className="grant-work-item"
              key={row.id}
              onClick={() => navigate('/requests/' + row.id)}
            >
              <span>
                <strong>{row.title}</strong>
                <small>{row.state} · deadline {when(row.deadline)}</small>
              </span>
              <span aria-hidden>›</span>
            </button>
          ))}
          {!needsDecision.length ? (
            <p>{summaryComplete
              ? 'No assigned requests need a decision right now.'
              : 'No decisions found in the loaded subset. Open the full approvals queue.'}</p>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/approvals')}>
            Open my approvals
          </Button>
        </Card>

        <Card
          title="Recent requests"
          description="Decision, delivery and execution remain visible as separate states."
        >
          {recent.map((row) => (
            <button
              type="button"
              className="grant-work-item"
              key={row.id}
              onClick={() => navigate('/requests/' + row.id)}
            >
              <span>
                <strong>{row.title}</strong>
                <small>{row.state} · {row.execution_state}</small>
              </span>
              <span aria-hidden>›</span>
            </button>
          ))}
          {!recent.length ? <p>No requests have been created yet.</p> : null}
          <Button variant="secondary" onClick={() => navigate('/requests')}>
            Browse requests
          </Button>
        </Card>

        {user.role === 'admin' ? (
          <Card
            title="Configure Grant"
            description="Administration is separated from approval work and opens focused configuration surfaces."
          >
            <div className="grant-config-links">
              <button type="button" onClick={() => navigate('/profiles')}>
                <strong>Approval policies</strong>
                <small>Draft, test, activate, preview and history</small>
              </button>
              <button type="button" onClick={() => navigate('/notifications')}>
                <strong>Notifications</strong>
                <small>Template sets, delivery health and branding</small>
              </button>
              <button type="button" onClick={() => navigate('/integrations')}>
                <strong>Integrations</strong>
                <small>Sources, credentials and delivery endpoints</small>
              </button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
