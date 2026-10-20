import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api, errorText } from './api';
import { when } from './common';
import { createAuditReadGate, verifyAuditChainIdentity } from './audit_read_guard';
import { AuditEvidenceChain, AuditEventTable, type AuditChainReport } from './audit_chain_summary';
import {
  createAuditWorklistScope, readCurrentAuditWorklist,
  currentAuditPageProjection, auditDraftHasChanges,
  canExportAuditPage, AuditCurrentSearchSummary,
  type AuditScopedPage,
} from './audit_worklist_current_query';
import { auditFilterQuery as filterQuery, encodeAuditValue, type AuditFilterValues } from './audit_filters';

type AuditPage=AuditScopedPage;
type RequestEvidence = AuditChainReport;
type Filters = AuditFilterValues;
const emptyFilters: Filters = { search: '', action: '', actor: '', request_id: '', since: '', until: '' };

export function AuditExplorer() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [storedPage,setStoredPage]=useState<{key:string;value:AuditPage}|null>(null);
  const [selectedChain,setSelectedChain]=useState<{
    query:string;requestId:string;value:RequestEvidence;
  }|null>(null);
  const [selectedRequestId,setSelectedRequestId]=useState('');
  const selectedRequestRef=useRef('');
  const [listBusy,setListBusy]=useState(false);
  const [listError,setListError]=useState('');
  const [chainError,setChainError]=useState('');
  const [chainBusy,setChainBusy]=useState(false);
  const listGate=useRef(createAuditWorklistScope());
  const readGate = useRef(createAuditReadGate());
  const [filterError, setFilterError] = useState('');
  const currentQuery=filterQuery(applied,offset,50);
  const queryRef=useRef(currentQuery);
  const page=currentAuditPageProjection(storedPage,currentQuery);
  const draftDirty=auditDraftHasChanges(draft,applied);
  const canExport=canExportAuditPage(storedPage,currentQuery,draftDirty,listBusy);
  const chain=selectedChain?.query===currentQuery
    &&selectedChain.requestId===selectedRequestId
    ?selectedChain.value:null;

  async function load(query:string=currentQuery,requestedOffset:number=offset) {
    listGate.current.select(query);
    setListBusy(true);
    setListError('');
    try {
      // Do not funnel role-scoped GETs through useTask.busy: when the
      // operator picks B while A is in flight, B must still be fetched.
      const accepted=await readCurrentAuditWorklist(listGate.current,
        query,requestedOffset,
        ()=>api<AuditPage>('/admin/audit/search?'+query),
        fresh=>setStoredPage({key:query,value:fresh}));
      if(accepted)setListBusy(false);
    } catch(error){
      if(listGate.current.isSelected(query)){
        setListBusy(false);
        setListError(errorText(error));
      }
    }
  }

  useEffect(()=>{void load(currentQuery,offset);},[applied,offset]);

  function edit(field: keyof Filters, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function search() {
    try {
      // Invalid calendar days must never silently disappear from the query.
      filterQuery(draft, 0, 50);
    } catch (error) {
      setFilterError(error instanceof Error && error.message === 'AUDIT_DATE_RANGE_INVALID'
        ? 'The start date must not be after the end date.'
        : 'Enter valid calendar dates before searching evidence.');
      return;
    }
    const updated={...draft};
    const query=filterQuery(updated,0,50);
    listGate.current.select(query);queryRef.current=query;
    readGate.current.invalidateAll();
    selectedRequestRef.current='';
    setSelectedRequestId('');
    setSelectedChain(null);setChainError('');setListError('');
    setStoredPage(null);
    setOffset(0);
    setApplied(updated);
    setFilterError('');
  }

  function reset() {
    const cleared={...emptyFilters};
    const query=filterQuery(cleared,0,50);
    listGate.current.select(query);queryRef.current=query;
    readGate.current.invalidateAll();
    selectedRequestRef.current='';
    setSelectedRequestId('');
    setSelectedChain(null);setChainError('');setListError('');
    setStoredPage(null);
    setDraft(cleared);
    setApplied(cleared);
    setOffset(0);
    setFilterError('');
  }

  function changePage(nextOffset: number) {
    const query=filterQuery(applied,nextOffset,50);
    listGate.current.select(query);queryRef.current=query;
    readGate.current.invalidateAll();
    selectedRequestRef.current='';
    setSelectedRequestId('');
    setSelectedChain(null);setChainError('');setListError('');
    setStoredPage(null);
    setOffset(nextOffset);
  }

  function download(format: 'csv' | 'json') {
    if(!canExport)return;
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

  async function inspect(requestId:string){
    const selectedQuery=queryRef.current;
    selectedRequestRef.current=requestId;
    setSelectedRequestId(requestId);
    const ticket=readGate.current.beginChain();
    setSelectedChain(null);
    setChainError('');
    setChainBusy(true);
    try{
      const raw=await api<RequestEvidence>(
        '/admin/audit/chain/'+encodeAuditValue(requestId));
      if(!readGate.current.chainCurrent(ticket)
        ||selectedRequestRef.current!==requestId
        ||queryRef.current!==selectedQuery)return;
      const result=verifyAuditChainIdentity(requestId,raw);
      setSelectedChain({query:selectedQuery,requestId,value:result});
      setChainBusy(false);
    }catch(error){
      if(readGate.current.chainCurrent(ticket)
        &&selectedRequestRef.current===requestId
        &&queryRef.current===selectedQuery){
        setChainBusy(false);
        setChainError(errorText(error));
      }
    }
  }
  function closeEvidence(){
    readGate.current.invalidateChain();
    selectedRequestRef.current='';
    setSelectedRequestId('');
    setSelectedChain(null);setChainBusy(false);setChainError('');
  }

  return <div className="grant-stack">
    {filterError&&<Alert tone="critical" title="Invalid audit date range">{filterError}</Alert>}
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
        <Button onClick={search}>Search evidence</Button>
        <Button variant="secondary" onClick={reset}>Clear filters</Button>
        <Button variant="secondary" disabled={!canExport}
          onClick={()=>download('csv')}>Export CSV</Button>
        <Button variant="secondary" disabled={!canExport}
          onClick={()=>download('json')}>Export JSON</Button>
      </div>
      <AuditCurrentSearchSummary applied={applied} draft={draft}
        offset={offset} page={page}/>
      <p>The exported page is limited to 1,000 events. For more events, page through the results. CSV fields are protected against spreadsheet formulas.</p>
      {listError&&<Alert tone="critical" title="Unable to load current audit search">
        {listError}
      </Alert>}
      {!page&&!listError&&<p role="status">
        Loading the currently selected administrator-scoped audit results…
      </p>}
      <AuditEventTable
        items={page?.items ?? []} busy={!page}
        onInspect={(requestId)=>{void inspect(requestId);}}
      />
      {page&&!page.items.length&&<p>No matching audit events.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={!offset}
          onClick={()=>changePage(Math.max(0,offset-50))}>Previous page</Button>
        <span>Page {Math.floor(offset/50)+1}</span>
        <Button variant="secondary" disabled={!page?.has_more}
          onClick={()=>changePage(offset+50)}>Next page</Button>
      </div>
    </Card>
    {chainError&&<Alert tone="critical" title="Unable to load selected evidence">
      {chainError}
    </Alert>}
    {chainBusy&&<p role="status">Loading the exact selected request evidence…</p>}
    {chain&&<>
      <Button variant="secondary" onClick={closeEvidence}>
        Close selected request evidence
      </Button>
      <AuditEvidenceChain chain={chain}/>
    </>}
  </div>;
}
