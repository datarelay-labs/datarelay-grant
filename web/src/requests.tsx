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
 const selected=profiles.find(p=>p.id===profile);
 function chooseProfile(id:string){
  setProfile(id);
  const policy=profiles.find(p=>p.id===id);
  // The source attributes must be explicit; do not silently omit the exact
  // selectors this active policy uses when creating a request from the browser.
  setSourceTenant(policy?.tenant || policy?.tenant_selector || '');
  setEnvironment(policy?.environment || '');
  setSeverity(policy?.severity || '');
  setRiskLevel(policy?.risk_level || '');
 }
 useEffect(()=>{void task.run(async()=>{
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
 async function submit(){
  if(!selected)throw new Error('Select a profile');
  if(predecessorId&&!predecessor)throw new Error('The original request is not available');
  let parsed;try{parsed=JSON.parse(parameters);}catch{task.setNotice('Parameters must be a JSON object.');return;}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'){task.setNotice('Parameters must be a JSON object.');return;}
  const source={...(predecessor?.source??{}),channel:'grant.web',
   ...(sourceTenant?{tenant_id:sourceTenant}:{}),
   ...(environment?{environment}:{}),
   ...(severity?{severity}:{}),
   ...(riskLevel?{risk_level:riskLevel}:{})};
  if(selected.tenant && sourceTenant!==selected.tenant)throw new Error('Tenant must match the integration scope.');
  if((selected.tenant_selector && !sourceTenant) || (selected.environment && !environment) ||
     (selected.severity && !severity) || (selected.risk_level && !riskLevel))
     throw new Error('Fill every required policy selector.');
  const row=await api<RequestRow>('/requests','POST',{
   external_id:external,profile_id:profile,title,action:{kind:selected.action_kind,target,parameters:parsed},
   reason,source,...(predecessorId?{predecessor_id:predecessorId}:{}),
  });
  navigate('/requests/'+row.id);
 }
 return <Card title="Create an approval request" description="This creates a request, not an execution. The assigned approver is determined by the profile.">
  {task.feedback}{predecessor&&<p>Replacement for cancelled request <code>{predecessor.id}</code>. A new explicit approval is required.</p>}
  <Form busy={task.busy} onSubmit={()=>void task.run(submit)} label="Submit request">
   <Select label="Approval profile" value={profile} onChange={chooseProfile}><option value="">Select a configured profile</option>{profiles.filter(p=>p.enabled).map(p=><option key={p.id} value={p.id}>{p.name} · {p.action_kind}</option>)}</Select>
   {selected?.tenant&&<p>Tenant scope: {selected.tenant}</p>}
   {selected?.tenant_selector && !selected.tenant &&
    <TextField label="Source tenant" required maxLength={200} value={sourceTenant} onChange={e=>setSourceTenant(e.target.value)} />}
   {selected?.environment &&
    <TextField label="Environment" required maxLength={200} value={environment} onChange={e=>setEnvironment(e.target.value)} />}
   {selected?.severity &&
    <TextField label="Severity" required maxLength={200} value={severity} onChange={e=>setSeverity(e.target.value)} />}
   {selected?.risk_level &&
    <TextField label="Risk level" required maxLength={200} value={riskLevel} onChange={e=>setRiskLevel(e.target.value)} />}
   <TextField label="Request title" required maxLength={250} value={title} onChange={e=>setTitle(e.target.value)}/>
   <TextField label="Target" required maxLength={500} value={target} onChange={e=>setTarget(e.target.value)}/>
   <TextField label="External request ID" required maxLength={200} value={external} onChange={e=>setExternal(e.target.value)}/>
   <TextArea label="Action parameters (JSON object; no credentials)" value={parameters} onChange={setParameters} required/>
   <TextArea label="Reason" value={reason} onChange={setReason}/>
  </Form>
 </Card>;
}
export function RequestDetail({ id, user, navigate }: { id: string; user: User; navigate: Navigate }) {
 const [row, setRow] = useState<RequestRow | null>(null); const [reason, setReason] = useState(''); const [choice, setChoice] = useState<Outcome | 'CANCELLED' | ''>(''); const task = useTask();
 async function load() { setChoice(''); setRow(await api<RequestRow>('/requests/' + encodeURIComponent(id))); }
 useEffect(() => { setRow(null); void task.run(load); }, [id]);
 const decide = async () => { if (!row || !choice) return; const result = await api<RequestRow>('/requests/' + id + (choice === 'CANCELLED' ? '/cancel' : '/decision'),'POST',{ expected_revision: row.revision, reason, ...(choice === 'CANCELLED' ? {} : { decision: choice }) }); setRow(await api<RequestRow>('/requests/' + encodeURIComponent(id))); setChoice(''); setReason(''); task.setNotice('Recorded. Delivery and execution are tracked separately.'); };
 const actionable = row && ['AWAITING','HELD'].includes(row.state) && row.deadline * 1000 > Date.now();
 const canDecide = actionable && row.viewer_can_decide === true && row.collaboration_state === 'OPEN';
 const canCancel = row && !row.execution_id && !['CANCELLED','DENIED','EXPIRED'].includes(row.state) && (row.requester_id === user.id || user.role === 'admin');
 const canReplace = row &&
  (row.state === 'CANCELLED' || (row.state === 'EXPIRED' && row.collaboration_state === 'CHANGES_REQUESTED')) &&
  (row.requester_id === user.id || user.role === 'admin');
 return <div className="grant-stack">{task.feedback}<div className="grant-actions"><Button variant="secondary" onClick={()=>navigate('/requests')}>Back to requests</Button><Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(load)}>Refresh</Button></div>{row && <>
 <Card title={row.title} description={row.reason || 'No additional reason supplied.'}><RequestStageSummary row={row}/>{row.viewer_delegated_for && <p>You are acting as the recorded substitute for an assigned approver. Both identities remain auditable.</p>}<dl className="grant-facts"><dt>External ID</dt><dd>{row.external_id}</dd><dt>Approval deadline</dt><dd>{when(row.deadline)}</dd><dt>Execution validity</dt><dd>{when(row.grant_until)}</dd><dt>Decision by / at</dt><dd>{row.decision_actor ?? 'Not decided'} / {when(row.decision_at)}</dd><dt>Revision</dt><dd>{row.revision}</dd><dt>Approval progress</dt><dd>{approvalProgressLabel(row)}</dd><dt>Waiting on</dt><dd>{approvalWaitingLabel(row)}</dd></dl></Card>
 {row.escalation && <Card title="Escalation status"><dl className="grant-facts"><dt>Escalation target</dt><dd>{row.escalation.target_group_id ? 'Approver group' : 'Approver'} · {row.escalation.target_members.length} member(s)</dd><dt>Escalation due</dt><dd>{when(row.escalation.due_at)}</dd><dt>Applied at</dt><dd>{when(row.escalation.fired_at)}</dd></dl><p>Escalation changes only who may decide; it never executes the requested action.</p></Card>}
 <RequestActionSummary row={row} canReplace={Boolean(canReplace)} navigate={navigate} />
 {(canDecide || canCancel) && <Card title="Explicit decision"><TextArea label="Decision or cancellation reason" value={reason} onChange={setReason}/><div className="grant-actions">{canDecide && (['APPROVED','HELD','DENIED'] as Outcome[]).map(c => <Button key={c} variant={c==='DENIED'?'danger':'secondary'} disabled={task.busy} onClick={()=>setChoice(c)}>{c==='APPROVED'?'Approve':c==='HELD'?'Hold':'Deny'}</Button>)}{canCancel && <Button variant="danger" disabled={task.busy} onClick={()=>setChoice('CANCELLED')}>Cancel request</Button>}</div>{choice && <Alert tone="warning" title={'Confirm: ' + choice}><p>You are deciding revision {row.revision} for {row.action.target}. Approval does not itself execute the action.</p><Button disabled={task.busy} onClick={()=>void task.run(decide)}>Confirm {choice.toLowerCase()}</Button><Button variant="ghost" disabled={task.busy} onClick={()=>setChoice('')}>Go back</Button></Alert>}</Card>}
 {row.predecessor_id && <RevisionComparison requestId={row.id} />}
 <RequestCollaboration row={row} user={user} onReload={load} />
 {user.role === 'admin' && actionable && <RequestAdminControls row={row} onReload={load} />}
 {row.execution_result && <Card title="Reported execution result"><pre>{JSON.stringify(row.execution_result,null,2)}</pre><p>Reported by the connected system; not independently verified by Grant.</p></Card>}
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
