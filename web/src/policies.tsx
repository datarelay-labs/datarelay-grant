import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask, when } from './common';
import type { Integration, NotificationTemplateSet, PolicyHistory, PolicyPreview, Profile } from './types';

type Sample = {
 integration_id: string; action_kind: string; title: string; target: string; reason: string;
 tenant: string; environment: string; severity: string; risk_level: string;
};

const initialSample: Sample = {
 integration_id: '', action_kind: '', title: 'Sample approval request', target: 'sample-target', reason: 'Preview only',
 tenant: '', environment: '', severity: '', risk_level: '',
};

export function Profiles() {
 const [rows,setRows]=useState<Profile[]>([]);
 const [integrations,setIntegrations]=useState<Integration[]>([]);
 const [users,setUsers]=useState<AccountProjection[]>([]);
 const [templates,setTemplates]=useState<NotificationTemplateSet[]>([]);
 const [editing,setEditing]=useState('');
 const [name,setName]=useState('');
 const [integration,setIntegration]=useState('');
 const [approver,setApprover]=useState('');
 const [action,setAction]=useState('');
 const [template,setTemplate]=useState('');
 const [deadline,setDeadline]=useState('86400');
 const [reminder,setReminder]=useState('3600');
 const [count,setCount]=useState('3');
 const [validity,setValidity]=useState('900');
 const [tenant,setTenant]=useState('');
 const [environment,setEnvironment]=useState('');
 const [severity,setSeverity]=useState('');
 const [risk,setRisk]=useState('');
 const [history,setHistory]=useState<PolicyHistory|null>(null);
 const [preview,setPreview]=useState<PolicyPreview|null>(null);
 const [sample,setSample]=useState<Sample>(initialSample);
 const task=useTask();

 const load=async()=>{
  const [p,i,u,t]=await Promise.all([
   api<Profile[]>('/profiles'),
   api<Integration[]>('/integrations'),
   api<AccountProjection[]>('/admin/users'),
   api<NotificationTemplateSet[]>('/notification-template-sets'),
  ]);
  setRows(p);setIntegrations(i);setUsers(u);setTemplates(t);
 };

 useEffect(()=>{void task.run(load);},[]);

 function resetEditor(){
  setEditing('');setName('');setIntegration('');setApprover('');setAction('');setTemplate('');
  setDeadline('86400');setReminder('3600');setCount('3');setValidity('900');
  setTenant('');setEnvironment('');setSeverity('');setRisk('');setHistory(null);setPreview(null);
 }

 function edit(row:Profile){
  setEditing(row.id);setName(row.name);setIntegration(row.integration_id);setApprover(row.approver_id);
  setAction(row.action_kind);setTemplate(row.email_template_id??'');setDeadline(String(row.deadline_seconds));
  setReminder(String(row.reminder_seconds));setCount(String(row.max_reminders));setValidity(String(row.grant_seconds));
  setTenant(row.tenant_selector);setEnvironment(row.environment);setSeverity(row.severity);setRisk(row.risk_level);
  setSample(current=>({...current,integration_id:row.integration_id,action_kind:row.action_kind,tenant:row.tenant_selector,environment:row.environment,severity:row.severity,risk_level:row.risk_level}));
  setPreview(null);
 }

 async function save(){
  const body={
   name,integration_id:integration,approver_id:approver,action_kind:action,email_template_id:template||null,
   deadline_seconds:Number(deadline),reminder_seconds:Number(reminder),max_reminders:Number(count),grant_seconds:Number(validity),
   tenant_selector:tenant,environment,severity,risk_level:risk,
  };
  const saved=await api<Profile>(editing?'/profiles/'+editing:'/profiles',editing?'PUT':'POST',body);
  setEditing(saved.id);setSample(current=>({...current,integration_id:saved.integration_id,action_kind:saved.action_kind}));
  await load();task.setNotice('Draft saved. It is not live until it passes Testing and is explicitly activated.');
 }

 async function transition(id:string,actionName:'test'|'activate'|'disable'){
  const updated=await api<Profile>('/profiles/'+id+'/'+actionName,'POST');
  await load();
  if(editing===id)edit(updated);
  task.setNotice(actionName==='test'?'Policy moved to Testing. Use isolated test before activation.':actionName==='activate'?'Policy activated. Existing requests retain their original version snapshot.':'Active policy version disabled.');
 }

 async function clone(id:string){
  const cloned=await api<Profile>('/profiles/'+id+'/clone','POST');
  await load();edit(cloned);task.setNotice('Policy cloned as a new Draft.');
 }

 async function showHistory(id:string){
  setHistory(await api<PolicyHistory>('/profiles/'+id+'/history'));
 }

 function sampleBody(){
  return {
   integration_id:sample.integration_id||integration,
   action_kind:sample.action_kind||action,
   title:sample.title,target:sample.target,reason:sample.reason,
   source:{tenant_id:sample.tenant,environment:sample.environment,severity:sample.severity,risk_level:sample.risk_level},
  };
 }

 async function previewActive(){
  setPreview(await api<PolicyPreview>('/profiles/preview','POST',sampleBody()));
 }

 async function runIsolated(){
  if(!editing)return;
  setPreview(await api<PolicyPreview>('/profiles/'+editing+'/test-request','POST',sampleBody()));
 }

 const selected=rows.find(row=>row.id===editing);

 return <div className="grant-stack">{task.feedback}
  <Card title="Approval policies" description="Saving creates or updates a Draft. Only an explicit Testing → Activate transition changes live matching. Existing requests retain their original policy version.">
   {rows.map(row=><div className="grant-delivery" key={row.id}>
    <div>
     <strong>{row.name}</strong>
     <small>v{row.version} · {row.lifecycle}{row.active_version&&row.active_version!==row.version?' · active v'+row.active_version:''} · {row.action_kind}</small>
     <small>Approver: {users.find(user=>user.id===row.approver_id)?.displayName??row.approver_id} · Notifications: {row.email_template_name??'Built-in default'}</small>
     <small>Selectors: tenant {row.tenant_selector||'*'} · environment {row.environment||'*'} · severity {row.severity||'*'} · risk {row.risk_level||'*'}</small>
     <code>{row.id}</code>
    </div>
    <div className="grant-actions">
     <Button variant="secondary" disabled={task.busy} onClick={()=>edit(row)}>Edit / new draft</Button>
     {row.lifecycle==='DRAFT'&&<Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(()=>transition(row.id,'test'))}>Test policy</Button>}
     {row.lifecycle==='TESTING'&&<Button disabled={task.busy} onClick={()=>void task.run(()=>transition(row.id,'activate'))}>Activate policy</Button>}
     {row.active_version&&<Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(()=>transition(row.id,'disable'))}>Disable active</Button>}
     <Button variant="ghost" disabled={task.busy} onClick={()=>void task.run(()=>clone(row.id))}>Clone</Button>
     <Button variant="ghost" disabled={task.busy} onClick={()=>void task.run(()=>showHistory(row.id))}>History</Button>
    </div>
   </div>)}
   {!rows.length&&<p>No approval policies configured.</p>}
  </Card>

  <Card title={editing?'Policy editor — v'+(selected?.version??''):'Create approval policy'} description="General, Applies To, Approval, Timing, Execution Grant and Notifications are saved together as a bounded policy version.">
   <Form busy={task.busy} onSubmit={()=>void task.run(save)} label={editing?'Save draft':'Create draft'}>
    <TextField label="Policy name" required value={name} onChange={event=>setName(event.target.value)}/>
    <div className="grant-grid">
     <Select label="Integration" value={integration} onChange={setIntegration}><option value="">Select integration</option>{integrations.filter(item=>item.enabled).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select>
     <TextField label="Allowed action kind" required pattern="[a-zA-Z0-9_.:-]+" value={action} onChange={event=>setAction(event.target.value)}/>
    </div>
    <div className="grant-grid">
     <TextField label="Tenant selector" value={tenant} onChange={event=>setTenant(event.target.value)} placeholder="Blank = any"/>
     <TextField label="Environment selector" value={environment} onChange={event=>setEnvironment(event.target.value)} placeholder="Blank = any"/>
     <TextField label="Severity selector" value={severity} onChange={event=>setSeverity(event.target.value)} placeholder="Blank = any"/>
     <TextField label="Risk selector" value={risk} onChange={event=>setRisk(event.target.value)} placeholder="Blank = any"/>
    </div>
    <Select label="Assigned approver" value={approver} onChange={setApprover}><option value="">Select an enabled user</option>{users.filter(user=>user.status==='enabled').map(user=><option key={user.id} value={user.id}>{user.displayName}</option>)}</Select>
    <Select label="Notification template set" value={template} onChange={setTemplate} required={false}><option value="">Built-in default</option>{templates.filter(item=>item.enabled||item.id===template).map(item=><option key={item.id} value={item.id}>{item.name}{item.enabled?'':' (disabled)'}</option>)}</Select>
    <div className="grant-grid">
     <TextField label="Response deadline (seconds)" type="number" min={60} max={604800} required value={deadline} onChange={event=>setDeadline(event.target.value)}/>
     <TextField label="Reminder interval (seconds)" type="number" min={60} max={86400} required value={reminder} onChange={event=>setReminder(event.target.value)}/>
     <TextField label="Maximum reminders" type="number" min={0} max={20} required value={count} onChange={event=>setCount(event.target.value)}/>
     <TextField label="Execution validity (seconds)" type="number" min={30} max={86400} required value={validity} onChange={event=>setValidity(event.target.value)}/>
    </div>
   </Form>
   {editing&&<Button variant="ghost" disabled={task.busy} onClick={resetEditor}>Close editor</Button>}
  </Card>

  <Card title="Preview & test" description="Preview uses the same deterministic resolver as live intake. An isolated test request never creates an executable approval.">
   <div className="grant-grid">
    <Select label="Sample integration" value={sample.integration_id||integration} onChange={value=>setSample({...sample,integration_id:value})}><option value="">Select integration</option>{integrations.filter(item=>item.enabled).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select>
    <TextField label="Sample action kind" value={sample.action_kind||action} onChange={event=>setSample({...sample,action_kind:event.target.value})}/>
    <TextField label="Sample title" value={sample.title} onChange={event=>setSample({...sample,title:event.target.value})}/>
    <TextField label="Sample target" value={sample.target} onChange={event=>setSample({...sample,target:event.target.value})}/>
   </div>
   <TextArea label="Sample reason" value={sample.reason} onChange={value=>setSample({...sample,reason:value})}/>
   <div className="grant-grid">
    <TextField label="Sample tenant" value={sample.tenant} onChange={event=>setSample({...sample,tenant:event.target.value})}/>
    <TextField label="Sample environment" value={sample.environment} onChange={event=>setSample({...sample,environment:event.target.value})}/>
    <TextField label="Sample severity" value={sample.severity} onChange={event=>setSample({...sample,severity:event.target.value})}/>
    <TextField label="Sample risk" value={sample.risk_level} onChange={event=>setSample({...sample,risk_level:event.target.value})}/>
   </div>
   <div className="grant-actions">
    <Button variant="secondary" disabled={task.busy||!(sample.integration_id||integration)||!(sample.action_kind||action)} onClick={()=>void task.run(previewActive)}>Preview active resolution</Button>
    <Button variant="secondary" disabled={task.busy||!editing||selected?.lifecycle!=='TESTING'} onClick={()=>void task.run(runIsolated)}>Run isolated test</Button>
   </div>
   {preview&&<Alert tone="info" title={(preview.test_mode?'Isolated test: ':'Resolved policy: ')+preview.policy.name+' v'+preview.policy.version}>
    <p>Approver: {users.find(user=>user.id===preview.approver_id)?.displayName??preview.approver_id} · specificity {preview.resolution.specificity} · execution allowed: {String(preview.execution_allowed)}</p>
    <p>Deadline {preview.timing?.deadline_seconds??preview.policy.deadline_seconds}s · reminders {preview.timing?.reminder_seconds??preview.policy.reminder_seconds}s × {preview.timing?.max_reminders??preview.policy.max_reminders} · execution validity {preview.execution_grant?.validity_seconds??preview.policy.grant_seconds}s</p>
    <p><strong>{preview.notification?.subject}</strong></p><pre className="grant-mono">{preview.notification?.body}</pre>
    <p>{Object.entries(preview.resolution.selectors).map(([key,value])=>key+': '+(value.matched?'match':'no match')+(value.wildcard?' (any)':'')).join(' · ')}</p>
   </Alert>}
  </Card>

  {history&&<Card title="Version / change history" description={'Policy '+history.profile_id}>
   {history.versions.map(version=><div className="grant-delivery" key={version.version_id}><div><strong>v{version.version} · {version.lifecycle}</strong><small>Updated {when(version.updated_at)} · activated {when(version.activated_at)} · disabled {when(version.disabled_at)}</small></div></div>)}
   {history.events.slice(0,20).map(event=><div className="grant-delivery" key={event.id}><div><strong>{event.action}</strong><small>{when(event.at)} · {event.actor}</small></div></div>)}
  </Card>}
 </div>;
}
