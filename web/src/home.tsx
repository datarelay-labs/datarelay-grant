import { useEffect, useMemo, useState } from 'react';
import { Button, Card, StatusBadge } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask, when } from './common';
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
  const task = useTask();

  async function load() {
    setRows(await api<RequestRow[]>('/requests?limit=100&offset=0'));
  }

  useEffect(() => {
    void task.run(load);
  }, []);

  const now = Date.now() / 1000;
  const mine = useMemo(
    () => rows.filter((row) => (row.approval_plan?.members ?? [row.approver_id]).includes(user.id)),
    [rows, user.id],
  );
  const needsDecision = mine.filter((row) => ['AWAITING', 'HELD'].includes(row.state));
  const overdue = mine.filter(
    (row) => ['AWAITING', 'HELD'].includes(row.state) && row.deadline <= now,
  );
  const deliveryFailures = rows.filter((row) => row.delivery_state === 'FAILED');
  const executionExceptions = rows.filter(isExecutionException);
  const recent = [...rows].sort((a, b) => b.created_at - a.created_at).slice(0, 6);

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

      <section className="grant-action-summary" aria-label="Action summary">
        <button type="button" onClick={() => navigate('/approvals')}>
          <span>Needs my decision</span>
          <strong>{needsDecision.length}</strong>
          <small>Assigned approvals waiting for you</small>
        </button>
        <button type="button" onClick={() => navigate('/approvals')}>
          <span>Overdue</span>
          <strong>{overdue.length}</strong>
          <small>Assigned work past its deadline</small>
        </button>
        <button type="button" onClick={() => navigate('/requests')}>
          <span>Delivery failures</span>
          <strong>{deliveryFailures.length}</strong>
          <small>Notification delivery needs attention</small>
        </button>
        <button type="button" onClick={() => navigate('/requests')}>
          <span>Execution exceptions</span>
          <strong>{executionExceptions.length}</strong>
          <small>Approved-not-consumed, failed or unknown</small>
        </button>
      </section>

      <div className="grant-home-grid">
        <Card
          title="Needs your attention"
          description="The approval inbox is the primary decision work queue."
          actions={<StatusBadge tone={needsDecision.length ? 'warning' : 'success'}>{needsDecision.length} open</StatusBadge>}
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
          {!needsDecision.length ? <p>No assigned requests need a decision right now.</p> : null}
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
