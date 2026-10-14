import {useEffect,useRef,useState} from 'react';
import {Button} from '@datarelay-labs/foundation';
import {api} from './api';
import {inertEmailDocument} from './notification_preview';
import {syntheticEmailSample} from './email_preview_model';
import type {NotificationTemplateSet} from './types';

export function EmailTemplateTile({template,disabled,onEdit}:{template:NotificationTemplateSet;disabled:boolean;onEdit:()=>void}){
 const element=useRef<HTMLLIElement>(null);
 const [visible,setVisible]=useState(false),[html,setHtml]=useState<string|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
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
   <p>{typeof template.active_policy_count==='number'?'Used by '+template.active_policy_count+' active '+(template.active_policy_count===1?'policy':'policies'):'Policy impact is available during publication review.'}</p>
   <small>Thumbnail uses synthetic request data and the saved draft, not a delivered message.</small>
   <div className="grant-actions"><Button type="button" variant="secondary" disabled={disabled} onClick={onEdit}>Edit draft</Button>
    {error&&<Button type="button" variant="ghost" disabled={disabled} onClick={()=>setRetry(value=>value+1)}>Retry preview</Button>}</div>
  </div>
 </li>;
}
