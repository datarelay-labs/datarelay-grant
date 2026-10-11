import { useEffect, useRef, useState } from 'react';
import { Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { useTask, when } from './common';
import { createAuditReadGate, verifyAuditChainIdentity } from './audit_read_guard';
import { AuditEvidenceChain, AuditEventTable, type AuditChainReport } from './audit_chain_summary';
import { auditFilterQuery as filterQuery, encodeAuditValue, type AuditFilterValues } from './audit_filters';

type AuditItem = {
  id: string; at: number; action: string; actor: string;
  request_id: string | null; details: Record<string, string | number | boolean>;
};
type AuditPage = {
  total: number; limit: number; offset: number; has_more: boolean; items: AuditItem[];
};
type RequestEvidence = AuditChainReport;
type Filters = AuditFilterValues;
const emptyFilters: Filters = { search: '', action: '', actor: '', request_id: '', since: '', until: '' };

export function AuditExplorer() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AuditPage | null>(null);
  const [chain, setChain] = useState<RequestEvidence | null>(null);
  const readGate = useRef(createAuditReadGate());
  const task = useTask();

  async function load() {
    const token = readGate.current.beginList();
    try {
      const result = await api<AuditPage>('/admin/audit/search?' + filterQuery(applied, offset, 50));
      if (readGate.current.listCurrent(token)) setPage(result);
    } catch (error) {
      // An abandoned filter/page fetch is not the current user's search.
      if (readGate.current.listCurrent(token)) throw error;
    }
  }

  useEffect(() => { void task.run(load); }, [applied, offset]);

  function edit(field: keyof Filters, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function search() {
    try {
      // Invalid calendar days must never silently disappear from the query.
      filterQuery(draft, 0, 50);
    } catch (error) {
      task.setNotice(error instanceof Error && error.message === 'AUDIT_DATE_RANGE_INVALID'
        ? 'The start date must not be after the end date.'
        : 'Enter valid calendar dates before searching evidence.');
      return;
    }
    readGate.current.invalidateAll();
    setPage(null);
    setOffset(0);
    setChain(null);
    setApplied({ ...draft });
  }

  function reset() {
    readGate.current.invalidateAll();
    setPage(null);
    setDraft(emptyFilters);
    setApplied({ ...emptyFilters });
    setOffset(0);
    setChain(null);
  }

  function changePage(nextOffset: number) {
    readGate.current.invalidateAll();
    setPage(null);
    setChain(null);
    setOffset(nextOffset);
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
    const token = readGate.current.beginChain();
    setChain(null);
    try {
      const raw = await api<RequestEvidence>('/admin/audit/chain/' + encodeAuditValue(requestId));
      const result = verifyAuditChainIdentity(requestId, raw);
      if (readGate.current.chainCurrent(token)) setChain(result);
    } catch (error) {
      if (readGate.current.chainCurrent(token)) throw error;
    }
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
      <AuditEventTable
        items={page?.items ?? []} busy={task.busy}
        onInspect={(requestId) => { void task.run(() => inspect(requestId)); }}
      />
      {page && !page.items.length && <p>No matching audit events.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={!offset || task.busy}
          onClick={() => changePage(Math.max(0, offset - 50))}>Previous page</Button>
        <span>Page {Math.floor(offset / 50) + 1}</span>
        <Button variant="secondary" disabled={!page?.has_more || task.busy}
          onClick={() => changePage(offset + 50)}>Next page</Button>
      </div>
    </Card>
    {chain && <AuditEvidenceChain chain={chain} />}
  </div>;
}
