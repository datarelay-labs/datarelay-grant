import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField, type AccountProjection } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, TextArea, useTask } from './common';
import type { EmailTemplate, Integration, Profile } from './types';

export function Integrations() {
 const [rows,setRows]=useState<Integration[]>([]); const [name,setName]=useState(''); const [kind,setKind]=useState('datarelay'); const [url,setUrl]=useState(''); const [tenant,setTenant]=useState(''); const [headers,setHeaders]=useState('{}'); const [hmac,setHmac]=useState(''); const [selected,setSelected]=useState(''); const [scopes,setScopes]=useState(['request:create','request:read']); const [token,setToken]=useState(''); const task=useTask();
 const load=async()=>setRows(await api('/integrations'));
 useEffect(()=>{void task.run(load);},[]);
 async function create() {
  let parsed;try{parsed=JSON.parse(headers);}catch{task.setNotice('Headers must be a JSON object.');return;}
  await api('/integrations','POST',{name,kind,tenant:kind==='stellar'?tenant:'',callback_url:url,callback_headers:parsed,hmac_secret:hmac});
  setName('');setUrl('');setTenant('');setHeaders('{}');setHmac('');await load();task.setNotice('Integration created. Assign a profile and use scoped credentials.');
 }
 return <div className="grant-stack">{task.feedback}<Card title="Configured integrations" description="Destinations are registered by the installation operator. Grant never posts to a caller-supplied URL.">{rows.map(r=><div className="grant-delivery" key={r.id}><div><strong>{r.name}</strong><small>{r.kind} · {r.callback_origin} {r.tenant?'· tenant '+r.tenant:''}</small><code>{r.id}</code></div><Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/integrations/'+r.id+'/test','POST');task.setNotice('Test event accepted by the HTTP receiver. This is not approval or execution.');})}>Test connection</Button></div>)}{!rows.length&&<p>No integrations configured.</p>}</Card>
 <Card title="Add integration"><Form busy={task.busy} onSubmit={()=>void task.run(create)} label="Create integration"><TextField label="Integration name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/><Select label="Integration type" value={kind} onChange={setKind}><option value="datarelay">DataRelay</option><option value="stellar">Stellar Cyber</option></Select>{kind==='stellar'&&<TextField label="Allowed Stellar tenant ID" required value={tenant} onChange={e=>setTenant(e.target.value)}/>}<TextField label="Registered callback URL" type="url" required value={url} onChange={e=>setUrl(e.target.value)} hint="Must exactly match an installation-approved destination; HTTPS outside loopback development."/><TextArea label="Callback headers (JSON; stored encrypted)" value={headers} onChange={setHeaders}/><TextField label="Optional callback HMAC secret" type="password" autoComplete="off" value={hmac} onChange={e=>setHmac(e.target.value)}/></Form></Card>
 <Card title="Create scoped integration credential" description="A creation token cannot make human decisions. The raw credential is displayed once and is never stored in browser storage."><Form busy={task.busy} label="Create scoped token" onSubmit={()=>void task.run(async()=>{const result=await api<{token:string}>('/integrations/tokens','POST',{integration_id:selected,scopes});setToken(result.token);})}><Select label="Token integration" value={selected} onChange={setSelected}><option value="">Select integration</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select><div className="grant-stack">{['request:create','request:read','grant:consume','result:write'].map(s=><label key={s}><input type="checkbox" checked={scopes.includes(s)} onChange={e=>setScopes(e.target.checked?[...scopes,s]:scopes.filter(x=>x!==s))}/> {s}</label>)}</div></Form>{token&&<Alert tone="warning" title="Store this credential securely"><p className="grant-mono">{token}</p><Button variant="secondary" onClick={()=>setToken('')}>Hide credential</Button></Alert>}</Card><CredentialList integrations={rows}/></div>;
}

export function Profiles() {
 const [rows,setRows]=useState<Profile[]>([]);const [integrations,setIntegrations]=useState<Integration[]>([]);const [users,setUsers]=useState<AccountProjection[]>([]);const [templates,setTemplates]=useState<EmailTemplate[]>([]);
 const [editing,setEditing]=useState('');const [name,setName]=useState('');const [integration,setIntegration]=useState('');const [approver,setApprover]=useState('');const [action,setAction]=useState('');const [template,setTemplate]=useState('');const [deadline,setDeadline]=useState('86400');const [reminder,setReminder]=useState('3600');const [count,setCount]=useState('3');const [validity,setValidity]=useState('900');const [enabled,setEnabled]=useState(true);const task=useTask();
 const load=async()=>{const [p,i,u,t]=await Promise.all([api<Profile[]>('/profiles'),api<Integration[]>('/integrations'),api<AccountProjection[]>('/admin/users'),api<EmailTemplate[]>('/email-templates')]);setRows(p);setIntegrations(i);setUsers(u);setTemplates(t);};
 useEffect(()=>{void task.run(load);},[]);
 function clear(){setEditing('');setName('');setIntegration('');setApprover('');setAction('');setTemplate('');setDeadline('86400');setReminder('3600');setCount('3');setValidity('900');setEnabled(true);}
 function edit(row:Profile){setEditing(row.id);setName(row.name);setIntegration(row.integration_id);setApprover(row.approver_id);setAction(row.action_kind);setTemplate(row.email_template_id??'');setDeadline(String(row.deadline_seconds));setReminder(String(row.reminder_seconds));setCount(String(row.max_reminders));setValidity(String(row.grant_seconds));setEnabled(row.enabled);}
 async function save(){
  const body={name,integration_id:integration,approver_id:approver,action_kind:action,email_template_id:template||null,deadline_seconds:Number(deadline),reminder_seconds:Number(reminder),max_reminders:Number(count),grant_seconds:Number(validity),...(editing?{enabled}:{})};
  await api(editing?'/profiles/'+editing:'/profiles',editing?'PUT':'POST',body);clear();await load();task.setNotice(editing?'Approval policy updated. Existing request snapshots are unchanged.':'Approval policy created.');
 }
 return <div className="grant-stack">{task.feedback}
  <Card title="Approval policies" description="Policies fix the integration, assigned approver, allowed action, mail template, deadline, reminders and execution-validity window for new requests.">
   {rows.map(r=><div className="grant-delivery" key={r.id}><div><strong>{r.name}</strong><small>{r.enabled?'Enabled':'Disabled'} · {r.action_kind} · Approver: {users.find(u=>u.id===r.approver_id)?.displayName??r.approver_id}</small><small>Mail: {r.email_template_name??'Built-in default'} · deadline {r.deadline_seconds}s · reminders {r.reminder_seconds}s × {r.max_reminders} · validity {r.grant_seconds}s</small><code>{r.id}</code></div><Button variant="secondary" disabled={task.busy} onClick={()=>edit(r)}>Edit</Button></div>)}
   {!rows.length&&<p>No approval policies configured.</p>}
  </Card>
  <Card title={editing?'Edit approval policy':'Add approval policy'}>
   <Form busy={task.busy} onSubmit={()=>void task.run(save)} label={editing?'Save policy':'Create policy'}>
    <TextField label="Policy name" required value={name} onChange={e=>setName(e.target.value)}/>
    <Select label="Integration" value={integration} onChange={setIntegration}><option value="">Select integration</option>{integrations.filter(i=>i.enabled).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</Select>
    <Select label="Assigned approver" value={approver} onChange={setApprover}><option value="">Select an enabled user</option>{users.filter(u=>u.status==='enabled').map(u=><option key={u.id} value={u.id}>{u.displayName}</option>)}</Select>
    <TextField label="Allowed action kind" required pattern="[a-zA-Z0-9_.:-]+" value={action} onChange={e=>setAction(e.target.value)}/>
    <Select label="Email template" value={template} onChange={setTemplate} required={false}><option value="">Built-in default</option>{templates.filter(t=>t.enabled||t.id===template).map(t=><option key={t.id} value={t.id}>{t.name}{t.enabled?'':' (disabled)'}</option>)}</Select>
    <div className="grant-grid"><TextField label="Response deadline (seconds)" type="number" min={60} max={604800} required value={deadline} onChange={e=>setDeadline(e.target.value)}/><TextField label="Reminder interval (seconds)" type="number" min={60} max={86400} required value={reminder} onChange={e=>setReminder(e.target.value)}/><TextField label="Maximum reminders" type="number" min={0} max={20} required value={count} onChange={e=>setCount(e.target.value)}/><TextField label="Execution validity (seconds)" type="number" min={30} max={86400} required value={validity} onChange={e=>setValidity(e.target.value)}/></div>
    {editing&&<label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Policy enabled</label>}
   </Form>
   {editing&&<Button variant="ghost" disabled={task.busy} onClick={clear}>Cancel edit</Button>}
  </Card>
 </div>;
}

export function EmailTemplates() {
 const defaults={subject_template:'[Grant] Approval: {{request_title}}',body_template:'Review and decide this request.\n\n{{request_url}}\n\nAction: {{action_kind}}\nTarget: {{target}}\nReason: {{reason}}\nDeadline: {{deadline}}',reminder_subject_template:'[Grant] Reminder: {{request_title}}',reminder_body_template:'This request is still waiting for your decision.\n\n{{request_url}}\n\nDeadline: {{deadline}}'};
 const [rows,setRows]=useState<EmailTemplate[]>([]);const [editing,setEditing]=useState('');const [name,setName]=useState('');const [subject,setSubject]=useState(defaults.subject_template);const [body,setBody]=useState(defaults.body_template);const [reminderSubject,setReminderSubject]=useState(defaults.reminder_subject_template);const [reminderBody,setReminderBody]=useState(defaults.reminder_body_template);const [enabled,setEnabled]=useState(true);const task=useTask();
 const load=async()=>setRows(await api<EmailTemplate[]>('/email-templates'));
 useEffect(()=>{void task.run(load);},[]);
 function clear(){setEditing('');setName('');setSubject(defaults.subject_template);setBody(defaults.body_template);setReminderSubject(defaults.reminder_subject_template);setReminderBody(defaults.reminder_body_template);setEnabled(true);}
 function edit(row:EmailTemplate){setEditing(row.id);setName(row.name);setSubject(row.subject_template);setBody(row.body_template);setReminderSubject(row.reminder_subject_template);setReminderBody(row.reminder_body_template);setEnabled(row.enabled);}
 async function save(){const payload={name,subject_template:subject,body_template:body,reminder_subject_template:reminderSubject,reminder_body_template:reminderBody,...(editing?{enabled}:{})};await api(editing?'/email-templates/'+editing:'/email-templates',editing?'PUT':'POST',payload);clear();await load();task.setNotice(editing?'Email template updated. Existing requests keep their original snapshot.':'Email template created.');}
 return <div className="grant-stack">{task.feedback}
  <Card title="Email templates" description="Plain-text templates are snapshotted when a request is created, so later edits do not change existing approvals or reminders.">
   <p>Variables: <code>{'{{request_title}}'}</code> <code>{'{{request_url}}'}</code> <code>{'{{external_id}}'}</code> <code>{'{{action_kind}}'}</code> <code>{'{{target}}'}</code> <code>{'{{reason}}'}</code> <code>{'{{deadline}}'}</code></p>
   {rows.map(r=><div className="grant-delivery" key={r.id}><div><strong>{r.name}</strong><small>{r.enabled?'Enabled':'Disabled'} · {r.subject_template}</small><code>{r.id}</code></div><Button variant="secondary" disabled={task.busy} onClick={()=>edit(r)}>Edit</Button></div>)}
   {!rows.length&&<p>No custom email templates configured. Policies may use the built-in default.</p>}
  </Card>
  <Card title={editing?'Edit email template':'Add email template'}>
   <Form busy={task.busy} onSubmit={()=>void task.run(save)} label={editing?'Save template':'Create template'}>
    <TextField label="Template name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/>
    <TextField label="Approval email subject" required maxLength={250} value={subject} onChange={e=>setSubject(e.target.value)}/>
    <TextArea label="Approval email body" required value={body} onChange={setBody}/>
    <TextField label="Reminder email subject" required maxLength={250} value={reminderSubject} onChange={e=>setReminderSubject(e.target.value)}/>
    <TextArea label="Reminder email body" required value={reminderBody} onChange={setReminderBody}/>
    {editing&&<label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Template enabled</label>}
   </Form>
   {editing&&<Button variant="ghost" disabled={task.busy} onClick={clear}>Cancel edit</Button>}
  </Card>
 </div>;
}

type Credential = {id:string;scopes:string[];enabled:boolean;created_at:number};
function CredentialList({integrations}:{integrations:Integration[]}) {
 const [selected,setSelected]=useState('');
 const [rows,setRows]=useState<Credential[]>([]);
 const [confirming,setConfirming]=useState('');
 const task=useTask();
 async function load(id=selected){setRows(id?await api<Credential[]>('/integrations/'+encodeURIComponent(id)+'/tokens'):[]);}
 return <Card title="Issued credentials" description="Only token identifiers and scopes are listed. Revocation blocks future requests; it cannot undo an execution already committed.">
  {task.feedback}<Select label="Inspect credential integration" value={selected} onChange={id=>{setSelected(id);setConfirming('');void task.run(()=>load(id));}}><option value="">Select integration</option>{integrations.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select>
  <Button variant="secondary" disabled={task.busy||!selected} onClick={()=>void task.run(()=>load())}>Refresh credentials</Button>
  {rows.map(row=><div className="grant-delivery" key={row.id}><div><code>{row.id}</code><small>{row.scopes.join(', ')} · {row.enabled?'Enabled':'Revoked'}</small></div>{row.enabled&&<Button variant="secondary" disabled={task.busy} onClick={()=>setConfirming(row.id)}>Revoke credential</Button>}{confirming===row.id&&<Alert tone="warning" title="Confirm credential revocation"><p>The connected system will no longer authenticate with this credential.</p><Button disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/integrations/tokens/'+encodeURIComponent(row.id)+'/revoke','POST');setConfirming('');await load();task.setNotice('Credential revoked. Other credentials remain unchanged.');})}>Confirm revoke</Button><Button variant="ghost" onClick={()=>setConfirming('')}>Keep credential</Button></Alert>}</div>)}
 </Card>;
}
