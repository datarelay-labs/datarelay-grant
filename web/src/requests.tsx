import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { RequestAdminControls } from './request_admin';
export { RequestList } from './request_inbox';
export type { Filters } from './request_inbox';
import { RequestCollaboration } from './collaboration';
import { RevisionComparison } from './revision_diff';
import { RequestActionSummary } from './request_action_summary';
import { RequestEvidence, approvalProgressLabel, approvalWaitingLabel } from './request_evidence';
import { RequestStageSummary } from './request_stage_summary';
import { RequestExecutionReport } from './request_execution_report';
import { recordDecisionThenRead } from './request_decision_receipt';
import { prepareRequestCreationReview, isCurrentRequestCreationReview, submitReviewedRequestCreationWithFreshRead, RequestCreationConfirmation, type NewRequestDraft, type RequestCreationReview } from './request_creation_review';
import { RequestDecisionConfirmation, prepareRequestDecisionReview, isCurrentRequestDecisionReview, type RequestDecisionReview, type RequestDecisionChoice } from './request_decision_review';
import { Form, Select, State, TextArea, useTask, when } from './common';
import type { Profile, RequestRow, Outcome, User } from './types';

type Navigate = (path: string) => void;
export function NewRequest({ navigate, predecessorId }: { navigate: Navigate; predecessorId?: string }) {
 const [predecessor,setPredecessor] = useState<RequestRow | null>(null);
 const [profiles,setProfiles] = useState<Profile[]>([]);
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
 const [reviewError,setReviewError]=useState('');
 const selected=profiles.find(p=>p.id===profile);
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
  const policy=profiles.find(p=>p.id===id);
  // The source attributes must be explicit; do not silently omit the exact
  // selectors this active policy uses when creating a request from the browser.
  setSourceTenant(policy?.tenant || policy?.tenant_selector || '');
  setEnvironment(policy?.environment || '');
  setSeverity(policy?.severity || '');
  setRiskLevel(policy?.risk_level || '');
 }
 useEffect(()=>{resetReview();void task.run(async()=>{
  const loaded=await api<Profile[]>('/profiles');
  setProfiles(loaded);
  if(predecessorId){
   const previous=await api<RequestRow>('/requests/'+encodeURIComponent(predecessorId));
   if(previous.state!=='CANCELLED' &&
      !(previous.state==='EXPIRED' && previous.collaboration_state==='CHANGES_REQUESTED'))
      throw new Error('Cancel the original request or wait for a requested-change revision to expire before replacing it');
   setPredecessor(previous);setProfile(previous.profile_id);setTitle(previous.title);
   const selected=loaded.find(p=>p.id===previous.profile_id);
   setSourceTenant(String(previous.source?.tenant_id ?? selected?.tenant ?? selected?.tenant_selector ?? ''));
   setEnvironment(String(previous.source?.environment ?? selected?.environment ?? ''));
   setSeverity(String(previous.source?.severity ?? selected?.severity ?? ''));
   setRiskLevel(String(previous.source?.risk_level ?? selected?.risk_level ?? ''));
   setTarget(previous.action.target);setParameters(JSON.stringify(previous.action.parameters,null,2));setReason(previous.reason);
  }
 });},[predecessorId]);
 function reviewRequest(){
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
  // Clear before the only POST. If the response is ambiguous, the user must
  // inspect the existing request before reviewing again; no automatic retry.
  const reviewedNow=reviewed;
  setReviewed(null);
  const row=await submitReviewedRequestCreationWithFreshRead(
   reviewedNow,draft,
   async()=>{
    const currentProfiles=await api<Profile[]>('/profiles');
    // Replacement eligibility is also role-scoped and may change after
    // the requester originally reviewed the predecessor.
    const currentPredecessor=draft.predecessorId
     ? await api<RequestRow>('/requests/'+encodeURIComponent(draft.predecessorId))
     : null;
    setProfiles(currentProfiles);
    if(currentPredecessor) setPredecessor(currentPredecessor);
    return {
     policy:currentProfiles.find(p=>p.id===reviewedNow.payload.profile_id),
     predecessor:currentPredecessor,
    };
   },
   (payload)=>api<RequestRow>('/requests','POST',payload),
  );
  navigate('/requests/'+encodeURIComponent(row.id));
 }
 return <Card title="Create an approval request" description="This creates a request, not an execution. The assigned approver is determined by the profile.">
  {task.feedback}{predecessor&&<p>Replacement for cancelled request <code>{predecessor.id}</code>. A new explicit approval is required.</p>}
  <Form busy={task.busy} onSubmit={reviewRequest} label="Review request">
   <Select label="Approval profile" value={profile} onChange={chooseProfile}><option value="">Select a configured profile</option>{profiles.filter(p=>p.enabled).map(p=><option key={p.id} value={p.id}>{p.name} · {p.action_kind}</option>)}</Select>
   {selected?.tenant&&<p>Tenant scope: {selected.tenant}</p>}
   {selected?.tenant_selector && !selected.tenant &&
    <TextField label="Source tenant" required maxLength={200} value={sourceTenant} onChange={e=>{setSourceTenant(e.target.value);resetReview();}} />}
   {selected?.environment &&
    <TextField label="Environment" required maxLength={200} value={environment} onChange={e=>{setEnvironment(e.target.value);resetReview();}} />}
   {selected?.severity &&
    <TextField label="Severity" required maxLength={200} value={severity} onChange={e=>{setSeverity(e.target.value);resetReview();}} />}
   {selected?.risk_level &&
    <TextField label="Risk level" required maxLength={200} value={riskLevel} onChange={e=>{setRiskLevel(e.target.value);resetReview();}} />}
   <TextField label="Request title" required maxLength={250} value={title} onChange={e=>{setTitle(e.target.value);resetReview();}}/>
   <TextField label="Target" required maxLength={500} value={target} onChange={e=>{setTarget(e.target.value);resetReview();}}/>
   <TextField label="External request ID" required maxLength={200} value={external} onChange={e=>{setExternal(e.target.value);resetReview();}}/>
   <TextArea label="Action parameters (JSON object; no credentials)" value={parameters} onChange={v=>{setParameters(v);resetReview();}} required/>
   <TextArea label="Reason" value={reason} onChange={v=>{setReason(v);resetReview();}}/>
  </Form>
  {reviewError && <Alert tone="warning" title="Review required">{reviewError}</Alert>}
  <RequestCreationConfirmation reviewed={reviewed} draft={draft} busy={task.busy}
    onConfirm={()=>void task.run(submit)} onBack={()=>setReviewed(null)} />
 </Card>;
}
export function RequestDetail({ id, user, navigate }: { id: string; user: User; navigate: Navigate }) {
 const [row, setRow] = useState<RequestRow | null>(null);
 const [reason, setReason] = useState('');
 const [reviewed, setReviewed] = useState<RequestDecisionReview | null>(null);
 const task = useTask();
 async function load() {
  setReviewed(null);
  setRow(await api<RequestRow>('/requests/' + encodeURIComponent(id)));
 }
 useEffect(() => { setRow(null); void task.run(load); }, [id]);
 function chooseForReview(choice: RequestDecisionChoice) {
  if (!row) return;
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
  // The reviewed values, not mutable form state, are the only POST payload.
  const selected = reviewed;
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
    );
  } catch (error) {
    // An ambiguous POST must never be automatically repeated with old review.
    setReviewed(null);
    throw error;
  }
  setRow(outcome.row);
  setReviewed(null);
  setReason('');
  task.setNotice(outcome.refreshed
    ? 'Recorded. Delivery and execution are tracked separately.'
    : 'Decision recorded by the server. Updated details could not be refreshed; refresh before another action. Delivery and execution remain separate.');
 };
 const actionable = row && ['AWAITING','HELD'].includes(row.state) && row.deadline * 1000 > Date.now();
 const canDecide = actionable && row.viewer_can_decide === true && row.collaboration_state === 'OPEN' && row.requester_id !== user.id;
 const canCancel = row && !row.execution_id && !['CANCELLED','DENIED','EXPIRED'].includes(row.state) && (row.requester_id === user.id || user.role === 'admin');
 const canReplace = row &&
  (row.state === 'CANCELLED' || (row.state === 'EXPIRED' && row.collaboration_state === 'CHANGES_REQUESTED')) &&
  (row.requester_id === user.id || user.role === 'admin');
 return <div className="grant-stack">{task.feedback}<div className="grant-actions"><Button variant="secondary" onClick={()=>navigate('/requests')}>Back to requests</Button><Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(load)}>Refresh</Button></div>{row && <>
 <Card title={row.title} description={row.reason || 'No additional reason supplied.'}><RequestStageSummary row={row}/>{row.viewer_delegated_for && <p>You are acting as the recorded substitute for an assigned approver. Both identities remain auditable.</p>}<dl className="grant-facts"><dt>External ID</dt><dd>{row.external_id}</dd><dt>Approval deadline</dt><dd>{when(row.deadline)}</dd><dt>Execution validity</dt><dd>{when(row.grant_until)}</dd><dt>Decision by / at</dt><dd>{row.decision_actor ?? 'Not decided'} / {when(row.decision_at)}</dd><dt>Revision</dt><dd>{row.revision}</dd><dt>Approval progress</dt><dd>{approvalProgressLabel(row)}</dd><dt>Waiting on</dt><dd>{approvalWaitingLabel(row)}</dd></dl></Card>
 {row.escalation && <Card title="Escalation status"><dl className="grant-facts"><dt>Escalation target</dt><dd>{row.escalation.target_group_id ? 'Approver group' : 'Approver'} · {row.escalation.target_members.length} member(s)</dd><dt>Escalation due</dt><dd>{when(row.escalation.due_at)}</dd><dt>Applied at</dt><dd>{when(row.escalation.fired_at)}</dd></dl><p>Escalation changes only who may decide; it never executes the requested action.</p></Card>}
 <RequestActionSummary row={row} canReplace={Boolean(canReplace)} navigate={navigate} />
 {(canDecide || canCancel) && <Card title="Explicit decision">
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
 </Card>}
 {row.predecessor_id && <RevisionComparison requestId={row.id} />}
 <RequestCollaboration row={row} user={user} onRecorded={(updated) => { setRow(updated); setReviewed(null); }} />
 {user.role === 'admin' && actionable && <RequestAdminControls row={row} onReload={load} />}
 <RequestExecutionReport row={row} />
 <RequestEvidence
   row={row}
   isAdmin={user.role === 'admin'}
   busy={task.busy}
   onResend={(deliveryId) => { void task.run(async () => {
     await api('/deliveries/' + deliveryId + '/resend', 'POST');
     await load();
   }); }}
 /></>}</div>;
}
