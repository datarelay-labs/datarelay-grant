import { useEffect, useState } from 'react';
import { Alert, Button, Card, StatusBadge } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask, when } from './common';
import type { Filters } from './request_inbox';

type Counts = {
  total: number;
  pending: number;
  overdue: number;
  held: number;
  approved: number;
  denied: number;
  expired: number;
  cancelled: number;
  approved_unused: number;
  execution_unknown: number;
  execution_failed: number;
  email_failed: number;
  webhook_failed: number;
  delivery_failed: number;
};
type IntegrationHealth = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  request_count: number;
  last_request_at: number | null;
  last_callback_accepted_at: number | null;
  failed_callback_events: number;
  health: 'disabled' | 'degraded' | 'transport_accepted' | 'not_verified';
};
type EmailSecurityKey =
  | 'active_issuances' | 'locked_issuances' | 'revoked_issuances'
  | 'consumed_issuances' | 'expired_issuances'
  | 'active_challenges' | 'locked_challenges' | 'verified_challenges'
  | 'pending_fresh_mfa';
type DecisionEmailSecurity = Partial<Record<EmailSecurityKey, number>> & {
  mailbox_code_is_mfa?: boolean;
  recipient_receipt_verified?: boolean;
};
type OperationsSummary = {
  as_of: number;
  recovery_paused: boolean;
  counts: Counts;
  approval_latency_seconds: number | null;
  approval_latency_median_seconds?: number | null;
  approval_latency_sample_count?: number;
  integrations: IntegrationHealth[];
  decision_email_security?: DecisionEmailSecurity;
  semantics: Record<string, string>;
};
type EmailSecurityRow = {
  key: EmailSecurityKey;
  stage: string;
  status: string;
  meaning: string;
};
const emailSecurityRows: EmailSecurityRow[] = [
  { key: 'active_issuances', stage: 'Decision links', status: 'Active',
    meaning: 'Unexpired issuances for open requests, not unique approvers.' },
  { key: 'locked_issuances', stage: 'Decision links', status: 'Locked',
    meaning: 'Issuances blocked by failed verification attempts.' },
  { key: 'expired_issuances', stage: 'Decision links', status: 'Expired',
    meaning: 'Issuances past their own verification expiry.' },
  { key: 'revoked_issuances', stage: 'Decision links', status: 'Revoked',
    meaning: 'Issuances no longer eligible to authorize a decision.' },
  { key: 'consumed_issuances', stage: 'Decision links', status: 'Consumed',
    meaning: 'Issuances recorded as consumed, not proof of named human identity.' },
  { key: 'active_challenges', stage: 'Separate email OTP', status: 'Active',
    meaning: 'Outstanding separately requested email OTP challenges.' },
  { key: 'locked_challenges', stage: 'Separate email OTP', status: 'Locked',
    meaning: 'Challenges blocked by failed verification attempts.' },
  { key: 'verified_challenges', stage: 'Separate email OTP', status: 'Verified',
    meaning: 'Completed email OTP challenges, not independent MFA.' },
  { key: 'pending_fresh_mfa', stage: 'Fresh independent MFA', status: 'Required',
    meaning: 'Open requests requiring fresh MFA under the decision policy or integration minimum.' },
];

function securityCount(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value) : 'Unavailable';
}

