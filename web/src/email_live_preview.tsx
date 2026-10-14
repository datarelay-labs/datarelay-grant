import {useEffect,useRef,useState} from 'react';
import {Alert,Button} from '@datarelay-labs/foundation';
import {api,errorText} from './api';
import {NotificationRenderedPreview,templateDraftSignature,type TemplateDraft} from './notification_preview';
import type {NotificationEvent} from './types';

export type LiveEmailPreview={rendered:{subject:string;body:string;html:string};validation:{html_bytes:number;protected_actions:number}};
export function createPreviewSequence(){
  let sequence=0;
  return {next:()=>++sequence,current:(value:number)=>value===sequence,invalidate:()=>{sequence++;}};
}
/** Read-only synthetic requests. No save, issue, OTP, transport or authorization. */
export function LiveEmailPreview({draft,event}:{draft:TemplateDraft;event:NotificationEvent}){
  const [preview,setPreview]=useState<LiveEmailPreview|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const [mode,setMode]=useState('EMAIL_PIN');
  const [refresh,setRefresh]=useState(0);
  const sequence=useRef(createPreviewSequence());
  const signature=templateDraftSignature(draft);
  useEffect(()=>{
    const generation=sequence.current.next();
    setPending(true);setError('');setPreview(null);
    const timer=setTimeout(()=>{
      const template={name:draft.name.trim()||'Unsaved preview',templates:draft.templates,
        ...(draft.design?{design:draft.design}:{})};
      void api<LiveEmailPreview>('/notification-template-drafts/preview','POST',{
        template,event,verification_mode:mode,sample:{
          request_title:'Sample approval request',request_url:'https://example.invalid/requests/sample',
          external_id:'SAMPLE-001',action_kind:'service.change',target:'sample-target',
          reason:'Synthetic preview only',deadline:'2030-01-01T00:00:00Z',
          decision_state:'AWAITING',execution_state:'NOT_STARTED',
        },
      }).then(value=>{if(sequence.current.current(generation))setPreview(value);})
        .catch(reason=>{if(sequence.current.current(generation))setError(errorText(reason));})
        .finally(()=>{if(sequence.current.current(generation))setPending(false);});
    },300);
    return()=>{clearTimeout(timer);sequence.current.invalidate();};
  },[signature,event,mode,refresh]);
  return <section aria-label="Live unsaved email preview" aria-busy={pending}>
    <h3>Live draft preview</h3>
    <p>Updates before saving. Fixed sample links and PIN 0000 cannot authorize a decision.</p>
    <label>Sample verification mode <select value={mode} onChange={e=>setMode(e.target.value)}>
      <option value="EMAIL_PIN">Email PIN</option><option value="EMAIL_PIN_PLUS_OTP">Email PIN + email OTP</option>
      <option value="EMAIL_PIN_PLUS_MFA">Email PIN + sign-in MFA</option>
    </select></label>
    {pending&&<p role="status">Rendering current draft…</p>}
    {error&&<Alert tone="critical" title="Draft cannot be rendered">{error}</Alert>}
    {preview&&<><strong>{preview.rendered.subject}</strong><NotificationRenderedPreview rendered={preview.rendered}/>
      <p>Validated HTML: {preview.validation.html_bytes.toLocaleString()} bytes · Protected actions: {preview.validation.protected_actions}.
        Mail-client acceptance has not been tested.</p></>}
    <Button variant="secondary" disabled={pending} onClick={()=>setRefresh(value=>value+1)}>Refresh live preview</Button>
  </section>;
}
