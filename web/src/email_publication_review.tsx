import {useEffect,useRef,useState} from 'react';
import {Alert,Button,TextField} from '@datarelay-labs/foundation';
import {api,errorText} from './api';
import {NotificationRenderedPreview} from './notification_preview';
import type {NotificationTemplateSet} from './types';

type Rendered={subject:string;body:string;html:string};
export type EmailPublicationReview={template_id:string;expected_updated_at:number;review_hash:string;source_revision:number|null;published_revision:number|null;
 future_requests_only:boolean;execution_allowed:boolean;active_policies:{id:string;name:string;version:number}[];
 events:{event:string;subject:string;html_bytes:number}[];
 comparison:{event:string;before:Rendered|null;after:Rendered;changed_events:string[];shared_fields:string[]}};
type PublicationRequest=Pick<EmailPublicationReview,'source_revision'|'expected_updated_at'|'review_hash'>&{reason:string};
type Attempt={id:string;updatedAt:number;hash:string};
export function createEmailPublicationGuard(){
 let attempt:Attempt|null=null;const consumed=new Set<string>();
 return {blocked:()=>attempt!==null,
  begin:(review:EmailPublicationReview)=>{if(attempt||consumed.has(review.review_hash))return false;attempt={id:review.template_id,updatedAt:review.expected_updated_at,hash:review.review_hash};return true;},
  cancelBeforeWrite:()=>{attempt=null;},
  markSent:()=>{if(attempt)consumed.add(attempt.hash);},
  observe:(row:NotificationTemplateSet)=>{if(!attempt||row.id!==attempt.id||!Number.isFinite(row.updated_at)||row.updated_at<=attempt.updatedAt)return false;attempt=null;return true;},
 };
}
export async function submitEmailPublication(review:EmailPublicationReview,reason:string,guard:ReturnType<typeof createEmailPublicationGuard>,
 read:()=>Promise<NotificationTemplateSet[]>,write:(payload:PublicationRequest)=>Promise<NotificationTemplateSet>,isCurrent:()=>boolean){
 if(!reason.trim()||reason.length>500)throw Error('PUBLICATION_REASON_REQUIRED');
 if(!isCurrent()||!guard.begin(review))return null;
 let sent=false;
 try{
  const row=(await read()).find(item=>item.id===review.template_id);
  if(!row||row.updated_at!==review.expected_updated_at||!isCurrent())throw Error('PUBLICATION_CHANGED_REVIEW_REQUIRED');
  sent=true;guard.markSent();
  const result=await write({source_revision:review.source_revision,expected_updated_at:review.expected_updated_at,review_hash:review.review_hash,reason:reason.trim()});
  if(result.id!==review.template_id||!Number.isInteger(result.published_revision)||(result.published_revision??0)<1||!guard.observe(result))throw Error('PUBLICATION_OUTCOME_REQUIRES_RECONCILIATION');
  return result;
 }catch(error){if(!sent)guard.cancelBeforeWrite();throw error;}
}