// The endpoint is admin-only. This component is a read-only aggregate display:
// it never obtains or exposes a recipient, PIN, opaque intent or any replay action.
export function DecisionEmailSecurityPanel({ summary }: {
  summary?: DecisionEmailSecurity | null;
}) {
  return <Card title="Email approval verification"
    description="Administrator-only issuance and challenge state, not a mailbox delivery or authenticated-user report.">
    {summary ? <div className="grant-table-scroll">
      <table className="grant-table" aria-label="Email decision verification lifecycle">
        <thead><tr>
          <th scope="col">Stage</th><th scope="col">Status</th>
          <th scope="col">Count</th><th scope="col">Meaning</th>
        </tr></thead>
        <tbody>{emailSecurityRows.map((row) => <tr key={row.key}>
          <th scope="row">{row.stage}</th>
          <td>{row.status}</td><td>{securityCount(summary[row.key])}</td>
          <td>{row.meaning}</td>
        </tr>)}</tbody>
      </table>
    </div> : <Alert tone="warning" title="Counters unavailable">
      This server did not provide email-decision security counters. No zero or healthy state is assumed.
    </Alert>}
    <p>A link and four-digit code in one email demonstrates mailbox access;
       it does not verify the named recipient. A same-mailbox OTP is not independent MFA.
       These counters do not confirm receipt or execution and cannot authorize actions.</p>
  </Card>;
}
type ApprovalLatencyReadout = {
  approval_latency_seconds?: number | null;
  approval_latency_median_seconds?: number | null;
  approval_latency_sample_count?: number;
};
function formattedMinutes(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? (value / 60).toFixed(1) + ' min' : null;
}
export function approvalLatencyPresentation(summary: ApprovalLatencyReadout | null): {
  primary: string;
  detail: string;
} {
  if (!summary) return { primary: '—', detail: 'Mean and median from final decisions' };
  const mean = formattedMinutes(summary.approval_latency_seconds);
  if (mean === null) {
    return summary.approval_latency_seconds === null && summary.approval_latency_sample_count === 0
      ? { primary: 'No decisions', detail: 'No recorded final decisions' }
      : { primary: 'Unavailable', detail: 'Mean unavailable for this server response' };
  }
  const median = formattedMinutes(summary.approval_latency_median_seconds);
  const count = summary.approval_latency_sample_count;
  const samples = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? ' · ' + count + ' final decisions' : '';
  return {
    primary: mean + ' avg',
    detail: (median === null ? 'Median unavailable' : median + ' median') + samples,
  };
}
type Metric = {
  key: keyof Counts | 'latency';
  title: string;
  description: string;
  queue: string;
};

// Queue presets are intentionally shared with the operator routes. Every
// dashboard card opens its precise, permission-checked underlying requests.
export const operatorPresets: Record<string, Partial<Filters>> = {
  all: { view: 'all' },
  pending: { view: 'ops_pending' },
  overdue: { view: 'ops_overdue' },
  held: { view: 'all', state: 'HELD' },
  decided: { view: 'ops_decided' },
  approved: { view: 'all', state: 'APPROVED' },
  denied: { view: 'all', state: 'DENIED' },
  expired: { view: 'all', state: 'EXPIRED' },
  cancelled: { view: 'all', state: 'CANCELLED' },
  delivery_failed: { view: 'ops_delivery_failed' },
  email_failed: { view: 'ops_email_failed' },
  webhook_failed: { view: 'ops_webhook_failed' },
  approved_unused: { view: 'ops_approved_unused' },
  execution_unknown: { view: 'ops_execution_unknown' },
  execution_failed: { view: 'ops_execution_failed' },
};
const overview: Metric[] = [
  { key: 'pending', title: 'Pending approvals', description: 'Awaiting a final human decision', queue: 'pending' },
  { key: 'overdue', title: 'Overdue', description: 'Expired approval deadlines or due escalations', queue: 'overdue' },
  { key: 'held', title: 'Held', description: 'Explicitly held decisions requiring review', queue: 'held' },
  { key: 'latency', title: 'Approval latency', description: 'Mean and median time to a final decision', queue: 'decided' },
];
const exceptions: Metric[] = [
  { key: 'delivery_failed', title: 'Delivery failed', description: 'Requests with failed SMTP or HTTP callback', queue: 'delivery_failed' },
  { key: 'approved_unused', title: 'Approved, not consumed', description: 'Approved execution grants still unused', queue: 'approved_unused' },
  { key: 'execution_unknown', title: 'Execution unknown', description: 'Executor reconciliation required', queue: 'execution_unknown' },
  { key: 'execution_failed', title: 'Execution failed', description: 'Executor reported failure', queue: 'execution_failed' },
  { key: 'expired', title: 'Approval expired', description: 'Requests now in expired state', queue: 'expired' },
];
const states: Metric[] = [
  { key: 'total', title: 'All requests', description: 'All recorded requests', queue: 'all' },
  { key: 'approved', title: 'Approved', description: 'Current approved state', queue: 'approved' },
  { key: 'denied', title: 'Denied', description: 'Explicit human denial', queue: 'denied' },
  { key: 'cancelled', title: 'Cancelled', description: 'Cancelled before execution', queue: 'cancelled' },
  { key: 'email_failed', title: 'Email failures', description: 'SMTP outbox failure', queue: 'email_failed' },
  { key: 'webhook_failed', title: 'Callback failures', description: 'Latest outgoing callback failure', queue: 'webhook_failed' },
];

