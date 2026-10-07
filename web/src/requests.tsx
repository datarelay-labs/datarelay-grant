import { useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, TextField } from '@datarelay-labs/foundation';
import { api } from './api';
import { Form, Select, State, TextArea, useTask, when } from './common';
import type { Profile, RequestRow, Outcome, User } from './types';

type Navigate = (path: string) => void;
export function RequestList({ user, mine, navigate }: { user: User; mine: boolean; navigate: Navigate }) {
 const [rows, setRows] = useState<RequestRow[]>([]); const [state, setState] = useState(''); const [search, setSearch] = useState(''); const [offset, setOffset] = useState(0);
 const task = useTask();
 async function load() { setRows(await api<RequestRow[]>('/requests?limit=50&offset=' + offset)); }
 useEffect(() => { void task.run(load); }, [offset]);
 const shown = rows.filter(r => (!mine || r.approver_id === user.id) && (!state || r.state === state) && (r.title + r.external_id).toLowerCase().includes(search.toLowerCase()));
 return <div className="grant-stack">{task.feedback}<Card title={mine ? 'Your approval queue' : 'Approval requests'} description="Decision, delivery and execution are separate. Filters apply to the loaded page." actions={<div className="grant-actions"><Button onClick={() => navigate('/requests/new')}>New request</Button><Button variant="secondary" disabled={task.busy} onClick={() => void task.run(load)}>Refresh</Button></div>}>
 <div className="grant-grid"><TextField label="Search loaded requests" value={search} onChange={e => setSearch(e.target.value)}/><Select label="Decision status" value={state} onChange={setState} required={false}><option value="">All states</option>{['AWAITING','HELD','APPROVED','DENIED','EXPIRED','CANCELLED'].map(s => <option key={s}>{s}</option>)}</Select></div>
 <div className="grant-table-scroll"><table className="grant-table"><thead><tr><th>Request</th><th>Decision</th><th>Delivery</th><th>Execution</th><th>Deadline</th></tr></thead><tbody>{shown.map(r => <tr key={r.id}><td><Button variant="ghost" onClick={() => navigate('/requests/' + r.id)}>{r.title}</Button><small>{r.external_id}</small></td><td><State value={r.state}/></td><td><State value={r.delivery_state}/></td><td><State value={r.execution_state}/></td><td>{when(r.deadline)}</td></tr>)}</tbody></table></div>
 {!shown.length && <p>No matching requests on this page.</p>}<div className="grant-actions"><Button variant="secondary" disabled={!offset || task.busy} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous page</Button><Button variant="secondary" disabled={rows.length < 50 || task.busy} onClick={() => setOffset(offset + 50)}>Next page</Button></div></Card></div>;
}
export function NewRequest({ navigate }: { navigate: Navigate }) {
 const [profiles, setProfiles] = useState<Profile[]>([]); const [profile, setProfile] = useState(''); const [title, setTitle] = useState(''); const [target, setTarget] = useState(''); const [parameters, setParameters] = useState('{}'); const [reason, setReason] = useState(''); const [external, setExternal] = useState<string>(() => crypto.randomUUID()); const task = useTask();
 useEffect(() => { void task.run(async () => { setProfiles(await api('/profiles')); }); }, []);
 async function submit() {
  const selected = profiles.find(p => p.id === profile); if (!selected) throw new Error('Select a profile');
  let parsed; try { parsed = JSON.parse(parameters); } catch { task.setNotice('Parameters must be a JSON object.'); return; }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') { task.setNotice('Parameters must be a JSON object.'); return; }
  const row = await api<RequestRow>('/requests','POST',{ external_id: external, profile_id: profile, title, action: { kind: selected.action_kind, target, parameters: parsed }, reason, source: { channel: 'grant.web' } });
  navigate('/requests/' + row.id);
 }
 return <Card title="Create an approval request" description="This creates a request, not an execution. The assigned approver is determined by the profile.">{task.feedback}<Form busy={task.busy} onSubmit={() => void task.run(submit)} label="Submit request">
 <Select label="Approval profile" value={profile} onChange={setProfile}><option value="">Select a configured profile</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name} · {p.action_kind}</option>)}</Select>
 <TextField label="Request title" required maxLength={250} value={title} onChange={e=>setTitle(e.target.value)}/><TextField label="Target" required maxLength={500} value={target} onChange={e=>setTarget(e.target.value)}/><TextField label="External request ID" required maxLength={200} value={external} onChange={e=>setExternal(e.target.value)}/><TextArea label="Action parameters (JSON object; no credentials)" value={parameters} onChange={setParameters} required/><TextArea label="Reason" value={reason} onChange={setReason}/></Form></Card>;
}
export function RequestDetail({ id, user, navigate }: { id: string; user: User; navigate: Navigate }) {
 const [row, setRow] = useState<RequestRow | null>(null); const [reason, setReason] = useState(''); const [choice, setChoice] = useState<Outcome | 'CANCELLED' | ''>(''); const task = useTask();
 async function load() { setChoice(''); setRow(await api<RequestRow>('/requests/' + encodeURIComponent(id))); }
 useEffect(() => { setRow(null); void task.run(load); }, [id]);
 const decide = async () => { if (!row || !choice) return; const result = await api<RequestRow>('/requests/' + id + (choice === 'CANCELLED' ? '/cancel' : '/decision'),'POST',{ expected_revision: row.revision, reason, ...(choice === 'CANCELLED' ? {} : { decision: choice }) }); setRow(result); setChoice(''); setReason(''); task.setNotice('Recorded. Delivery and execution are tracked separately.'); };
 const actionable = row && ['AWAITING','HELD'].includes(row.state) && row.deadline * 1000 > Date.now();
 const canDecide = actionable && row.approver_id === user.id;
 const canCancel = row && !row.execution_id && !['CANCELLED','DENIED','EXPIRED'].includes(row.state) && (row.requester_id === user.id || user.role === 'admin');
 return <div className="grant-stack">{task.feedback}<div className="grant-actions"><Button variant="secondary" onClick={()=>navigate('/requests')}>Back to requests</Button><Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(load)}>Refresh</Button></div>{row && <>
 <Card title={row.title} description={row.reason || 'No additional reason supplied.'}><div className="grant-statuses"><div>Decision<br/><State value={row.state}/></div><div>Delivery<br/><State value={row.delivery_state}/></div><div>Execution<br/><State value={row.execution_state}/></div></div><dl className="grant-facts"><dt>External ID</dt><dd>{row.external_id}</dd><dt>Approval deadline</dt><dd>{when(row.deadline)}</dd><dt>Execution validity</dt><dd>{when(row.grant_until)}</dd><dt>Decision by / at</dt><dd>{row.decision_actor ?? 'Not decided'} / {when(row.decision_at)}</dd><dt>Revision</dt><dd>{row.revision}</dd></dl></Card>
 <Card title="Exact action to be approved"><dl className="grant-facts"><dt>Operation</dt><dd>{row.action.kind}</dd><dt>Target</dt><dd>{row.action.target}</dd><dt>Action fingerprint</dt><dd className="grant-mono">{row.action_hash}</dd></dl><pre>{JSON.stringify(row.action.parameters,null,2)}</pre><details><summary>Original source reference</summary><pre>{JSON.stringify(row.source,null,2)}</pre></details><p>Action content cannot be edited. Cancel this request and submit a new linked request when the action changes.</p></Card>
 {(canDecide || canCancel) && <Card title="Explicit decision"><TextArea label="Decision or cancellation reason" value={reason} onChange={setReason}/><div className="grant-actions">{canDecide && (['APPROVED','HELD','DENIED'] as Outcome[]).map(c => <Button key={c} variant={c==='DENIED'?'danger':'secondary'} disabled={task.busy} onClick={()=>setChoice(c)}>{c==='APPROVED'?'Approve':c==='HELD'?'Hold':'Deny'}</Button>)}{canCancel && <Button variant="danger" disabled={task.busy} onClick={()=>setChoice('CANCELLED')}>Cancel request</Button>}</div>{choice && <Alert tone="warning" title={'Confirm: ' + choice}><p>You are deciding revision {row.revision} for {row.action.target}. Approval does not itself execute the action.</p><Button disabled={task.busy} onClick={()=>void task.run(decide)}>Confirm {choice.toLowerCase()}</Button><Button variant="ghost" disabled={task.busy} onClick={()=>setChoice('')}>Go back</Button></Alert>}</Card>}
 {row.execution_result && <Card title="Reported execution result"><pre>{JSON.stringify(row.execution_result,null,2)}</pre><p>Reported by the connected system; not independently verified by Grant.</p></Card>}
 <Card title="Delivery history" description="HTTP acceptance is not execution success. Resend repeats only the notification.">{row.deliveries?.map(d=><div className="grant-delivery" key={d.id}><div><strong>{d.kind}</strong> · <State value={d.state}/><small>{d.attempts} attempts {d.last_error ? '· '+d.last_error : ''}</small></div>{user.role==='admin' && ['FAILED','PENDING'].includes(d.state) && <Button variant="secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/deliveries/'+d.id+'/resend','POST');await load();})}>Resend {d.kind}</Button>}</div>)}</Card>
 <Card title="Request timeline">{row.timeline?.map(e=><div className="grant-timeline" key={e.id}><strong>{e.action}</strong><small>{when(e.at)} · {e.actor}</small><pre>{JSON.stringify(e.detail,null,2)}</pre></div>)}</Card></>}</div>;
}
