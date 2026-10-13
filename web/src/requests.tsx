import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api, errorText } from './api';
import { RequestAdminControls } from './request_admin';
export { RequestList } from './request_inbox';
export type { Filters } from './request_inbox';
import { RequestCollaboration } from './collaboration';
import { RevisionComparison } from './revision_diff';
import { RequestDetailOverview } from './request_detail_overview';
import {
 createRequestDetailReadGate, readScopedRequestDetail,
 currentRouteRequest, acceptCurrentRequestMutation,
} from './request_detail_read_scope';
import {
 createRequestIntakeReadGate, readScopedRequestIntake,
 currentIntakeProjection, type IntakeProjection,
} from './request_intake_read_scope';
import { RequestTaskBackLink } from './request_task_navigation';
import { RequestEvidence } from './request_evidence';
import { RequestDeliveryResendConfirmation, createRequestDeliveryResendReview, canConfirmRequestDeliveryResend, submitReviewedRequestDeliveryResend, createDeliveryResendAttemptGuard, type RequestDeliveryResendIntent } from './request_delivery_resend_review';
import { RequestExecutionReport } from './request_execution_report';
import { recordDecisionThenRead } from './request_decision_receipt';
import { createDecisionAttemptGuard } from './request_decision_attempt';
import { createRequestCreationAttemptGuard } from './request_creation_attempt';
import { eligibleIntakeProfiles, NewRequestPolicyContext, RequestCreationReconciliationNotice } from './request_intake_context';
import { prepareRequestCreationReview, isCurrentRequestCreationReview, submitReviewedRequestCreationWithFreshRead, verifyCreatedRequestReceipt, RequestCreationConfirmation, type NewRequestDraft, type RequestCreationReview } from './request_creation_review';
import { RequestDecisionConfirmation, prepareRequestDecisionReview, isCurrentRequestDecisionReview, type RequestDecisionReview, type RequestDecisionChoice } from './request_decision_review';
import { Form, Select, State, TextArea, useTask, when } from './common';
import { RequestIntakeSteps } from './request_workflow_guide';
import type { Profile, RequestRow, Delivery, Outcome, User } from './types';

