import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  TextField,
} from '@datarelay-labs/foundation';
import { api, errorText } from './api';
import './notifications-mobile.css';
import {
  createDeliveryQueryReadScope,readCurrentDeliveryWorklist,
  currentDeliveryPageProjection,deliveryDraftHasChanges,
  canReviewCurrentDelivery,DeliveryAppliedSearchSummary,
  type ScopedDeliveryPage,type DeliverySearchFilters,
} from './notification_delivery_current_worklist';
import { NotificationResendConfirmation, createNotificationResendReview, canConfirmNotificationResend, submitReviewedNotificationResend, type NotificationResendIntent } from './notification_resend_review';
import { createDeliveryHealthGuard } from './notification_delivery_guard';
import { Form, Select, TextArea, useTask, when } from './common';
import { createNotificationTestSendReview, isCurrentNotificationTestSendReview, createNotificationTestSendAttemptGuard, submitReviewedNotificationTestSend, NotificationTestSendConfirmation, type NotificationTestSendPreview, type NotificationTestSendReview, type NotificationTestSendSample } from './notification_test_send_review';
import {
  hasUnsavedTemplateChanges, NotificationPreviewActions,
  NotificationRequestLink, templateDraftSignature, NotificationRenderedPreview,
} from './notification_preview';
import {
  NotificationTemplateSaveConfirmation,
  prepareTemplateSaveReview, isCurrentTemplateSaveReview,
  createTemplateSaveGuard,submitReviewedTemplateSave,
  type TemplateSaveReview,type TemplateSaveMode,
} from './notification_template_save_review';
import {
  BrandingChangeConfirmation, prepareBrandingReview,
  isCurrentBrandingReview, createBrandingSaveGuard,
  submitReviewedBrandingSave, type BrandingReview,
  type BrandingDraft,
} from './notification_branding_review';
import type {
  NotificationBranding,
  NotificationDelivery,
  NotificationEvent,
  NotificationEventTemplate,
  NotificationTemplateSet,
} from './types';

const events: NotificationEvent[] = [
  'requested',
  'reminder',
  'approved',
  'denied',
  'expired',
  'cancelled',
  'execution_succeeded',
  'execution_failed',
  'execution_unknown',
];

const defaults: Record<NotificationEvent, NotificationEventTemplate> = {
  requested: {
    subject: '[Grant] Approval: {{request_title}}',
    body: 'Review the exact action and follow the protected verification instructions below.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nAction: {{action_kind}}\nTarget: {{target}}\nReason: {{reason}}\nDeadline: {{deadline}}',
  },
  reminder: {
    subject: '[Grant] Reminder: {{request_title}}',
    body: 'This approval request is still waiting for your explicit decision.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDeadline: {{deadline}}',
  },
  approved: {
    subject: '[Grant] Approved: {{request_title}}',
    body: 'The request was explicitly approved.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}\nExecution: {{execution_state}}',
  },
  denied: {
    subject: '[Grant] Denied: {{request_title}}',
    body: 'The request was explicitly denied.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}',
  },
  expired: {
    subject: '[Grant] Expired: {{request_title}}',
    body: 'The request expired without a valid executable approval.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}',
  },
  cancelled: {
    subject: '[Grant] Cancelled: {{request_title}}',
    body: 'The request was cancelled.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}',
  },
  execution_succeeded: {
    subject: '[Grant] Execution succeeded: {{request_title}}',
    body: 'The connected executor reported success.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}',
  },
  execution_failed: {
    subject: '[Grant] Execution failed: {{request_title}}',
    body: 'The connected executor reported failure.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}',
  },
  execution_unknown: {
    subject: '[Grant] Execution state unknown: {{request_title}}',
    body: 'Execution requires reconciliation because its final state is unknown.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}',
  },
};

type PreviewResult = NotificationTestSendPreview;

type NotificationView = 'templates' | 'delivery' | 'branding';
type TemplateView = 'list' | 'editor';

const copyDefaults = () =>
  Object.fromEntries(events.map((event) => [event, { ...defaults[event] }])) as Record<
    NotificationEvent,
    NotificationEventTemplate
  >;

