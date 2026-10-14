import {useEffect,useRef,useState} from 'react';
import {Button} from '@datarelay-labs/foundation';
import {api,errorText} from './api';
import {createEmailDesign} from './email_design';
import type {TemplateDraft} from './notification_preview';
import {inertEmailDocument} from './notification_preview';
import {syntheticEmailSample} from './email_preview_model';
import type {NotificationTemplateSet} from './types';

export function duplicateEmailTemplateDraft(source:NotificationTemplateSet,existingNames:string[]):TemplateDraft {
 const taken=new Set(existingNames.map(name=>name.trim().toLowerCase()));let index=1,candidate='';
 do{
  const suffix=index===1?' (copy)':' (copy '+index+')';
  candidate=source.name.slice(0,Math.max(1,100-suffix.length)).trimEnd()+suffix;index++;
 }while(taken.has(candidate.toLowerCase()));
 const design=source.design?structuredClone(source.design):{...createEmailDesign(),shared_layout_revision:1 as const,rich_text:false,paragraph_alignment:'left' as const};
 return {name:candidate,enabled:true,templates:structuredClone(source.templates),design};
}
type Usage={template_id:string;total:number;offset:number;limit:number;has_more:boolean;policies:{id:string;profile_id:string;version:number;name:string;lifecycle:string;updated_at:number}[]};

export function EmailTemplateTile({template,disabled,onEdit,onDuplicate}:{template:NotificationTemplateSet;disabled:boolean;onEdit:()=>void;onDuplicate?:()=>void}){
 const element=useRef<HTMLLIElement>(null);
 const [visible,setVisible]=useState(false),[html,setHtml]=useState<string|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const [usage,setUsage]=useState<Usage|null>(null),[usageBusy,setUsageBusy]=useState(false),[usageError,setUsageError]=useState('');
 async function loadUsage(offset=0){
  if(usageBusy)return;setUsageBusy(true);setUsageError('');
  try{const value=await api<Usage>('/notification-template-sets/'+encodeURIComponent(template.id)+'/usage?limit=20&offset='+offset);if(value.template_id!==template.id)throw Error('INVALID_TEMPLATE_USAGE');setUsage(value);}catch(reason){setUsageError(errorText(reason));}finally{setUsageBusy(false);}
 }
 useEffect(()=>{
  if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});
  if(element.current)observer.observe(element.current);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!visible)return;let active=true;setHtml(null);setError(false);
  void api<{rendered:{html:string}}>('/notification-template-sets/'+encodeURIComponent(template.id)+'/preview','POST',{
   event:'requested',verification_mode:'EMAIL_PIN',sample:syntheticEmailSample('normal','requested'),
  }).then(result=>{if(active&&typeof result.rendered.html==='string'&&result.rendered.html.length<=131072)setHtml(result.rendered.html);})
   .catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[visible,template.id,template.updated_at,retry]);
 return <li ref={element} className="grant-email-template-tile">
  <div className="grant-email-inventory-thumbnail" aria-label={'Synthetic draft preview of '+template.name}>
   {html?<iframe title={template.name+' synthetic draft thumbnail'} tabIndex={-1} sandbox="" referrerPolicy="no-referrer" srcDoc={inertEmailDocument(html)}/>:<p>{error?'Preview unavailable':visible?'Rendering preview…':'Draft preview'}</p>}
  </div>
  <div className="grant-email-template-summary"><h3>{template.name}</h3>
   <p>{template.enabled?'Enabled':'Disabled'} · {template.published_revision?'Published v'+template.published_revision:'Not published'}</p>
   <p>{template.draft_revision?'Saved draft v'+template.draft_revision:'Saved draft'} · {template.design?'Visual template':'Legacy text template'}</p>
   <p aria-label="Template last updated">Updated {new Date(template.updated_at*1000).toLocaleString()}</p>
   <p>{typeof template.active_policy_count==='number'?'Used by '+template.active_policy_count+' active '+(template.active_policy_count===1?'policy':'policies'):'Policy impact is available during publication review.'}</p>
   <small>Thumbnail uses synthetic request data and the saved draft, not a delivered message.</small>
   <div className="grant-actions"><Button type="button" variant="secondary" disabled={disabled} onClick={onEdit}>Edit draft</Button>
    {onDuplicate&&<Button type="button" variant="secondary" disabled={disabled} onClick={onDuplicate}>Duplicate into new draft</Button>}
    <Button type="button" variant="ghost" disabled={disabled||usageBusy} onClick={()=>void loadUsage(0)}>View policy usage</Button>
    {error&&<Button type="button" variant="ghost" disabled={disabled} onClick={()=>setRetry(value=>value+1)}>Retry preview</Button>}</div>
   {usageError&&<p role="alert">Policy usage unavailable: {usageError}</p>}
   {usage&&<section aria-label="Active policy usage"><h4>Active policy usage · {usage.total}</h4>
    {!usage.policies.length?<p>No active policies use this saved template.</p>:<ul>{usage.policies.map(policy=><li key={policy.id}><strong>{policy.name}</strong> · Version {policy.version} · <code>{policy.id}</code> · Profile <code>{policy.profile_id}</code> · {policy.lifecycle}</li>)}</ul>}
    <div className="grant-actions"><Button type="button" variant="secondary" disabled={usageBusy||usage.offset===0} onClick={()=>void loadUsage(Math.max(0,usage.offset-usage.limit))}>Previous usage page</Button>
     <Button type="button" variant="secondary" disabled={usageBusy||!usage.has_more} onClick={()=>void loadUsage(usage.offset+usage.limit)}>Next usage page</Button></div>
   </section>}
  </div>
 </li>;
}