export function Operations({ navigate }: { navigate: (next: string) => void }) {
  const [snapshot, setSnapshot] = useState<OperationsSummary | null>(null);
  const task = useTask();
  async function load() {
    setSnapshot(await api<OperationsSummary>('/admin/operations'));
  }
  useEffect(() => { void task.run(load); }, []);

  function metricValue(item: Metric): string {
    if (!snapshot) return '—';
    if (item.key === 'latency') return approvalLatencyPresentation(snapshot).primary;
    return String(snapshot.counts[item.key]);
  }
  const section = (title: string, items: Metric[], description: string) =>
    <section className="grant-stack" aria-label={title}>
      <Card title={title} description={description}>
        <div className="grant-action-summary">
          {items.map((item) => <button type="button" key={item.key}
            onClick={() => navigate('/operations/queue/' + item.queue)}>
            <span>{item.title}</span>
            <strong>{metricValue(item)}</strong>
            <small>{item.key === 'latency'
              ? approvalLatencyPresentation(snapshot).detail : item.description}</small>
          </button>)}
        </div>
      </Card>
    </section>;

  return <div className="grant-stack">
    {task.feedback}
    <section className="grant-page-heading">
      <div>
        <p className="grant-eyebrow">Administration · Approval operations</p>
        <h2>Operational work and exceptions</h2>
        <p>Derived from Grant's persisted decisions, delivery outbox and execution states.
           Every number opens its source requests; transport success is not business execution.</p>
        {snapshot && <small>Snapshot as of {when(snapshot.as_of)}</small>}
      </div>
      <div className="grant-actions">
        <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>Refresh</Button>
      </div>
    </section>
    {snapshot?.recovery_paused && <Alert tone="warning" title="Recovery pause active">
      Requests are in protected recovery mode. Reconcile restored external operations before resuming.
    </Alert>}
    {section('Approval work', overview, 'Actionable approval work and a measured decision latency, not an NOC-style chart.')}
    {section('Exceptions to resolve', exceptions, 'No exception card retries an action or grants an approval.')}
    {snapshot && <DecisionEmailSecurityPanel summary={snapshot.decision_email_security} />}
    {section('Request and delivery states', states, 'Each count represents distinct requests, never the number of delivery attempts.')}
    <Card title="Integration delivery health" description="Last callback is HTTP transport acceptance only, not target execution or receipt verification.">
      <div className="grant-table-scroll"><table className="grant-table">
        <thead><tr>
          <th>Integration</th><th>Transport observation</th><th>Requests</th>
          <th>Last request</th><th>Last accepted callback</th><th>Callback failures</th>
        </tr></thead>
        <tbody>{snapshot?.integrations.map((integration) => <tr key={integration.id}>
          <td>
            <Button variant="ghost" onClick={() => navigate('/operations/integration/' + integration.id)}>{integration.name}</Button>
            <small>{integration.kind}</small>
          </td>
          <td><StatusBadge tone={
            integration.health === 'degraded' ? 'critical'
              : integration.health === 'transport_accepted' ? 'success' : 'neutral'
          }>{integration.health.replaceAll('_', ' ')}</StatusBadge></td>
          <td>{integration.request_count}</td>
          <td>{when(integration.last_request_at)}</td>
          <td>{when(integration.last_callback_accepted_at)}</td>
          <td>{integration.failed_callback_events}</td>
        </tr>)}</tbody>
      </table></div>
      {snapshot && !snapshot.integrations.length && <p>No registered integrations.</p>}
    </Card>
  </div>;
}
