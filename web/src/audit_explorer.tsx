import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask, when } from './common';

type AuditItem = {
  id: string; at: number; action: string; actor: string;
  request_id: string | null; details: Record<string, string | number | boolean>;
};
type AuditPage = {
  total: number; limit: number; offset: number; has_more: boolean; items: AuditItem[];
};
type RequestEvidence = {
  request: {
    id: string; profile_id: string; profile_version_id: string | null;
    action_hash: string; state: string; decision: string | null;
    execution_state: string; execution_id: string | null;
  };
  total_events: number; events_truncated: boolean; events: AuditItem[];
  decisions: { actor_id: string; decision: string; decided_at: number }[];
  comments: { id: string; author_id: string; kind: string; created_at: number }[];
  comments_total: number; comments_truncated: boolean;
  deliveries: { id: string; kind: string; event_type: string; state: string; attempts: number }[];
  current_is_execution_verified: false;
};
type Filters = { search: string; action: string; actor: string; request_id: string; since: string; until: string };
const emptyFilters: Filters = { search: '', action: '', actor: '', request_id: '', since: '', until: '' };

function encode(value: string | number): string {
  return encodeURIComponent(String(value)).replace(/[!'()*~]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

function filterQuery(filters: Filters, offset: number, limit: number): string {
  const params: Record<string, string | number> = { offset, limit };
  for (const [key, value] of Object.entries(filters)) {
    if (!value.trim()) continue;
    if (key === 'since') {
      params.since = Math.floor(new Date(value + 'T00:00:00').getTime() / 1000);
    } else if (key === 'until') {
      params.until = Math.floor(new Date(value + 'T23:59:59').getTime() / 1000);
    } else {
      params[key] = value;
    }
  }
  return Object.entries(params)
    .filter(([, value]) => typeof value === 'string' || Number.isFinite(value))
    .map(([key, value]) => key + '=' + encode(value)).join('&');
}

export function AuditExplorer() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AuditPage | null>(null);
  const [chain, setChain] = useState<RequestEvidence | null>(null);
  const task = useTask();

  async function load() {
    setPage(await api<AuditPage>('/admin/audit/search?' + filterQuery(applied, offset, 50)));
  }

  useEffect(() => { void task.run(load); }, [applied, offset]);

  function edit(field: keyof Filters, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function search() {
    const since = draft.since ? new Date(draft.since + 'T00:00:00').getTime() : 0;
    const until = draft.until ? new Date(draft.until + 'T23:59:59').getTime() : Number.MAX_VALUE;
    if (since > until) {
      task.setNotice('The start date must not be after the end date.');
      return;
    }
    setOffset(0);
    setChain(null);
    setApplied({ ...draft });
  }

  function reset() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setOffset(0);
    setChain(null);
  }

  function download(format: 'csv' | 'json') {
    // GET is restricted to the current authenticated admin session. The
    // browser downloads a server-produced, bounded, sanitized export.
    const filters = filterQuery(applied, offset, 1000);
    const url = '/api/v1/admin/audit/export?format=' + format + '&' + filters;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'grant-audit-export.' + format;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function inspect(requestId: string) {
    setChain(await api<RequestEvidence>('/admin/audit/chain/' + encode(requestId)));
  }

  return <div className="grant-stack">
    {task.feedback}
    <Card title="Audit evidence explorer" description="Search recorded approval and administration events. Only typed evidence references are exported; arbitrary note text is excluded.">
      <div className="grant-grid">
        <TextField label="Search audit events" value={draft.search} maxLength={100}
          onChange={(event) => edit('search', event.target.value)} />
        <TextField label="Event action" value={draft.action} maxLength={128}
          onChange={(event) => edit('action', event.target.value)} />
        <TextField label="Recorded actor" value={draft.actor} maxLength={128}
          onChange={(event) => edit('actor', event.target.value)} />
        <TextField label="Request ID" value={draft.request_id} maxLength={100}
          onChange={(event) => edit('request_id', event.target.value)} />
        <TextField label="From date" type="date" value={draft.since}
          onChange={(event) => edit('since', event.target.value)} />
        <TextField label="Through date" type="date" value={draft.until}
          onChange={(event) => edit('until', event.target.value)} />
      </div>
      <div className="grant-actions">
        <Button disabled={task.busy} onClick={search}>Search evidence</Button>
        <Button variant="secondary" disabled={task.busy} onClick={reset}>Clear filters</Button>
        <Button variant="secondary" disabled={task.busy} onClick={() => download('csv')}>Export CSV</Button>
        <Button variant="secondary" disabled={task.busy} onClick={() => download('json')}>Export JSON</Button>
      </div>
      <p>The exported page is limited to 1,000 events. For more events, page through the results. CSV fields are protected against spreadsheet formulas.</p>
      {page && <p><strong>{page.total}</strong> matching events · showing {page.items.length} starting at {page.offset}</p>}
      <div className="grant-table-scroll"><table className="grant-table">
        <thead><tr><th>Time</th><th>Event</th><th>Recorded actor</th><th>Request</th><th>Safe metadata</th></tr></thead>
        <tbody>{page?.items.map((item) => <tr key={item.id}>
          <td>{when(item.at)}</td><td>{item.action}</td><td>{item.actor}</td>
          <td>{item.request_id ? <Button variant="ghost" onClick={() => void task.run(() => inspect(item.request_id!))}>
            Inspect request evidence
          </Button> : 'System event'}</td>
          <td><code>{JSON.stringify(item.details)}</code></td>
        </tr>)}</tbody>
      </table></div>
      {page && !page.items.length && <p>No matching audit events.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={!offset || task.busy}
          onClick={() => setOffset(Math.max(0, offset - 50))}>Previous page</Button>
        <span>Page {Math.floor(offset / 50) + 1}</span>
        <Button variant="secondary" disabled={!page?.has_more || task.busy}
          onClick={() => setOffset(offset + 50)}>Next page</Button>
      </div>
    </Card>
    {chain && <Card title="Request-to-result evidence chain" description="Read-only linkage of current authority and persisted historical events. Reported execution outcomes are not independently verified.">
      {chain.events_truncated && <Alert tone="warning" title="Evidence page bounded">
        This request has more events than the first 1,000. Use the filtered audit list and export for additional events.
      </Alert>}
      {chain.comments_truncated && <Alert tone="warning" title="Comment history bounded">
        Only the first 1,000 comment references are included in this evidence summary. Review the request collaboration history for additional comments.
      </Alert>}
      <dl className="grant-facts">
        <dt>Request</dt><dd>{chain.request.id}</dd>
        <dt>Matched policy</dt><dd>{chain.request.profile_id}</dd>
        <dt>Policy snapshot</dt><dd>{chain.request.profile_version_id || 'Legacy'}</dd>
        <dt>Action hash</dt><dd className="grant-mono">{chain.request.action_hash}</dd>
        <dt>Human decision</dt><dd>{chain.request.decision ?? chain.request.state}</dd>
        <dt>Execution state</dt><dd>{chain.request.execution_state}</dd>
        <dt>Event count</dt><dd>{chain.total_events}</dd>
        <dt>Recorded decisions</dt><dd>{chain.decisions.length}</dd>
        <dt>Comments</dt><dd>{chain.comments_total}</dd>
        <dt>Transport records</dt><dd>{chain.deliveries.length}</dd>
      </dl>
      <div className="grant-stack">
        {chain.events.map((event) => <div className="grant-timeline" key={event.id}>
          <strong>{event.action}</strong>
          <small>{when(event.at)} · {event.actor}</small>
          <pre>{JSON.stringify(event.details, null, 2)}</pre>
        </div>)}
      </div>
    </Card>}
  </div>;
}
