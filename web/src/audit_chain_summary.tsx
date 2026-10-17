import { Alert, Button, Card } from '@datarelay-labs/foundation';
import './audit-mobile.css';
import { when } from './common';

export type AuditEvent = {
  id: string; at: number; action: string; actor: string;
  request_id: string | null;
  details: Record<string, string | number | boolean>;
};
export type AuditChainReport = {
  request: {
    id: string; profile_id: string; profile_version_id: string | null;
    action_hash: string; state: string; decision: string | null;
    execution_state: string; execution_id: string | null;
  };
  total_events: number;
  events_truncated: boolean;
  events: AuditEvent[];
  decisions: { actor_id: string; decision: string; decided_at: number }[];
  comments: { id: string; author_id: string; kind: string; created_at: number }[];
  comments_total: number;
  comments_truncated: boolean;
  deliveries: { id: string; kind: string; event_type: string; state: string; attempts: number }[];
  current_is_execution_verified: false;
};

/** Bounded audit event list. Keep the task identity and actor scannable,
 * but make technical metadata opt-in for keyboard and mobile users.
 * Inspector actions still call only the administrator role-scoped API.
 */
export function AuditEventTable({
  items, busy, onInspect,
}: {
  items: AuditEvent[];
  busy: boolean;
  onInspect: (requestId: string) => void;
}) {
  return (
    <>
    <div className="grant-table-scroll grant-audit-desktop-list">
      <table className="grant-table">
        <thead><tr>
          <th>Time</th><th>Event</th><th>Recorded actor</th>
          <th>Request</th><th>Safe metadata</th>
        </tr></thead>
        <tbody>
          {items.map((item) => <tr key={item.id}>
            <td>{when(item.at)}</td>
            <td>{item.action}</td>
            <td>{item.actor}</td>
            <td>{item.request_id ? (
              <Button variant="ghost" disabled={busy}
                onClick={() => onInspect(item.request_id!)}>
                Inspect request evidence
              </Button>
            ) : 'System event'}</td>
            <td>
              <details>
                <summary>View safe metadata</summary>
                <pre>{JSON.stringify(item.details, null, 2)}</pre>
              </details>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {/* The same validated, administrator-scoped saved audit rows. Mobile
        presentation never broadens history or triggers a new GET/export. */}
    <ul className="grant-audit-mobile-list" aria-label="Audit events mobile list">
      {items.map((item) => (
        <li key={item.id} className="grant-audit-mobile-card">
          <div className="grant-audit-mobile-heading">
            <strong>{item.action}</strong>
            <small>{when(item.at)}</small>
          </div>
          <dl className="grant-audit-mobile-facts">
            <div><dt>Recorded actor</dt><dd>{item.actor || 'Unavailable'}</dd></div>
            <div><dt>Request</dt><dd>{item.request_id ?? 'System event'}</dd></div>
          </dl>
          {item.request_id ? (
            <Button variant="secondary" disabled={busy}
              onClick={() => onInspect(item.request_id!)}>
              Inspect request evidence
            </Button>
          ) : null}
          <details className="grant-audit-mobile-metadata">
            <summary>View safe metadata</summary>
            <pre>{JSON.stringify(item.details, null, 2)}</pre>
          </details>
        </li>
      ))}
    </ul>
    </>
  );
}

/** Progressive task-first evidence for one server-projected request.
 * Chronology is preserved; raw metadata only expands upon explicit action.
 * Neither an executor report nor a transport record independently proves an
 * external business effect. Backend administrator RBAC remains authoritative.
 */
export function AuditEvidenceChain({ chain }: { chain: AuditChainReport }) {
  return (
    <Card
      title="Request-to-result evidence chain"
      description="Read-only historical references and current authority. Reported execution outcomes are not independently verified by Grant."
    >
      {chain.events_truncated && (
        <Alert tone="warning" title="Evidence page bounded">
          This request has more events than the first 1,000. Use the filtered
          audit list and bounded export for the remaining history.
        </Alert>
      )}
      {chain.comments_truncated && (
        <Alert tone="warning" title="Comment history bounded">
          Only the first 1,000 comment references are included in this
          evidence summary. Review request collaboration for remaining comments.
        </Alert>
      )}
      <dl className="grant-facts">
        <dt>Request</dt><dd>{chain.request.id}</dd>
        <dt>Matched policy</dt><dd>{chain.request.profile_id}</dd>
        <dt>Policy snapshot</dt><dd>{chain.request.profile_version_id || 'Legacy'}</dd>
        <dt>Action hash</dt><dd className="grant-mono">{chain.request.action_hash}</dd>
        <dt>Human decision</dt><dd>{chain.request.decision ?? chain.request.state}</dd>
        <dt>Reported execution</dt><dd>{chain.request.execution_state} · not independently verified</dd>
        <dt>Recorded events</dt><dd>{chain.total_events}</dd>
        <dt>Visible event references</dt><dd>{chain.events.length}</dd>
        <dt>Recorded decisions</dt><dd>{chain.decisions.length}</dd>
        <dt>Comments</dt><dd>{chain.comments_total}</dd>
        <dt>Transport records</dt><dd>{chain.deliveries.length}</dd>
      </dl>
      <section className="grant-stack" aria-label="Request audit activity">
        {chain.events.length ? chain.events.map((event) => (
          <details className="grant-timeline" key={event.id}>
            <summary>{event.action} · {when(event.at)} · {event.actor}</summary>
            <p><strong>View recorded metadata</strong></p>
            <pre>{JSON.stringify(event.details, null, 2)}</pre>
          </details>
        )) : (
          <p>No recorded events in this projected chain.</p>
        )}
      </section>
    </Card>
  );
}