function eventLabel(value: NotificationEvent): string {
  return value
    .replaceAll('_', ' ')
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

type DeliveryState=DeliverySearchFilters['state'];
type DeliveryFilter=DeliverySearchFilters;
type DeliveryHistoryPage=ScopedDeliveryPage;
const defaultDeliveryFilters: DeliveryFilter = { state: 'ALL', event: 'ALL', requestId: '' };
const DELIVERY_PAGE_LIMIT = 50;
const deliveryStates: DeliveryState[] = ['ALL', 'PENDING', 'SENDING', 'FAILED', 'DELIVERED', 'SUPERSEDED'];

// Filters are deliberately bounded and only narrow the current administrator
// route. Querying health never issues a delivery resend or execution grant.
export function notificationDeliveryQuery(filters: DeliveryFilter, offset: number): string {
  const requestId = filters.requestId.trim();
  if (!deliveryStates.includes(filters.state) ||
      (filters.event !== 'ALL' && !events.includes(filters.event)) ||
      filters.requestId.length > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    throw new Error('INVALID_DELIVERY_HEALTH_FILTER');
  }
  const query = new URLSearchParams({
    limit: String(DELIVERY_PAGE_LIMIT), offset: String(offset),
  });
  if (filters.state !== 'ALL') query.set('state', filters.state);
  if (filters.event !== 'ALL') query.set('event_type', filters.event);
  if (requestId) query.set('request_id', requestId);
  return '/notification-deliveries?' + query.toString();
}

export function deliveryPageLabel(page: Pick<DeliveryHistoryPage,
  'deliveries' | 'total' | 'limit' | 'offset' | 'has_more'> | null): string {
  if (!page ||
      !Number.isSafeInteger(page.total) || page.total < 0 ||
      !Number.isSafeInteger(page.offset) || page.offset < 0) {
    return 'Delivery page unavailable';
  }
  if (page.total === 0) return 'No matching email delivery events';
  if (!page.deliveries.length) return 'No deliveries on this page of ' + page.total + ' matching events';
  return String(page.offset + 1) + '–' + String(page.offset + page.deliveries.length) +
    ' of ' + page.total + ' matching deliveries';
}

export function NotificationDeliveryHealth() {
  const [draft, setDraft] = useState<DeliveryFilter>(defaultDeliveryFilters);
  const [applied, setApplied] = useState<DeliveryFilter>(defaultDeliveryFilters);
  const [offset, setOffset] = useState(0);
  const [storedPage,setStoredPage]=useState<{
    key:string;value:DeliveryHistoryPage;
  }|null>(null);
  const [listBusy,setListBusy]=useState(false);
  const [listError,setListError]=useState('');
  const [pendingResend,setPendingResend]=useState<NotificationResendIntent|null>(null);
  const readScope=useRef(createDeliveryQueryReadScope());
  const deliveryGate=useRef(createDeliveryHealthGuard());
  const task=useTask();
  const currentQuery=notificationDeliveryQuery(applied,offset);
  const page=currentDeliveryPageProjection(storedPage,currentQuery);
  const draftDirty=deliveryDraftHasChanges(draft,applied);
  const reviewAllowed=canReviewCurrentDelivery(storedPage,currentQuery,
    draftDirty,listBusy,task.busy);

  async function loadPage(
    query:string=currentQuery,requestedOffset:number=offset,
  ):Promise<boolean>{
    readScope.current.select(query);
    const generation=deliveryGate.current.beginRead();
    setListBusy(true);setListError('');
    try{
      let adopted=false;
      // GET B must start while older role-scoped GET A is still pending.
      // Both scoped read and the original resend guard must agree before
      // any previously fetched delivery can be displayed.
      const accepted=await readCurrentDeliveryWorklist(
        readScope.current,query,requestedOffset,
        ()=>api<DeliveryHistoryPage>(query),
        fresh=>{
          if(deliveryGate.current.readCurrent(generation)){
            setStoredPage({key:query,value:fresh});
            adopted=true;
          }
        },
      );
      if(accepted&&adopted)setListBusy(false);
      return accepted&&adopted;
    }catch(error){
      if(readScope.current.isSelected(query)
        &&deliveryGate.current.readCurrent(generation)){
        setListBusy(false);setListError(errorText(error));
      }
      return false;
    }
  }
  async function refreshPage(){
    const accepted=await loadPage(currentQuery,offset);
    // An automatic read after resend does NOT unlock prior effect.
    // Only this explicit current saved-state Refresh can do so.
    if(accepted)deliveryGate.current.readSucceeded();
  }
  useEffect(()=>{void loadPage(currentQuery,offset);},[applied,offset]);

  function changePage(nextOffset:number){
    const nextQuery=notificationDeliveryQuery(applied,nextOffset);
    readScope.current.select(nextQuery);
    deliveryGate.current.invalidateRead();
    setPendingResend(null);setStoredPage(null);setListError('');
    setOffset(nextOffset);
  }
  function apply(){
    const updated={...draft};
    const nextQuery=notificationDeliveryQuery(updated,0);
    readScope.current.select(nextQuery);
    deliveryGate.current.invalidateRead();
    setPendingResend(null);setStoredPage(null);setListError('');
    setOffset(0);setApplied(updated);
  }
  function clear(){
    const cleared={...defaultDeliveryFilters};
    const nextQuery=notificationDeliveryQuery(cleared,0);
    readScope.current.select(nextQuery);
    deliveryGate.current.invalidateRead();
    setPendingResend(null);setStoredPage(null);setListError('');
    setDraft(cleared);setOffset(0);setApplied(cleared);
  }
  function editDeliveryDraft(next:DeliveryFilter){
    setDraft(next);setPendingResend(null);
  }
  function reviewResend(record:NotificationDelivery){
    if(!reviewAllowed||deliveryGate.current.blocked(record.id))return;
    setPendingResend(createNotificationResendReview(record));
  }

  async function confirmResend() {
    const intent=pendingResend;
    if(!intent)return;
    if(!reviewAllowed){
      setPendingResend(null);
      throw new Error('DELIVERY_FILTER_CHANGED_REVIEW_REQUIRED');
    }
    const source=page?.deliveries.find(item=>item.id===intent.deliveryId);
    if (!canConfirmNotificationResend(intent, source)) {
      setPendingResend(null);
      throw new Error('DELIVERY_CHANGED_REVIEW_REQUIRED');
    }
    // Claim synchronously before any await; React busy or setState alone is
    // not enough to prevent two same-render resend POSTs.
    if (!deliveryGate.current.claimResend(intent.deliveryId)) return;
    setPendingResend(null);
    readScope.current.select('');
    setStoredPage(null);
    try {
      await submitReviewedNotificationResend(
        intent, source,
        (deliveryId) => api('/deliveries/' + encodeURIComponent(deliveryId) + '/resend', 'POST'),
      );
      try {
        await loadPage();
        task.setNotice('Notification resend scheduled. This cannot replay a protected action.');
      } catch {
        task.setNotice('Notification resend acknowledged but current delivery health could not be loaded. Refresh before another resend; no protected action was executed.');
      }
    } finally {
      // An accepted or ambiguous POST stays latched until an explicit
      // successful Refresh, even if an automatic follow-up read succeeds.
      deliveryGate.current.settledResend();
    }
  }
  return <div className="grant-stack">
    {task.feedback}
    <Card title="Delivery Health"
      description="Search stored email delivery events. Resend is a separate explicit notification-only operation; transport acceptance never proves inbox receipt."
      actions={<Button variant="secondary" disabled={task.busy}
        onClick={()=>{void task.run(refreshPage);}}>Refresh</Button>}>
      <section className="grant-stack" aria-label="Filter delivery health">
        <div className="grant-grid">
          <Select label="Delivery state" required={false} value={draft.state}
            onChange={(state)=>editDeliveryDraft({...draft,state:state as DeliveryState})}>
            {deliveryStates.map((state) => <option value={state} key={state}>
              {state === 'ALL' ? 'All states' : state}
            </option>)}
          </Select>
          <Select label="Notification event" required={false} value={draft.event}
            onChange={(event)=>editDeliveryDraft({
              ...draft,event:event as DeliveryFilter['event'],
            })}>
            <option value="ALL">All events</option>
            {events.map((event) => <option key={event} value={event}>
              {eventLabel(event)}
            </option>)}
          </Select>
          <TextField label="Exact request ID" required={false} value={draft.requestId}
            placeholder="Optional request ID"
            onChange={(event)=>editDeliveryDraft({
              ...draft,requestId:event.target.value.slice(0,100),
            })} />
        </div>
        <div className="grant-actions">
          <Button disabled={task.busy} onClick={apply}>Apply filters</Button>
          <Button variant="ghost" disabled={task.busy} onClick={clear}>Clear filters</Button>
        </div>
      </section>
      <DeliveryAppliedSearchSummary applied={applied} draft={draft}
        offset={offset} page={page}/>
      {listError&&<Alert tone="critical" title="Unable to load current delivery history">
        {listError}
      </Alert>}
      <NotificationResendConfirmation
        intent={pendingResend}
        source={page?.deliveries.find((item) => item.id === pendingResend?.deliveryId)}
        busy={task.busy||listBusy||draftDirty}
        onCancel={() => setPendingResend(null)}
        onConfirm={() => void task.run(confirmResend)}
      />
      <p aria-live="polite">{page?deliveryPageLabel(page)
        :listError?'Delivery page unavailable'
        :'Loading current administrator-scoped delivery history…'}</p>
      <p>Receipt is not independently confirmed by this delivery ledger.</p>
      <div className="grant-table-scroll grant-notification-desktop-list">
        <table className="grant-table">
          <thead><tr>
            <th>Event</th><th>State</th><th>Attempts</th><th>Request</th>
            <th>Last error</th><th>Created</th><th aria-label="Actions" />
          </tr></thead>
          <tbody>{page?.deliveries.map((item) => <tr key={item.id}>
            <td>{eventLabel(item.event_type as NotificationEvent)}</td>
            <td>{item.state}<small>
              transport {String(item.transport_accepted)} · receipt {String(item.receipt_confirmed)}
            </small></td>
            <td>{item.attempts}</td>
            <td><NotificationRequestLink requestId={item.request_id} /></td>
            <td>{item.last_error ?? '—'}</td>
            <td>{when(item.created_at)}</td>
            <td>{item.state === 'FAILED' ? (
              deliveryGate.current.blocked(item.id)
                ? <small role="status">Resend attempted. Refresh before another review.</small>
                : <Button variant="secondary" disabled={!reviewAllowed}
                    onClick={()=>reviewResend(item)}>Review resend</Button>
            ) : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {/* The same bounded administrator-scoped page, filters and one-shot
          resend review are presented as narrow task cards. No extra reads. */}
      <ul className="grant-notification-mobile-list"
        aria-label="Notification delivery mobile list">
        {page?.deliveries.map((item) => (
          <li key={item.id} className="grant-notification-mobile-card">
            <div className="grant-notification-mobile-heading">
              <strong>{eventLabel(item.event_type as NotificationEvent)}</strong>
              <span className="grant-notification-mobile-status">{item.state}</span>
            </div>
            <dl className="grant-notification-mobile-facts">
              <div><dt>Request</dt>
                <dd><NotificationRequestLink requestId={item.request_id}/></dd>
              </div>
              <div><dt>Attempts</dt><dd>{item.attempts}</dd></div>
              <div><dt>Created</dt><dd>{when(item.created_at)}</dd></div>
              <div><dt>Transport accepted</dt>
                <dd>{item.transport_accepted ? 'Yes' : 'No'}</dd>
              </div>
              <div><dt>Mailbox receipt verified</dt>
                <dd>{item.receipt_confirmed ? 'Yes' : 'No'}</dd>
              </div>
              <div><dt>Last delivery error</dt>
                <dd>{item.last_error ?? 'No recorded error'}</dd>
              </div>
            </dl>
            {item.state === 'FAILED' ? (
              <div className="grant-notification-mobile-actions">
                {deliveryGate.current.blocked(item.id)
                  ? <small role="status">
                      Resend attempted. Refresh before another review.
                    </small>
                  : <Button variant="secondary" disabled={!reviewAllowed}
                      onClick={() => reviewResend(item)}>
                      Review resend
                    </Button>}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="grant-actions">
        <Button variant="secondary" disabled={task.busy || offset <= 0}
          onClick={() => changePage(Math.max(0, offset - DELIVERY_PAGE_LIMIT))}>
          Previous page
        </Button>
        <Button variant="secondary"
          disabled={task.busy || !page?.has_more || offset + DELIVERY_PAGE_LIMIT > 100000}
          onClick={() => changePage(offset + DELIVERY_PAGE_LIMIT)}>
          Next page
        </Button>
      </div>
      {page?.has_more && offset + DELIVERY_PAGE_LIMIT > 100000 ? (
        <p>Use a narrower filter to review records beyond the bounded paging window.</p>
      ) : null}
    </Card>
  </div>;
}

export function Notifications() {
  const [sets, setSets] = useState<NotificationTemplateSet[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [variables, setVariables] = useState<string[]>([]);
  const [branding, setBranding] = useState<NotificationBranding>({
    brand_name: 'DataRelay Grant',
    sender_display_name: 'DataRelay Grant',
    logo_asset: '/assets/datarelay-grant-icon.svg',
  });
  const [view, setView] = useState<NotificationView>('templates');
  const activeViewRef=useRef<NotificationView>('templates');
  const [reviewedBranding,setReviewedBranding]=useState<BrandingReview|null>(null);
  const [brandingNeedsRefresh,setBrandingNeedsRefresh]=useState(false);
  const brandingSaveGuard=useRef(createBrandingSaveGuard());
  const [templateView, setTemplateView] = useState<TemplateView>('list');
  const templateViewRef=useRef<TemplateView>('list');
  const selectedTemplateRef=useRef('');
  const [reviewedTemplateSave,setReviewedTemplateSave]=
    useState<TemplateSaveReview|null>(null);
  const templateSaveGuard=useRef(createTemplateSaveGuard());
  const [templateNeedsRefresh,setTemplateNeedsRefresh]=useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const previewGeneration = useRef(0);
  const [brandName, setBrandName] = useState('DataRelay Grant');
  const [senderName, setSenderName] = useState('DataRelay Grant');
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [event, setEvent] = useState<NotificationEvent>('requested');
  const [draftTemplates, setDraftTemplates] =
    useState<Record<NotificationEvent, NotificationEventTemplate>>(copyDefaults());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [reviewedTestSend, setReviewedTestSend] = useState<NotificationTestSendReview | null>(null);
  const testSendAttempt = useRef(createNotificationTestSendAttemptGuard());
  const [testSendNeedsRefresh, setTestSendNeedsRefresh] = useState(false);
  const [testSendAttemptedId, setTestSendAttemptedId] = useState('');
  const [sampleTitle, setSampleTitle] = useState('Sample approval request');
  const [sampleTarget, setSampleTarget] = useState('sample-target');
  const [sampleReason, setSampleReason] = useState('Notification preview');
  const [decisionState, setDecisionState] = useState('AWAITING');
  const [executionState, setExecutionState] = useState('NOT_STARTED');
  const task = useTask();
  const draftDirty = hasUnsavedTemplateChanges(savedSignature, {
    name, enabled, templates: draftTemplates,
  });
  const sampleInputsKey = JSON.stringify([
    sampleTitle, sampleTarget, sampleReason, decisionState, executionState,
  ]);

  const brandingDraft:BrandingDraft={
    brand_name:brandName,sender_display_name:senderName,
  };
  const templateDraft={name,enabled,templates:draftTemplates};
  const currentTemplate=editing
    ?sets.find(row=>row.id===editing)??null:null;

  function switchSection(next:NotificationView){
    activeViewRef.current=next;
    setReviewedBranding(null);
    setReviewedTemplateSave(null);
    setView(next);
  }
  function editBrandName(value:string){
    setBrandName(value);setReviewedBranding(null);
  }
  function editSenderName(value:string){
    setSenderName(value);setReviewedBranding(null);
  }

  function invalidatePreview() {
    previewGeneration.current += 1;
    setPreview(null);
    setReviewedTestSend(null);
    setReviewedTemplateSave(null);
  }

  const load = async () => {
    const [templateSets, safeVariables, currentBranding] =
      await Promise.all([
        api<NotificationTemplateSet[]>('/notification-template-sets'),
        api<{ variables: string[] }>('/notification-variables'),
        api<NotificationBranding>('/notification-branding'),
      ]);
    setSets(templateSets);
    setVariables(safeVariables.variables);
    setBranding(currentBranding);
    setBrandName(currentBranding.brand_name);
    setSenderName(currentBranding.sender_display_name);
    setTemplatesLoaded(true);
  };

  useEffect(() => {
    void task.run(load);
  }, []);

  function resetEditor() {
    setEditing('');
    setSavedSignature(null);
    setName('');
    setEnabled(true);
    setEvent('requested');
    setDraftTemplates(copyDefaults());
    invalidatePreview();
  }

  function startCreate() {
    // Do not open default templates as though saved state has been verified.
    if (!templatesLoaded) return;
    resetEditor();
    templateViewRef.current='editor';
    selectedTemplateRef.current='';
    setTemplateView('editor');
  }

  function edit(row: NotificationTemplateSet) {
    templateViewRef.current='editor';
    selectedTemplateRef.current=row.id;
    setEditing(row.id);
    setSavedSignature(templateDraftSignature(row));
    setName(row.name);
    setEnabled(row.enabled);
    setDraftTemplates(structuredClone(row.templates));
    setEvent('requested');
    invalidatePreview();
    setTemplateView('editor');
  }

  function updateCurrent(field: 'subject' | 'body', value: string) {
    setDraftTemplates({
      ...draftTemplates,
      [event]: { ...draftTemplates[event], [field]: value },
    });
    invalidatePreview();
  }

  function reviewTemplateSave(){
    if(templateSaveGuard.current.blocked())return;
    if(editing && (!currentTemplate
      ||savedSignature!==templateDraftSignature(currentTemplate))){
      setReviewedTemplateSave(null);
      task.setNotice('Saved template set changed since opening the editor. Return to the list and inspect the current saved version.');
      return;
    }
    try{
      setReviewedTemplateSave(prepareTemplateSaveReview(
        editing?'update':'create',currentTemplate,templateDraft));
      task.setNotice('');
    }catch{
      setReviewedTemplateSave(null);
      task.setNotice('Provide a changed, complete, valid nine-event template set with non-empty safe subjects and bodies, and review the saved identity.');
    }
  }

  async function confirmTemplateSave(){
    const intent=reviewedTemplateSave;
    if(!intent||!isCurrentTemplateSaveReview(intent,currentTemplate,templateDraft)
      ||activeViewRef.current!=='templates'
      ||templateViewRef.current!=='editor'
      ||selectedTemplateRef.current!==intent.savedId){
      setReviewedTemplateSave(null);
      throw Error('TEMPLATE_SAVE_SOURCE_CHANGED');
    }
    if(templateSaveGuard.current.blocked())return;
    setReviewedTemplateSave(null);
    setTemplateNeedsRefresh(true);
    try{
      const output=await submitReviewedTemplateSave(
        intent,templateSaveGuard.current,
        ()=>api<NotificationTemplateSet[]>('/notification-template-sets'),
        (mode:TemplateSaveMode,id,payload)=>api<NotificationTemplateSet>(
          mode==='update'?'/notification-template-sets/'+encodeURIComponent(id)
            :'/notification-template-sets',
          mode==='update'?'PUT':'POST',payload),
        ()=>activeViewRef.current==='templates'
          &&templateViewRef.current==='editor'
          &&selectedTemplateRef.current===intent.savedId);
      if(!output||activeViewRef.current!=='templates'
        ||templateViewRef.current!=='editor'
        ||selectedTemplateRef.current!==intent.savedId)return;
      selectedTemplateRef.current=output.id;
      setEditing(output.id);
      setName(output.name);
      setEnabled(output.enabled);
      setDraftTemplates(structuredClone(output.templates));
      setSavedSignature(templateDraftSignature(output));
      setSets(current=>current.some(row=>row.id===output.id)
        ?current.map(row=>row.id===output.id?output:row)
        :[...current,output].sort((a,b)=>a.name.localeCompare(b.name)));
      invalidatePreview();
      task.setNotice('Server acknowledged exact template set save. Review the saved set with an explicit Refresh before editing or preview/test-sending any separate change. No email was sent.');
    }finally{
      if(!templateSaveGuard.current.blocked())setTemplateNeedsRefresh(false);
    }
  }

  async function refreshTemplateSave(){
    if(!templateSaveGuard.current.blocked()
      ||activeViewRef.current!=='templates'||templateViewRef.current!=='editor'){
      throw Error('TEMPLATE_SAVE_REFRESH_UNAVAILABLE');
    }
    const attempted=templateSaveGuard.current.attemptedFor();
    const latest=await api<NotificationTemplateSet[]>('/notification-template-sets');
    if(!Array.isArray(latest))throw Error('TEMPLATE_LIST_INVALID');
    if(activeViewRef.current!=='templates'||templateViewRef.current!=='editor')return;
    const target=attempted.startsWith('create:')
      ?latest.find(row=>row.name.trim().toLowerCase()===attempted.slice(7))
      :latest.find(row=>row.id===attempted);
    if(!target){
      setSets(latest);
      throw Error('TEMPLATE_SAVE_OUTCOME_UNVERIFIED_NO_RETRY');
    }
    if(selectedTemplateRef.current && selectedTemplateRef.current!==target.id)
      throw Error('SELECT_ORIGINAL_TEMPLATE_SET_FIRST');
    selectedTemplateRef.current=target.id;
    setSets(latest);
    setEditing(target.id);
    setName(target.name);
    setEnabled(target.enabled);
    setDraftTemplates(structuredClone(target.templates));
    setSavedSignature(templateDraftSignature(target));
    invalidatePreview();
    if(templateSaveGuard.current.readSucceeded(attempted))setTemplateNeedsRefresh(false);
    task.setNotice('The originally attempted template set was refreshed from the current administrator-scoped server list. Review again for a separate change.');
  }
  function leaveTemplateEditor(){
    templateViewRef.current='list';
    setReviewedTemplateSave(null);
    setTemplateView('list');
  }

  function sample(): NotificationTestSendSample {
    return {
      request_title: sampleTitle,
      request_url: location.origin + '/requests/sample',
      external_id: 'preview-sample',
      action_kind: 'sample.operation',
      target: sampleTarget,
      reason: sampleReason,
      deadline: new Date(Date.now() + 3600000).toISOString(),
      decision_state: decisionState,
      execution_state: executionState,
    };
  }

  async function runPreview() {
    if (!editing || draftDirty) return;
    const generation = previewGeneration.current;
    const rendered = await api<PreviewResult>(
      '/notification-template-sets/' + editing + '/preview',
      'POST',
      { event, sample: sample() },
    );
    if (previewGeneration.current === generation) setPreview(rendered);
  }

  async function reviewTestSend() {
    if (!editing || draftDirty || testSendAttempt.current.blocked()) return;
    const saved = sets.find((row) => row.id === editing);
    if (!saved || templateDraftSignature(saved) !== savedSignature) {
      throw new Error('TEST_SEND_SAVED_TEMPLATE_CHANGED');
    }
    const generation = previewGeneration.current;
    const exactSample = sample();
    const frozenInputs = sampleInputsKey;
    // The preview POST is non-sending. No SMTP effect is attempted here.
    const rendered = await api<PreviewResult>(
      '/notification-template-sets/' + editing + '/preview',
      'POST', { event, sample: exactSample },
    );
    if (previewGeneration.current !== generation) return;
    setPreview(rendered);
    setReviewedTestSend(createNotificationTestSendReview(
      saved, event, exactSample, frozenInputs, rendered,
    ));
  }

  async function sendTest() {
    const reviewed = reviewedTestSend;
    const saved = sets.find((row) => row.id === editing) ?? null;
    if (!reviewed || !isCurrentNotificationTestSendReview(
      reviewed, saved, event, sampleInputsKey, draftDirty,
    )) {
      setReviewedTestSend(null);
      throw new Error('TEST_SEND_CHANGED_REVIEW_REQUIRED');
    }
    // A synchronous claim inside the helper runs before any awaited network
    // operation; stale saved content is rejected without initiating SMTP.
    if (testSendAttempt.current.blocked()) return;
    setReviewedTestSend(null);
    setTestSendAttemptedId(reviewed.templateSetId);
    setTestSendNeedsRefresh(true);
    try {
      const result = await submitReviewedNotificationTestSend(
        reviewed,
        testSendAttempt.current,
        () => api<NotificationTemplateSet[]>('/notification-template-sets'),
        (intent) => api<{
          transport_accepted: boolean;
          receipt_confirmed: boolean;
          execution_allowed: boolean;
          event_id: string;
        }>('/notification-template-sets/' + intent.templateSetId + '/test-send', 'POST', {
          event: intent.event, sample: intent.sample,
        }),
      );
      if (result) task.setNotice(
        'Transport accepted: ' + String(result.transport_accepted)
          + '. Inbox receipt confirmed: ' + String(result.receipt_confirmed)
          + '. Test messages never authorize execution.',
      );
    } finally {
      // Failed pre-POST GET can be re-reviewed; a possible SMTP write latches.
      const blocked = testSendAttempt.current.blocked();
      setTestSendNeedsRefresh(blocked);
      if (!blocked) setTestSendAttemptedId('');
    }
  }

  async function refreshAfterTestSend() {
    if (!testSendAttemptedId || draftDirty) {
      throw new Error('TEST_SEND_SAVE_OR_SELECT_CURRENT_TEMPLATE_FIRST');
    }
    const latest = await api<NotificationTemplateSet[]>('/notification-template-sets');
    const current = latest.find((row) => row.id === testSendAttemptedId);
    if (!current) throw new Error('TEST_SEND_SAVED_TEMPLATE_NOT_FOUND');
    // A changed server row must replace the editor's older saved snapshot.
    setSets(latest);
    if (editing === current.id) edit(current);
    if (!testSendAttempt.current.readSucceeded()) {
      throw new Error('TEST_SEND_STILL_IN_FLIGHT');
    }
    setTestSendNeedsRefresh(false);
    setTestSendAttemptedId('');
    task.setNotice('Saved template refreshed. Review a fresh preview before any new test email.');
  }

  function reviewBranding(){
    if(brandingSaveGuard.current.blocked())return;
    try{
      setReviewedBranding(prepareBrandingReview(branding,brandingDraft));
    }catch{
      setReviewedBranding(null);
      task.setNotice('Choose different, non-empty single-line branding and sender names (up to 100 characters each). Refresh saved branding if another administrator changed it.');
    }
  }

  async function confirmBranding(){
    const intent=reviewedBranding;
    if(!intent||!isCurrentBrandingReview(intent,branding,brandingDraft)
      ||activeViewRef.current!=='branding'){
      setReviewedBranding(null);
      throw Error('BRANDING_CURRENT_CHANGED');
    }
    if(brandingSaveGuard.current.blocked())return;
    setReviewedBranding(null);
    setBrandingNeedsRefresh(true);
    try{
      const result=await submitReviewedBrandingSave(intent,
        brandingSaveGuard.current,
        ()=>api<NotificationBranding>('/notification-branding'),
        (exact)=>api<NotificationBranding>('/notification-branding','PUT',exact),
        ()=>activeViewRef.current==='branding');
      if(!result||activeViewRef.current!=='branding')return;
      setBranding(result);
      setBrandName(result.brand_name);
      setSenderName(result.sender_display_name);
      invalidatePreview();
      task.setNotice('Server acknowledged branding change for future notification snapshots. Explicitly refresh saved branding before reviewing another change. No email was sent.');
    }finally{
      if(!brandingSaveGuard.current.blocked())setBrandingNeedsRefresh(false);
    }
  }

  async function refreshBranding(){
    if(activeViewRef.current!=='branding')return;
    const current=await api<NotificationBranding>('/notification-branding');
    if(!current||!current.brand_name?.trim()||!current.sender_display_name?.trim()
      ||!current.logo_asset?.trim())throw Error('BRANDING_SAVED_STATE_UNAVAILABLE');
    if(activeViewRef.current!=='branding')return;
    setBranding(current);
    setBrandName(current.brand_name);
    setSenderName(current.sender_display_name);
    setReviewedBranding(null);
    if(brandingSaveGuard.current.readSucceeded())setBrandingNeedsRefresh(false);
    task.setNotice('Current role-scoped saved branding refreshed. Review again before any separate change.');
  }

  return (
    <div className="grant-stack">
      {task.feedback}
      <section className="grant-page-heading" aria-labelledby="grant-notifications-title">
        <div>
          <p className="grant-eyebrow">Configuration</p>
          <h2 id="grant-notifications-title">Notifications</h2>
          <p>
            Configure event messages, inspect delivery health and control system-owned
            branding without mixing those tasks into one operations canvas.
          </p>
        </div>
      </section>

      <nav className="grant-tabs" aria-label="Notification sections">
        <button
          type="button"
          aria-current={view === 'templates' ? 'page' : undefined}
          onClick={() => switchSection('templates')}
        >
          Template Sets
        </button>
        <button
          type="button"
          aria-current={view === 'delivery' ? 'page' : undefined}
          onClick={() => switchSection('delivery')}
        >
          Delivery Health
        </button>
        <button
          type="button"
          aria-current={view === 'branding' ? 'page' : undefined}
          onClick={() => switchSection('branding')}
        >
          Branding
        </button>
      </nav>

      {view === 'templates' && templateView === 'list' ? (
        <Card
          title="Template Sets"
          description="Each set owns the complete Grant 1.0 event family. Existing requests keep their original snapshot."
          actions={<Button disabled={!templatesLoaded || task.busy} onClick={startCreate}>Create template set</Button>}
        >
          <div className="grant-table-scroll grant-notification-desktop-list">
            <table className="grant-table">
              <thead>
                <tr>
                  <th>Template set</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sets.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="grant-table-link"
                        onClick={() => edit(row)}
                      >
                        {row.name}
                      </button>
                      <small>{row.id}</small>
                    </td>
                    <td>{row.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td>{events.length} required events</td>
                    <td>{when(row.updated_at)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={task.busy}
                        onClick={() => edit(row)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Card/list variants are mutually hidden by CSS, not separate
              client/server lists or different policy permissions. */}
          <ul className="grant-notification-mobile-list"
            aria-label="Notification template sets mobile list">
            {sets.map((row) => (
              <li key={row.id} className="grant-notification-mobile-card">
                <div className="grant-notification-mobile-heading">
                  <button type="button" className="grant-table-link"
                    onClick={() => edit(row)}>{row.name}</button>
                  <span className="grant-notification-mobile-status">
                    {row.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <dl className="grant-notification-mobile-facts">
                  <div><dt>Required events</dt>
                    <dd>{events.length} events</dd>
                  </div>
                  <div><dt>Updated</dt><dd>{when(row.updated_at)}</dd></div>
                  <div><dt>Saved ID</dt><dd><code>{row.id}</code></dd></div>
                </dl>
                <div className="grant-notification-mobile-actions">
                  <Button variant="secondary" disabled={task.busy}
                    onClick={() => edit(row)}>Open template</Button>
                </div>
              </li>
            ))}
          </ul>
          {!templatesLoaded ? (
            <div>
              <p role="status">{task.error
                ? 'Notification template inventory unavailable. Retry loading before editing.'
                : 'Loading notification template sets…'}</p>
              {task.error && <Button variant="secondary" disabled={task.busy}
                onClick={() => void task.run(load)}>Retry loading template sets</Button>}
            </div>
          ) : !sets.length ? (
            <p>No custom template sets configured. Policies may use the system defaults.</p>
          ) : null}
        </Card>
      ) : null}

      {view === 'templates' && templateView === 'editor' ? (
        <>
          <section className="grant-detail-header" aria-label="Notification template workspace">
            <div>
              <Button variant="ghost" onClick={leaveTemplateEditor}>
                ← Back to template sets
              </Button>
              <p className="grant-eyebrow">Notification template set</p>
              <h2>{editing ? name || 'Template set' : 'New template set'}</h2>
              <p>
                Edit one event at a time. Preview and test use the same render contract as
                delivery.
              </p>
            </div>
          </section>

          <Card
            title={editing ? 'Template set details' : 'Create notification template set'}
            description="All Grant events stay in one coherent set; editing never rewrites existing request snapshots."
          >
            <Form
              busy={task.busy||templateSaveGuard.current.blocked()}
              onSubmit={reviewTemplateSave}
              label={editing ? 'Review template set update' : 'Review template set creation'}
            >
              <TextField
                label="Template set name"
                required
                maxLength={100}
                value={name}
                onChange={(change) => {
                  setName(change.target.value);
                  invalidatePreview();
                }}
              />

              <div className="grant-event-editor">
                <div>
                  <p className="grant-field-label">Event template</p>
                  <div className="grant-event-tabs" role="list" aria-label="Notification events">
                    {events.map((item) => (
                      <button
                        type="button"
                        key={item}
                        aria-current={event === item ? 'page' : undefined}
                        onClick={() => {
                          setEvent(item);
                          invalidatePreview();
                        }}
                      >
                        {eventLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <TextField
                  label="Event subject"
                  required
                  maxLength={250}
                  value={draftTemplates[event].subject}
                  onChange={(change) => updateCurrent('subject', change.target.value)}
                />
                <TextArea
                  label="Event body"
                  required
                  value={draftTemplates[event].body}
                  onChange={(value) => updateCurrent('body', value)}
                />
              </div>

              {editing ? (
                <label className="grant-checkbox">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(change) => {
                      setEnabled(change.target.checked);
                      invalidatePreview();
                    }}
                  />
                  Template set enabled
                </label>
              ) : null}
            </Form>
            <NotificationTemplateSaveConfirmation
              reviewed={reviewedTemplateSave}
              valid={isCurrentTemplateSaveReview(
                reviewedTemplateSave,currentTemplate,templateDraft)}
              busy={task.busy||templateSaveGuard.current.blocked()}
              onBack={()=>setReviewedTemplateSave(null)}
              onConfirm={()=>{void task.run(confirmTemplateSave);}}
            />
            {templateSaveGuard.current.blocked()&&<Alert tone="warning"
              title="Reconcile saved template set">
              {templateNeedsRefresh
                ? 'A template create/update POST or PUT may already have committed. Never retry it automatically.'
                : 'The prior template save still needs an explicit saved-state read.'}
              {' '}Return to the originally attempted set and refresh its metadata.
              Another administrator could have changed it; this is not atomic backend CAS.
              <Button variant="secondary" disabled={task.busy}
                onClick={()=>{void task.run(refreshTemplateSave);}}>
                Refresh saved template set
              </Button>
            </Alert>}

            <details className="grant-safe-variables">
              <summary>Safe variables</summary>
              <p>
                {variables.map((variable) => (
                  <code key={variable}>{'{{' + variable + '}}'} </code>
                ))}
              </p>
            </details>
          </Card>

          {editing ? (
            <Card
              title="Preview & test send"
              description="Transport acceptance is distinct from inbox receipt. Test messages never authorize execution."
            >
              <div className="grant-grid">
                <TextField
                  label="Sample request title"
                  value={sampleTitle}
                  onChange={(change) => {
                    setSampleTitle(change.target.value);
                    invalidatePreview();
                  }}
                />
                <TextField
                  label="Sample target"
                  value={sampleTarget}
                  onChange={(change) => {
                    setSampleTarget(change.target.value);
                    invalidatePreview();
                  }}
                />
                <TextField
                  label="Sample decision state"
                  value={decisionState}
                  onChange={(change) => {
                    setDecisionState(change.target.value);
                    invalidatePreview();
                  }}
                />
                <TextField
                  label="Sample execution state"
                  value={executionState}
                  onChange={(change) => {
                    setExecutionState(change.target.value);
                    invalidatePreview();
                  }}
                />
              </div>
              <TextArea
                label="Sample reason"
                value={sampleReason}
                onChange={(value) => {
                  setSampleReason(value);
                  invalidatePreview();
                }}
              />
              <NotificationPreviewActions
                saved={Boolean(editing)}
                dirty={draftDirty}
                busy={task.busy}
                testAttempted={testSendNeedsRefresh}
                onPreview={() => void task.run(runPreview)}
                onTestSend={() => void task.run(reviewTestSend)}
              />
              <NotificationTestSendConfirmation
                reviewed={reviewedTestSend}
                valid={isCurrentNotificationTestSendReview(
                  reviewedTestSend, sets.find((row) => row.id === editing) ?? null,
                  event, sampleInputsKey, draftDirty,
                )}
                busy={task.busy || testSendNeedsRefresh}
                onCancel={() => setReviewedTestSend(null)}
                onConfirm={() => void task.run(sendTest)}
              />
              {testSendNeedsRefresh && (
                <Alert tone="warning" title="Test email outcome requires reconciliation">
                  A test email may have been sent to your registered admin mailbox.
                  Inspect your mailbox before a new test; an ambiguous SMTP POST
                  is never retried automatically.
                  <Button variant="secondary" disabled={task.busy}
                    onClick={() => void task.run(refreshAfterTestSend)}>
                    Refresh saved template
                  </Button>
                </Alert>
              )}
              {preview ? (
                <Alert tone="warning" title={preview.rendered.subject}>
                  <NotificationRenderedPreview rendered={preview.rendered}/>
                  <p>
                    Sender: {preview.rendered.sender_display_name} · transport accepted:{' '}
                    {String(preview.transport_accepted)} · inbox receipt confirmed:{' '}
                    {String(preview.receipt_confirmed)} · execution allowed:{' '}
                    {String(preview.execution_allowed)}
                  </p>
                </Alert>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {view === 'delivery' ? <NotificationDeliveryHealth /> : null}

      {view === 'branding' ? (
        <Card
          title="Branding"
          description="System-owned product identity applies to future notification snapshots; templates can change text but not approval authority."
        >
          <Form
            busy={task.busy||brandingSaveGuard.current.blocked()}
            onSubmit={reviewBranding}
            label="Review branding"
          >
            <TextField
              label="Brand name"
              required
              maxLength={100}
              value={brandName}
              onChange={(change) => editBrandName(change.target.value)}
            />
            <TextField
              label="Sender display name"
              required
              maxLength={100}
              value={senderName}
              onChange={(change) => editSenderName(change.target.value)}
            />
          </Form>
          <BrandingChangeConfirmation reviewed={reviewedBranding}
            valid={isCurrentBrandingReview(reviewedBranding,branding,brandingDraft)}
            busy={task.busy||brandingSaveGuard.current.blocked()}
            onBack={()=>setReviewedBranding(null)}
            onConfirm={()=>{void task.run(confirmBranding);}}/>
          {brandingSaveGuard.current.blocked()&&
            <Alert tone="warning" title="Reconcile notification branding update">
              {brandingNeedsRefresh
                ? 'A branding PUT may have committed. Never retry it automatically.'
                : 'A previous branding update requires a fresh saved-state check.'}
              {' '}Inspect the saved sender identity before any new change.
              This client review does not provide backend multi-admin CAS.
              <Button variant="secondary" disabled={task.busy}
                onClick={()=>{void task.run(refreshBranding);}}>
                Refresh saved branding
              </Button>
            </Alert>}
          <p>
            System logo: <code>{branding.logo_asset}</code>
          </p>
        </Card>
      ) : null}
    </div>
  );
}
