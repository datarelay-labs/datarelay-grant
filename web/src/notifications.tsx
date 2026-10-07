import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import type { NotificationBranding, NotificationDelivery, NotificationEvent, NotificationEventTemplate, NotificationTemplateSet } from './types';

const events: NotificationEvent[] = ['requested','reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown'];

const defaults: Record<NotificationEvent,NotificationEventTemplate> = {
 requested:{subject:'[Grant] Approval: {{request_title}}',body:'Review the exact action and sign in as the assigned approver.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nAction: {{action_kind}}\nTarget: {{target}}\nReason: {{reason}}\nDeadline: {{deadline}}'},
 reminder:{subject:'[Grant] Reminder: {{request_title}}',body:'This approval request is still waiting for your explicit decision.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDeadline: {{deadline}}'},
 approved:{subject:'[Grant] Approved: {{request_title}}',body:'The request was explicitly approved.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}\nExecution: {{execution_state}}'},
 denied:{subject:'[Grant] Denied: {{request_title}}',body:'The request was explicitly denied.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}'},
 expired:{subject:'[Grant] Expired: {{request_title}}',body:'The request expired without a valid executable approval.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}'},
 cancelled:{subject:'[Grant] Cancelled: {{request_title}}',body:'The request was cancelled.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nDecision: {{decision_state}}'},
 execution_succeeded:{subject:'[Grant] Execution succeeded: {{request_title}}',body:'The connected executor reported success.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}'},
 execution_failed:{subject:'[Grant] Execution failed: {{request_title}}',body:'The connected executor reported failure.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}'},
 execution_unknown:{subject:'[Grant] Execution state unknown: {{request_title}}',body:'Execution requires reconciliation because its final state is unknown.\n\nRequest: {{request_url}}\nExternal ID: {{external_id}}\nExecution: {{execution_state}}'},
};

type PreviewResult = {
 event: NotificationEvent;
 rendered: { subject: string; body: string; sender_display_name: string; brand_name: string };
 transport_accepted: boolean; receipt_confirmed: boolean; execution_allowed: boolean;
};

const copyDefaults=()=>Object.fromEntries(events.map(event=>[event,{...defaults[event]}])) as Record<NotificationEvent,NotificationEventTemplate>;