type Navigate = (path: string) => void;
export function NewRequest({ navigate, predecessorId }: { navigate: Navigate; predecessorId?: string }) {
 const intakeGate = useRef(createRequestIntakeReadGate());
 const [loadedContext, setLoadedContext] =
   useState<IntakeProjection<Profile, RequestRow> | null>(null);
 // Old request/policy data cannot be rendered or confirmed after changing
 // the predecessor route, even before React flushes the next useEffect.
 const currentContext = currentIntakeProjection(loadedContext, predecessorId);
 const profiles = currentContext?.profiles ?? [];
 const predecessor = currentContext?.predecessor ?? null;
 const [profile,setProfile] = useState('');
 const [title,setTitle] = useState('');
 const [target,setTarget] = useState('');
 const [parameters,setParameters] = useState('{}');
 const [reason,setReason] = useState('');
 const [external,setExternal] = useState<string>(()=>crypto.randomUUID());
 const [sourceTenant,setSourceTenant]=useState('');
 const [environment,setEnvironment]=useState('');
 const [severity,setSeverity]=useState('');
 const [riskLevel,setRiskLevel]=useState('');
 const task=useTask();
 const [reviewed,setReviewed]=useState<RequestCreationReview | null>(null);
 const createGuard=useRef(createRequestCreationAttemptGuard());
 const [createOutcomeUnknown,setCreateOutcomeUnknown]=useState(false);
 const [reviewError,setReviewError]=useState('');
 const availableProfiles=eligibleIntakeProfiles(profiles);
 const selected=availableProfiles.find(p=>p.id===profile);
 const draft:NewRequestDraft={
  profile:selected??null,predecessor,predecessorId,title,target,parameters,
  reason,external,sourceTenant,environment,severity,riskLevel,
 };
 function resetReview(){
  setReviewed(null);setReviewError('');task.setNotice('');
 }
 function chooseProfile(id:string){
  resetReview();
  setProfile(id);
  const policy=availableProfiles.find(p=>p.id===id);
  // The source attributes must be explicit; do not silently omit the exact
  // selectors this active policy uses when creating a request from the browser.
  setSourceTenant(policy?.tenant || policy?.tenant_selector || '');
  setEnvironment(policy?.environment || '');
  setSeverity(policy?.severity || '');
  setRiskLevel(policy?.risk_level || '');
 }
 useEffect(()=>{
  intakeGate.current.selectContext(predecessorId);
  resetReview();
  setLoadedContext(null);
  setProfile('');setTitle('');setTarget('');setParameters('{}');
  setReason('');setSourceTenant('');setEnvironment('');
  setSeverity('');setRiskLevel('');
  setExternal(crypto.randomUUID());
  // A pre-existing create attempt remains locked: navigation alone must not
  // permit an ambiguous request-create POST to be issued again.
  void readScopedRequestIntake(
    intakeGate.current, predecessorId,
    () => api<Profile[]>('/profiles'),
    () => api<RequestRow>('/requests/'+encodeURIComponent(predecessorId!)),
    (previous) => previous.state==='CANCELLED'
      || (previous.state==='EXPIRED'
        && previous.collaboration_state==='CHANGES_REQUESTED'),
    (loaded) => {
      setLoadedContext(loaded);
      if (loaded.predecessor) {
        const previous=loaded.predecessor;
        setProfile(previous.profile_id);setTitle(previous.title);
        const policy=loaded.profiles.find(p=>p.id===previous.profile_id);
        setSourceTenant(String(previous.source?.tenant_id
          ?? policy?.tenant ?? policy?.tenant_selector ?? ''));
        setEnvironment(String(previous.source?.environment
          ?? policy?.environment ?? ''));
        setSeverity(String(previous.source?.severity
          ?? policy?.severity ?? ''));
        setRiskLevel(String(previous.source?.risk_level
          ?? policy?.risk_level ?? ''));
        setTarget(previous.action.target);
        setParameters(JSON.stringify(previous.action.parameters,null,2));
        setReason(previous.reason);
      }
    },
  ).catch((error) => {
    if (intakeGate.current.isActive(predecessorId)) {
      setReviewError(error instanceof Error
        ? error.message : 'Unable to load current policies and original request.');
    }
  });
 },[predecessorId]);
 function reviewRequest(){
  if (createGuard.current.blocked()) return;
  try{
   const next=prepareRequestCreationReview(draft);
   setReviewed(next);setReviewError('');task.setNotice('');
  }catch(error){
   setReviewed(null);
   setReviewError(error instanceof Error ? error.message : 'Review the current request details.');
  }
 }
 async function submit(){
  if(!reviewed||!isCurrentRequestCreationReview(reviewed,draft)){
   setReviewed(null);
   setReviewError('The request changed. Review the current action and selectors again.');
   return;
  }
  // Claim synchronously before policy GET, not after React marks the button busy.
  // A second Confirm in the same render must never start a second create POST.
  if (!createGuard.current.claim()) return;
  const reviewedNow=reviewed;
  const creationContext=predecessorId;
  setReviewed(null);
  try {
   const row=await submitReviewedRequestCreationWithFreshRead(
   reviewedNow,draft,
   async()=>{
    const currentProfiles=await api<Profile[]>('/profiles');
    // Replacement eligibility is also role-scoped and may change after
    // the requester originally reviewed the predecessor.
    const currentPredecessor=draft.predecessorId
     ? await api<RequestRow>('/requests/'+encodeURIComponent(draft.predecessorId))
     : null;
    if (!intakeGate.current.isActive(creationContext)) {
      throw new Error('REQUEST_CREATION_CONTEXT_CHANGED');
    }
    setLoadedContext({ key: creationContext ?? '',
      profiles: currentProfiles, predecessor: currentPredecessor });
    return {
     policy:currentProfiles.find(p=>p.id===reviewedNow.payload.profile_id),
     predecessor:currentPredecessor,
    };
   },
   (payload)=>{
    if (!intakeGate.current.isActive(creationContext)) {
      throw new Error('REQUEST_CREATION_CONTEXT_CHANGED');
    }
    createGuard.current.markPostStarted();
    setCreateOutcomeUnknown(true);
    return api<RequestRow>('/requests','POST',payload);
   },
   );
   // A creation POST might already have committed. Only the exact reviewed
   // server projection qualifies for navigation; mismatches are not retried.
   const confirmed = verifyCreatedRequestReceipt(reviewedNow, row);
   if (intakeGate.current.isActive(creationContext)) {
     navigate('/requests/'+encodeURIComponent(confirmed.id));
   }
  } catch(error) {
   // A failed read-only policy check is safely re-reviewable. A POST that
   // was attempted is not: reconcile My requests rather than retry here.
   const safelyBeforePost = createGuard.current.failed();
   if (!intakeGate.current.isActive(creationContext)) return;
   if (!safelyBeforePost) setCreateOutcomeUnknown(true);
   throw error;
  }
 }
 return <div className="grant-new-request"><Card title="Create an approval request"
  description="Start with a policy and the target. You can check everything before sending it to an approver.">
  <RequestIntakeSteps policySelected={Boolean(selected)} detailsEntered={Boolean(title.trim() && target.trim())} />
  {task.feedback}
  {createOutcomeUnknown && (
    <RequestCreationReconciliationNotice openMyRequests={() => navigate('/my-requests')} />
  )}
  {predecessor && <p>Replacement for cancelled request <code>{predecessor.id}</code>.
    A new explicit approval is required.</p>}
  <Form busy={task.busy || createOutcomeUnknown} onSubmit={reviewRequest} label="Review request">
   <section className="grant-intake-section" aria-label="Choose active approval policy" id="grant-policy-choice">
    <h3>Step 1 · Choose what needs approval</h3>
    <p>Pick the policy for this task. Grant automatically finds the assigned reviewers.</p>
    <Select label="Approval profile" value={profile} onChange={chooseProfile}>
     <option value="">Select an active approval policy</option>
     {availableProfiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.action_kind}</option>)}
    </Select>
    {currentContext && availableProfiles.length === 0 &&
      <Alert tone="warning" title="No active approval policy">
        Ask an administrator to activate a policy in Approval Policies before creating a request.
      </Alert>}
    <NewRequestPolicyContext profile={selected ?? null} />
   </section>
   <section className="grant-intake-section" aria-label="Describe the requested business action" id="grant-action-details">
    <h3>Step 2 · Tell the reviewer what you need</h3>
    <p>Start with just the request title and the system or asset to change.</p>
    <TextField label="Request title" required maxLength={250} value={title} onChange={e=>{setTitle(e.target.value);resetReview();}}/>
    <p className="grant-intake-field-guide">Example: Restart the reporting service for planned maintenance.</p>
    <TextField label="Target" required maxLength={500} value={target} onChange={e=>{setTarget(e.target.value);resetReview();}}/>
    <p className="grant-intake-field-guide">Example: web-server-03 or reporting-service. Use the exact system or asset name.</p>
    {selected?.tenant&&<p>Tenant scope: {selected.tenant}</p>}
    {selected?.tenant_selector && !selected.tenant &&
     <TextField label="Source tenant" required maxLength={200} value={sourceTenant} onChange={e=>{setSourceTenant(e.target.value);resetReview();}} />}
    {selected?.environment &&
     <TextField label="Environment" required maxLength={200} value={environment} onChange={e=>{setEnvironment(e.target.value);resetReview();}} />}
    {selected?.severity &&
     <TextField label="Severity" required maxLength={200} value={severity} onChange={e=>{setSeverity(e.target.value);resetReview();}} />}
    {selected?.risk_level &&
     <TextField label="Risk level" required maxLength={200} value={riskLevel} onChange={e=>{setRiskLevel(e.target.value);resetReview();}} />}
    <TextArea label="Reason" value={reason} onChange={v=>{setReason(v);resetReview();}}/>
    <p className="grant-intake-field-guide">Optional: explain why the change is needed and what the reviewer should check.</p>
    <details className="grant-intake-advanced" key={predecessorId || 'new'} open={predecessorId ? true : undefined}>
      <summary>Advanced integration details</summary>
      <div>
        <p className="grant-intake-field-guide">The request ID is generated automatically. Leave parameters as {'{}'} unless the policy needs an exact JSON object. Never enter passwords or API keys.</p>
        <TextField label="External request ID" required maxLength={200} value={external} onChange={e=>{setExternal(e.target.value);resetReview();}}/>
        <TextArea label="Action parameters (JSON object; no credentials)" value={parameters} onChange={v=>{setParameters(v);resetReview();}} required/>
      </div>
    </details>
   </section>
   <section className="grant-intake-section" aria-label="Review before creating" id="grant-request-review">
    <h3>Step 3 · Review, then confirm</h3>
    <p className="grant-intake-review-note">Select <strong>Review request</strong> below to check the exact policy, action and target. Review does not submit anything. The next screen has a separate final confirmation to create the request.</p>
   </section>
  </Form>
  {reviewError && <Alert tone="warning" title="Review required">{reviewError}</Alert>}
  <RequestCreationConfirmation reviewed={createOutcomeUnknown ? null : reviewed} draft={draft} busy={task.busy || createOutcomeUnknown}
    onConfirm={()=>void task.run(submit)} onBack={()=>setReviewed(null)} />
 </Card></div>;
}
export function RequestDetail({ id, user, navigate }: { id: string; user: User; navigate: Navigate }) {
 const [storedRow, setRow] = useState<RequestRow | null>(null);
 // An old route's saved row is never actionable during the first render
 // after navigation, even before the next useEffect has invalidated its GET.
 const row = currentRouteRequest(storedRow, id);
 const readGate = useRef(createRequestDetailReadGate());
 const [loadError, setLoadError] = useState('');
 const [reason, setReason] = useState('');
 const [reviewed, setReviewed] = useState<RequestDecisionReview | null>(null);
 const decisionGuard = useRef(createDecisionAttemptGuard());
 const [decisionMustRefresh, setDecisionMustRefresh] = useState(false);
 const [pendingResend, setPendingResend] = useState<RequestDeliveryResendIntent | null>(null);
 const resendGate = useRef(createDeliveryResendAttemptGuard());
 const [resendAttempted, setResendAttempted] = useState<string[]>([]);
 const task = useTask();
 async function load(): Promise<boolean> {
  if (!readGate.current.isActive(id)) return false;
  setReviewed(null);
  setPendingResend(null);
  return readScopedRequestDetail(
    readGate.current, id,
    () => api<RequestRow>('/requests/' + encodeURIComponent(id)),
    (current) => {
      setRow(current);
      if (decisionGuard.current.readSucceeded()) setDecisionMustRefresh(false);
    },
  );
 }
 useEffect(() => {
  readGate.current.selectRequest(id);
  setLoadError('');
  decisionGuard.current = createDecisionAttemptGuard();
  resendGate.current = createDeliveryResendAttemptGuard();
  setDecisionMustRefresh(false);
  setRow(null);
  setPendingResend(null);
  setResendAttempted([]);
  // Initial loading must not be skipped by an old route's useTask busy flag.
  // The read gate drops any superseded result/error from another route.
  void load().catch((error) => {
    if (readGate.current.isActive(id)) setLoadError(errorText(error));
  });
 }, [id]);
 function chooseForReview(choice: RequestDecisionChoice) {
  if (!row || decisionGuard.current.blocked()) return;
  setReviewed(prepareRequestDecisionReview(
    row, user, choice, reason, Date.now() / 1000,
  ));
 }
 const decide = async () => {
  if (!row || !reviewed || !isCurrentRequestDecisionReview(
    reviewed, row, user, reason, Date.now() / 1000,
  )) {
    setReviewed(null);
    return;
  }
  // Claim before any await or React rerender; both cancellation and decisions
  // must remain one-shot even on a double click or an ambiguous POST.
  const actionGuard = decisionGuard.current;
  if (!actionGuard.claim()) return;
  // This exact request's attempt guard cannot be replaced by a later route
  // before the pending POST completes or fails.
  readGate.current.invalidateCurrent(id);
  // The reviewed values, not mutable form state, are the only POST payload.
  const selected = reviewed;
  setReviewed(null);
  setDecisionMustRefresh(true);
  let outcome: { row: RequestRow; refreshed: boolean };
  try {
    outcome = await recordDecisionThenRead(
      () => api<RequestRow>(
        '/requests/' + encodeURIComponent(selected.requestId)
          + (selected.choice === 'CANCELLED' ? '/cancel' : '/decision'),
        'POST',
        { expected_revision: selected.revision, reason: selected.reason,
          ...(selected.choice === 'CANCELLED' ? {} : { decision: selected.choice }) },
      ),
      () => api<RequestRow>('/requests/' + encodeURIComponent(selected.requestId)),
      selected,
    );
    actionGuard.complete(outcome.refreshed);
  } catch (error) {
    // A failed or ambiguous POST cannot be retried until an explicit fresh GET.
    actionGuard.complete(false);
    // The original request may have changed or failed; never surface its
    // old operation's error in a newly selected request workspace.
    if (!readGate.current.isActive(selected.requestId)) return;
    throw error;
  }
  if (!acceptCurrentRequestMutation(readGate.current, selected.requestId,
    outcome.row, setRow)) return;
  setDecisionMustRefresh(actionGuard.blocked());
  setReason('');
  task.setNotice(outcome.refreshed
    ? 'Recorded. Delivery and execution are tracked separately.'
    : 'Decision recorded by the server. Updated details could not be refreshed; refresh before another action. Delivery and execution remain separate.');
 };
 function reviewDeliveryResend(delivery: Delivery) {
  if (!row || user.role !== 'admin' || resendAttempted.includes(delivery.id)
      || resendGate.current.blocked(delivery.id)) return;
  setPendingResend(createRequestDeliveryResendReview(row, delivery));
 }
 async function confirmDeliveryResend() {
  const intent = pendingResend;
  if (!intent) return;
  if (!canConfirmRequestDeliveryResend(intent, row, user.role === 'admin')) {
   setPendingResend(null);
   throw new Error('DELIVERY_CHANGED_REVIEW_REQUIRED');
  }
  // A sync claim before the role-scoped GET closes the same-render
  // double-Confirm window, which asynchronous React busy state cannot close.
  const attemptGate = resendGate.current;
  if (!attemptGate.claim(intent.deliveryId)) return;
  readGate.current.invalidateCurrent(intent.requestId);
  // Hide a previously reviewed resend even when its outcome is ambiguous.
  // Only an explicit successful Refresh re-enables review of that delivery.
  setPendingResend(null);
  setResendAttempted((current) => current.includes(intent.deliveryId)
   ? current : [...current, intent.deliveryId]);
  try {
   await submitReviewedRequestDeliveryResend(
    intent, user.role === 'admin',
    (requestId) => api<RequestRow>('/requests/' + encodeURIComponent(requestId)),
    (deliveryId) => api('/deliveries/' + encodeURIComponent(deliveryId) + '/resend', 'POST'),
   );
  } finally {
   // Failed GET/uncertain POST remains latched until explicit Refresh.
   attemptGate.settled();
  }
  if (!readGate.current.isActive(intent.requestId)) return;
  try {
   const accepted = await load();
   if (!accepted || !readGate.current.isActive(intent.requestId)) return;
   task.setNotice('Notification resend scheduled. This does not approve or execute the requested action.');
  } catch {
   if (!readGate.current.isActive(intent.requestId)) return;
   task.setNotice('Notification resend accepted, but updated delivery history could not be loaded. Refresh before reviewing another resend; no approval or external action was executed.');
  }
 }
 const actionable = row && ['AWAITING','HELD'].includes(row.state) && row.deadline * 1000 > Date.now();
 const canDecide = actionable && row.viewer_can_decide === true && row.collaboration_state === 'OPEN' && row.requester_id !== user.id;
 const canCancel = row && !row.execution_id && !['CANCELLED','DENIED','EXPIRED'].includes(row.state) && (row.requester_id === user.id || user.role === 'admin');
 const canReplace = row &&
  (row.state === 'CANCELLED' || (row.state === 'EXPIRED' && row.collaboration_state === 'CHANGES_REQUESTED')) &&
  (row.requester_id === user.id || user.role === 'admin');
 return <div className="grant-stack">{task.feedback}
 {loadError && <Alert tone="warning" title="Unable to load this request">{loadError}</Alert>}
 <div className="grant-actions"><RequestTaskBackLink row={row} user={user} navigate={navigate} /><Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{
 const accepted = await load();
 if (accepted && resendGate.current.readSucceeded()) setResendAttempted([]);
 })}>Refresh</Button></div>{row && <>
 <RequestDetailOverview row={row} canReplace={Boolean(canReplace)} navigate={navigate} />
 {row.escalation && <Card title="Escalation status"><dl className="grant-facts"><dt>Escalation target</dt><dd>{row.escalation.target_group_id ? 'Approver group' : 'Approver'} · {row.escalation.target_members.length} member(s)</dd><dt>Escalation due</dt><dd>{when(row.escalation.due_at)}</dd><dt>Applied at</dt><dd>{when(row.escalation.fired_at)}</dd></dl><p>Escalation changes only who may decide; it never executes the requested action.</p></Card>}
 {decisionMustRefresh && <Alert tone="warning" title="Refresh required before another decision">A human decision or cancellation was attempted. A possible server write is never repeated automatically. Use Refresh to load the current request before reviewing another action.</Alert>}
 {(canDecide || canCancel) && !decisionMustRefresh && <section id="grant-decision-actions" aria-label="Choose a reviewed decision"><Card title="Explicit decision">
  <TextArea label="Decision or cancellation reason (maximum 2000 characters)"
    value={reason} onChange={(value) => { setReason(value); setReviewed(null); }} />
  {reason.length > 2000 && <Alert tone="warning" title="Reason is too long">
    Enter no more than 2000 characters before choosing an action.
  </Alert>}
  <div className="grant-actions">
    {canDecide && (['APPROVED','HELD','DENIED'] as Outcome[]).map((choice) =>
      <Button key={choice} variant={choice==='DENIED'?'danger':'secondary'}
        disabled={task.busy || reason.length > 2000}
        onClick={()=>chooseForReview(choice)}>
        {choice==='APPROVED'?'Approve':choice==='HELD'?'Hold':'Deny'}
      </Button>)}
    {canCancel && <Button variant="danger" disabled={task.busy || reason.length > 2000}
      onClick={()=>chooseForReview('CANCELLED')}>Cancel request</Button>}
  </div>
  <RequestDecisionConfirmation row={row} user={user} reviewed={reviewed}
    reason={reason} nowSeconds={Date.now() / 1000} busy={task.busy}
    onConfirm={()=>void task.run(decide)} onBack={()=>setReviewed(null)} />
 </Card></section>}
 {row.predecessor_id && <RevisionComparison requestId={row.id} />}
 <RequestCollaboration row={row} user={user} onRecorded={(updated) => {
   if (acceptCurrentRequestMutation(readGate.current, id, updated, setRow)) setReviewed(null);
 }} />
 {user.role === 'admin' && actionable && <RequestAdminControls
   row={row} onReload={async () => { await load(); }}
   onRecorded={(updated) => {
     if (!acceptCurrentRequestMutation(readGate.current, id, updated, setRow)) return;
     setReviewed(null); setPendingResend(null);
   }}
   onReadbackUnavailable={(acknowledged) => {
     if (!readGate.current.invalidateCurrent(id)) return;
     setRow(null);
     setReviewed(null);
     setPendingResend(null);
     task.setNotice(acknowledged
       ? 'Approval routing was acknowledged by the server, but current details could not be read. Refresh before another routing change. This did not execute the action.'
       : 'Routing POST response could not be verified for the reviewed request. Do not retry automatically. Refresh and inspect the request history before any new routing change.');
   }}
 />}
 <RequestExecutionReport row={row} />
 <RequestEvidence
   row={row}
   isAdmin={user.role === 'admin'}
   busy={task.busy}
   onReviewResend={reviewDeliveryResend}
   blockedResendIds={resendAttempted}
   resendConfirmation={<RequestDeliveryResendConfirmation
     row={row}
     isAdmin={user.role === 'admin'}
     intent={pendingResend}
     busy={task.busy}
     onCancel={()=>setPendingResend(null)}
     onConfirm={()=>void task.run(confirmDeliveryResend)}
   />}
 /></>}</div>;
}
