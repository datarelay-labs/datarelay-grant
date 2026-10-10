import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { IntegrationDiagnostics } from './integration_diagnostics';
import { Form, Select, TextArea, useTask } from './common';
import type { Integration } from './types';

export function Integrations() {
 const [purpose,setPurpose]=useState('producer'); const [rows,setRows]=useState<Integration[]>([]); const [name,setName]=useState(''); const [kind,setKind]=useState('datarelay'); const [url,setUrl]=useState(''); const [tenant,setTenant]=useState(''); const [headers,setHeaders]=useState('{}'); const [hmac,setHmac]=useState(''); const [selected,setSelected]=useState(''); const [scopes,setScopes]=useState(['request:create','request:read']); const [token,setToken]=useState(''); const task=useTask();
 const load=async()=>setRows(await api('/integrations'));
 useEffect(()=>{void task.run(load);},[]);
 async function create() {
  let parsed;try{parsed=JSON.parse(headers);}catch{task.setNotice('Headers must be a JSON object.');return;}
  await api('/integrations','POST',{name,kind,tenant:kind==='stellar'?tenant:'',callback_url:url,callback_headers:parsed,hmac_secret:hmac});
  setName('');setUrl('');setTenant('');setHeaders('{}');setHmac('');await load();task.setNotice('Integration created. Assign a profile and use scoped credentials.');
 }
 return <div className="grant-stack">{task.feedback}<Card title="Configured integrations" description="Destinations are registered by the installation operator. Grant never posts to a caller-supplied URL.">{rows.map(r=><div className="grant-delivery" key={r.id}><div><strong>{r.name}</strong><small>{r.kind} · {r.callback_origin} {r.tenant?'· tenant '+r.tenant:''}</small><code>{r.id}</code></div><Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/integrations/'+r.id+'/test','POST');task.setNotice('Test event accepted by the HTTP receiver. This is not approval or execution.');})}>Test connection</Button></div>)}{!rows.length&&<p>No integrations configured.</p>}</Card>
 <Card title="Add integration"><Form busy={task.busy} onSubmit={()=>void task.run(create)} label="Create integration"><TextField label="Integration name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/><Select label="Integration type" value={kind} onChange={setKind}><option value="datarelay">DataRelay</option><option value="stellar">Stellar Cyber</option></Select>{kind==='stellar'&&<TextField label="Allowed Stellar tenant ID" required value={tenant} onChange={e=>setTenant(e.target.value)}/>}<TextField label="Registered callback URL" type="url" required value={url} onChange={e=>setUrl(e.target.value)} hint="Must exactly match an installation-approved destination; HTTPS outside loopback development."/><TextArea label="Callback headers (JSON; stored encrypted)" value={headers} onChange={setHeaders}/><TextField label="Optional callback HMAC secret" type="password" autoComplete="off" value={hmac} onChange={e=>setHmac(e.target.value)}/></Form></Card>
 <Card title="Create scoped integration credential" description="A creation token cannot make human decisions. The raw credential is displayed once and is never stored in browser storage."><Form busy={task.busy} label="Create scoped token" onSubmit={()=>void task.run(async()=>{const result=await api<{token:string}>('/integrations/tokens','POST',{integration_id:selected,scopes});setToken(result.token);})}><Select label="Token integration" value={selected} onChange={setSelected}><option value="">Select integration</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select><Select label="Credential purpose" value={purpose} onChange={value=>{
 setPurpose(value);
 if(value==='producer')setScopes(['request:create','request:read']);
 else if(value==='executor')setScopes(['request:read','grant:consume','result:write']);
 else if(value==='read_only')setScopes(['request:read']);
}}>
 <option value="producer">Producer — submit and read requests</option>
 <option value="executor">Executor — consume approved grants and report results</option>
 <option value="read_only">Read-only request observer</option>
 <option value="custom">Advanced custom scopes</option>
 </Select>
 <div className="grant-stack">{['request:create','request:read','grant:consume','result:write'].map(scope=><label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={e=>{
  setPurpose('custom');
  setScopes(e.target.checked?[...scopes,scope]:scopes.filter(value=>value!==scope));
 }}/> {scope}</label>)}</div>
 {scopes.includes('request:create')&&
  scopes.some(value=>['grant:consume','result:write'].includes(value))&&
  <Alert tone="warning" title="Mixed integration credential">
   This credential combines producer and executor permissions. Use separate credentials for least privilege whenever practical.
  </Alert>}</Form>{token&&<Alert tone="warning" title="Store this credential securely"><p className="grant-mono">{token}</p><Button variant="secondary" onClick={()=>setToken('')}>Hide credential</Button></Alert>}</Card><CredentialList integrations={rows}/><IntegrationDiagnostics integrations={rows}/></div>;
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