export function Notifications(){
 const [sets,setSets]=useState<NotificationTemplateSet[]>([]);
 const [deliveries,setDeliveries]=useState<NotificationDelivery[]>([]);
 const [variables,setVariables]=useState<string[]>([]);
 const [users,setUsers]=useState<AccountProjection[]>([]);
 const [branding,setBranding]=useState<NotificationBranding>({brand_name:'DataRelay Grant',sender_display_name:'DataRelay Grant',logo_asset:'/assets/datarelay-grant-icon.svg'});
 const [brandName,setBrandName]=useState('DataRelay Grant');
 const [senderName,setSenderName]=useState('DataRelay Grant');
 const [editing,setEditing]=useState('');
 const [name,setName]=useState('');
 const [enabled,setEnabled]=useState(true);
 const [event,setEvent]=useState<NotificationEvent>('requested');
 const [draftTemplates,setDraftTemplates]=useState<Record<NotificationEvent,NotificationEventTemplate>>(copyDefaults());
 const [preview,setPreview]=useState<PreviewResult|null>(null);
 const [recipient,setRecipient]=useState('');
 const [sampleTitle,setSampleTitle]=useState('Sample approval request');
 const [sampleTarget,setSampleTarget]=useState('sample-target');
 const [sampleReason,setSampleReason]=useState('Notification preview');
 const [decisionState,setDecisionState]=useState('AWAITING');
 const [executionState,setExecutionState]=useState('NOT_STARTED');
 const task=useTask();

 const load=async()=>{
  const [templateSets,deliveryHealth,safeVariables,currentBranding,accounts]=await Promise.all([
   api<NotificationTemplateSet[]>('/notification-template-sets'),
   api<{deliveries:NotificationDelivery[]}>('/notification-deliveries'),
   api<{variables:string[]}>('/notification-variables'),
   api<NotificationBranding>('/notification-branding'),
   api<AccountProjection[]>('/admin/users'),
  ]);
  setSets(templateSets);setDeliveries(deliveryHealth.deliveries);setVariables(safeVariables.variables);setBranding(currentBranding);
  setBrandName(currentBranding.brand_name);setSenderName(currentBranding.sender_display_name);setUsers(accounts);
 };

 useEffect(()=>{void task.run(load);},[]);

 function resetEditor(){
  setEditing('');setName('');setEnabled(true);setEvent('requested');setDraftTemplates(copyDefaults());setPreview(null);
 }

 function edit(row:NotificationTemplateSet){
  setEditing(row.id);setName(row.name);setEnabled(row.enabled);setDraftTemplates(structuredClone(row.templates));setEvent('requested');setPreview(null);
 }

 function updateCurrent(field:'subject'|'body',value:string){
  setDraftTemplates({...draftTemplates,[event]:{...draftTemplates[event],[field]:value}});
 }

 async function save(){
  const payload={name,templates:draftTemplates,...(editing?{enabled}:{})};
  const saved=await api<NotificationTemplateSet>(editing?'/notification-template-sets/'+editing:'/notification-template-sets',editing?'PUT':'POST',payload);
  setEditing(saved.id);await load();task.setNotice(editing?'Notification template set updated. Existing requests keep their snapshot.':'Notification template set created.');
 }

 function sample(){
  return {
   request_title:sampleTitle,
   request_url:location.origin+'/requests/sample',
   external_id:'preview-sample',
   action_kind:'sample.operation',
   target:sampleTarget,
   reason:sampleReason,
   deadline:new Date(Date.now()+3600000).toISOString(),
   decision_state:decisionState,
   execution_state:executionState,
  };
 }

 async function runPreview(){
  if(!editing)return;
  setPreview(await api<PreviewResult>('/notification-template-sets/'+editing+'/preview','POST',{event,sample:sample()}));
 }

 async function sendTest(toDesignated:boolean){
  if(!editing)return;
  const result=await api<{transport_accepted:boolean;receipt_confirmed:boolean;execution_allowed:boolean;event_id:string}>('/notification-template-sets/'+editing+'/test-send','POST',{
   event,sample:sample(),...(toDesignated&&recipient?{recipient_user_id:recipient}:{})
  });
  task.setNotice('Transport accepted: '+String(result.transport_accepted)+'. Inbox receipt confirmed: '+String(result.receipt_confirmed)+'. Test messages never authorize execution.');
 }

 async function saveBranding(){
  const updated=await api<NotificationBranding>('/notification-branding','PUT',{brand_name:brandName,sender_display_name:senderName});
  setBranding(updated);task.setNotice('Notification branding updated for future request snapshots.');
 }

 async function resend(id:string){
  await api('/deliveries/'+id+'/resend','POST');await load();task.setNotice('Notification resend scheduled. This cannot replay an action.');
 }

 return <div className="grant-stack">{task.feedback}
  <Card title="Notifications" description="Event-oriented notification administration. Templates are plain text, safe-variable bounded and snapshotted when a request is created.">
   <p>Safe variables: {variables.map(variable=><code key={variable}>{'{{'+variable+'}}'} </code>)}</p>
   {sets.map(row=><div className="grant-delivery" key={row.id}><div><strong>{row.name}</strong><small>{row.enabled?'Enabled':'Disabled'} · {events.length} required events · updated {when(row.updated_at)}</small><code>{row.id}</code></div><Button variant="secondary" disabled={task.busy} onClick={()=>edit(row)}>Edit template set</Button></div>)}
   {!sets.length&&<p>No custom template sets configured. Policies may use the system defaults.</p>}
  </Card>

  <Card title={editing?'Edit notification template set':'Create notification template set'} description="All Grant 1.0 notification events remain in one coherent set. Editing a set does not rewrite existing request snapshots.">
   <Form busy={task.busy} onSubmit={()=>void task.run(save)} label={editing?'Save template set':'Create template set'}>
    <TextField label="Template set name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/>
    <Select label="Event template" value={event} onChange={value=>setEvent(value as NotificationEvent)}>{events.map(item=><option key={item} value={item}>{item.replaceAll('_',' ')}</option>)}</Select>
    <TextField label="Event subject" required maxLength={250} value={draftTemplates[event].subject} onChange={e=>updateCurrent('subject',e.target.value)}/>
    <TextArea label="Event body" required value={draftTemplates[event].body} onChange={value=>updateCurrent('body',value)}/>
    {editing&&<label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Template set enabled</label>}
   </Form>
   {editing&&<Button variant="ghost" disabled={task.busy} onClick={resetEditor}>Close editor</Button>}
  </Card>

  <Card title="Preview & test send" description="Preview and test use the same rendered content contract as delivery. Transport acceptance is not proof of inbox receipt.">
   <div className="grant-grid">
    <TextField label="Sample request title" value={sampleTitle} onChange={e=>setSampleTitle(e.target.value)}/>
    <TextField label="Sample target" value={sampleTarget} onChange={e=>setSampleTarget(e.target.value)}/>
    <TextField label="Sample decision state" value={decisionState} onChange={e=>setDecisionState(e.target.value)}/>
    <TextField label="Sample execution state" value={executionState} onChange={e=>setExecutionState(e.target.value)}/>
   </div>
   <TextArea label="Sample reason" value={sampleReason} onChange={setSampleReason}/>
   <Select label="Designated test recipient" value={recipient} onChange={setRecipient} required={false}><option value="">Authenticated administrator</option>{users.filter(user=>user.status==='enabled').map(user=><option key={user.id} value={user.id}>{user.displayName}</option>)}</Select>
   <div className="grant-actions">
    <Button variant="secondary" disabled={task.busy||!editing} onClick={()=>void task.run(runPreview)}>Preview rendered message</Button>
    <Button variant="secondary" disabled={task.busy||!editing} onClick={()=>void task.run(()=>sendTest(false))}>Send test to me</Button>
    <Button variant="secondary" disabled={task.busy||!editing||!recipient} onClick={()=>void task.run(()=>sendTest(true))}>Send to designated test recipient</Button>
   </div>
   {preview&&<Alert tone="warning" title={preview.rendered.subject}><pre className="grant-mono">{preview.rendered.body}</pre><p>Sender: {preview.rendered.sender_display_name} · transport accepted: {String(preview.transport_accepted)} · inbox receipt confirmed: {String(preview.receipt_confirmed)} · execution allowed: {String(preview.execution_allowed)}</p></Alert>}
  </Card>

  <Card title="Delivery health" description="Failures and retries are notification state only. Resending a notification never replays an approved action.">
   <Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(load)}>Refresh delivery health</Button>
   {deliveries.slice(0,100).map(item=><div className="grant-delivery" key={item.id}><div><strong>{item.event_type} · {item.state}</strong><small>attempts {item.attempts} · transport accepted {String(item.transport_accepted)} · inbox receipt confirmed {String(item.receipt_confirmed)}</small><small>{item.last_error??'No delivery error'} · {when(item.created_at)}</small><code>{item.request_id}</code></div>{item.state==='FAILED'&&<Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(()=>resend(item.id))}>Schedule resend</Button>}</div>)}
   {!deliveries.length&&<p>No email delivery events recorded yet.</p>}
  </Card>

  <Card title="Branding" description="System-owned product identity applies to future notification snapshots; policy templates can change text but not approval authority.">
   <Form busy={task.busy} onSubmit={()=>void task.run(saveBranding)} label="Save branding">
    <TextField label="Brand name" required maxLength={100} value={brandName} onChange={e=>setBrandName(e.target.value)}/>
    <TextField label="Sender display name" required maxLength={100} value={senderName} onChange={e=>setSenderName(e.target.value)}/>
   </Form>
   <p>System logo: <code>{branding.logo_asset}</code></p>
  </Card>
 </div>;
}