export function EmailPublicationPanel({template,draftSignature,dirty,previewCurrent,disabled,onPublished}:{template:NotificationTemplateSet|null;draftSignature:string;dirty:boolean;previewCurrent:boolean;disabled:boolean;onPublished:(row:NotificationTemplateSet)=>void}){
 const [review,setReview]=useState<{scope:string;value:EmailPublicationReview}|null>(null);
 const [reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [versions,setVersions]=useState<{revision:number;created_by:string;created_at:number;reason:string;snapshot_hash:string}[]|null>(null);
 const guard=useRef(createEmailPublicationGuard());
 const scope=JSON.stringify([template?.id,template?.updated_at,draftSignature,dirty,previewCurrent]);
 const scopeRef=useRef(scope);scopeRef.current=scope;
 const sequence=useRef(0);
 const blocked=disabled||busy||guard.current.blocked(),eligible=!!template?.design&&template.enabled&&!dirty&&previewCurrent;
 useEffect(()=>{sequence.current++;setReview(null);setReason('');return()=>{sequence.current++;};},[scope]);
 async function prepare(source_revision:number|null=null){
  if(!template||blocked||!eligible)return;
  const captured=scopeRef.current,generation=++sequence.current;setBusy(true);setError('');setNotice('');setReview(null);
  try{
   const value=await api<EmailPublicationReview>('/notification-template-sets/'+encodeURIComponent(template.id)+'/publication-review','POST',{source_revision});
   if(generation!==sequence.current||captured!==scopeRef.current)return;
   if(value.template_id!==template.id||value.expected_updated_at!==template.updated_at||value.future_requests_only!==true||value.execution_allowed!==false||!value.comparison)throw Error('INVALID_PUBLICATION_REVIEW');
   setReview({scope:captured,value});
  }catch(error){if(generation===sequence.current)setError(errorText(error));}finally{setBusy(false);}
 }
 async function confirm(){
  const captured=review;if(!captured||captured.scope!==scopeRef.current||blocked||!eligible)return;
  setBusy(true);setError('');setReview(null);
  try{
   const result=await submitEmailPublication(captured.value,reason,guard.current,()=>api<NotificationTemplateSet[]>('/notification-template-sets'),
    payload=>api<NotificationTemplateSet>('/notification-template-sets/'+encodeURIComponent(captured.value.template_id)+'/publish','POST',payload),
    ()=>scopeRef.current===captured.scope);
   if(result){onPublished(result);setNotice('Published v'+result.published_revision+' for future requests only. Existing request and queued-email snapshots are unchanged.');setVersions(null);}
  }catch(error){setError(errorText(error));}finally{setBusy(false);}
 }
 async function history(){
  if(!template||busy)return;const id=template.id,captured=scopeRef.current;setBusy(true);setError('');
  try{const result=await api<NonNullable<typeof versions>>('/notification-template-sets/'+encodeURIComponent(id)+'/versions');if(captured===scopeRef.current)setVersions(result);}
  catch(error){setError(errorText(error));}finally{setBusy(false);}
 }
 async function reconcile(){
  if(!template||busy)return;setBusy(true);setError('');
  try{
   const row=(await api<NotificationTemplateSet[]>('/notification-template-sets')).find(item=>item.id===template.id);
   if(!row||!guard.current.observe(row))throw Error('PUBLICATION_OUTCOME_STILL_UNCONFIRMED');
   onPublished(row);setNotice('Current saved state refreshed. Inspect version history before a new publication. The previous POST was not retried.');setVersions(null);
  }catch(error){setError(errorText(error));}finally{setBusy(false);}
 }
 return <section className="grant-email-publication-panel" aria-label="Email publication and history">
  <div className="grant-actions"><Button type="button" disabled={blocked||!eligible} onClick={()=>void prepare()}>Review &amp; publish</Button>
   <Button type="button" variant="secondary" disabled={!template||busy||disabled} onClick={()=>void history()}>Version history</Button></div>
  {(!template||dirty)&&<p>Save the draft before reviewing publication. Saving alone never publishes.</p>}
  {!!template&&!dirty&&!previewCurrent&&<p>A current, valid preview is required before publication review.</p>}
  {error&&<Alert tone="critical" title="Publication was not confirmed">{error}</Alert>}
  {notice&&<Alert tone="success" title={notice}/>}
  {guard.current.blocked()&&<Alert tone="warning" title="Publication outcome needs reconciliation">
   A publication POST was attempted. It will not be retried automatically. Refresh until the saved revision can establish the current outcome.
   <Button type="button" variant="secondary" disabled={busy} onClick={()=>void reconcile()}>Refresh publication state</Button>
  </Alert>}
  {versions&&<section aria-label="Published version history"><h3>Published versions</h3>
   {!versions.length?<p>No published revisions.</p>:<ul>{versions.map(version=><li key={version.revision}>
    <strong>v{version.revision}</strong> · {version.reason} · {new Date(version.created_at*1000).toLocaleString()}
    <Button type="button" variant="secondary" disabled={blocked||!eligible||version.revision===template?.published_revision} onClick={()=>void prepare(version.revision)}>Review rollback from v{version.revision}</Button>
   </li>)}</ul>}<p>Rollback publishes a new revision; history is never rewritten.</p>
  </section>}
  {review&&review.scope===scope&&<section className="grant-email-publication-review" aria-label="Review publication changes">
   <h3>{review.value.source_revision?'Review rollback as a new revision':'Review draft publication'}</h3>
   <p>Only future requests use the new published revision. Existing requests, queued mail and reissued messages keep their original design snapshots.</p>
   <p><strong>Changed event wording:</strong> {review.value.comparison.changed_events.map(value=>value.replaceAll('_',' ')).join(', ')||'None'}</p>
   <p><strong>Shared changes (all events):</strong> {review.value.comparison.shared_fields.join(', ')||'None'}</p>
   <details><summary>Active policies using this template · {review.value.active_policies.length}</summary>
    {review.value.active_policies.length?<ul>{review.value.active_policies.map(policy=><li key={policy.id}>{policy.name} · v{policy.version}</li>)}</ul>:<p>No active policies currently use this template.</p>}
   </details>
   <p>Approval-request comparison. All nine events were validated by the server.</p>
   <div className="grant-email-comparison-grid"><section><h4>Published{review.value.published_revision?' v'+review.value.published_revision:''}</h4>{review.value.comparison.before?<NotificationRenderedPreview rendered={review.value.comparison.before}/>:<p>No previous published version.</p>}</section>
    <section><h4>Candidate</h4><NotificationRenderedPreview rendered={review.value.comparison.after}/></section></div>
   <TextField label="Publication reason" value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/>
   <div className="grant-actions"><Button type="button" variant="secondary" disabled={busy} onClick={()=>setReview(null)}>Back to editing</Button>
    <Button type="button" disabled={blocked||!eligible||!reason.trim()} onClick={()=>void confirm()}>Confirm publication</Button></div>
  </section>}
 </section>;
}
