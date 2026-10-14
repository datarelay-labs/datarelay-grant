import {useEffect,useRef,useState} from 'react';
import {Alert,Button} from '@datarelay-labs/foundation';
import {api,errorText} from './api';
import {NotificationRenderedPreview,templateDraftSignature,type TemplateDraft} from './notification_preview';
import {emailPreviewProblems,syntheticEmailSample,type EmailSampleKind} from './email_preview_model';
import type {EmailBlock} from './email_canvas_model';
import type {NotificationEvent} from './types';

export type LiveEmailPreview={rendered:{subject:string;preheader?:string;body:string;html:string;renderer_revision?:string};validation:{html_bytes:number;protected_actions:number}};
export type EmailPreviewState={signature:string;event:NotificationEvent;current:boolean};
export function createPreviewSequence(){let sequence=0;return {next:()=>++sequence,current:(value:number)=>value===sequence,invalidate:()=>{sequence++;}};}
/** Read-only synthetic requests. A stale render is presentation, never review evidence. */
export function LiveEmailPreview({draft,event,selectedBlock,onSelectBlock,onPreviewState}:{draft:TemplateDraft;event:NotificationEvent;selectedBlock?:EmailBlock;onSelectBlock?:(block:EmailBlock,field?:string)=>void;onPreviewState?:(state:EmailPreviewState)=>void}){
 const [result,setResult]=useState<{key:string;value:LiveEmailPreview}|null>(null);
 const [error,setError]=useState('');const [pending,setPending]=useState(true);
 const [mode,setMode]=useState('EMAIL_PIN');const [sampleKind,setSampleKind]=useState<EmailSampleKind>('normal');
 const [refresh,setRefresh]=useState(0);const sequence=useRef(createPreviewSequence());
 const signature=templateDraftSignature(draft),key=JSON.stringify([signature,event,mode,sampleKind,refresh]);
 const problems=emailPreviewProblems(draft,event),problemKey=JSON.stringify(problems);
 const current=result?.key===key&&!pending&&!error&&!problems.length;
 useEffect(()=>{onPreviewState?.({signature,event,current});},[signature,event,current,onPreviewState]);
 useEffect(()=>{
  const generation=sequence.current.next();setError('');
  if(problemKey!=='[]'){setPending(false);return()=>sequence.current.invalidate();}
  setPending(true);
  const timer=setTimeout(()=>{
   const template={name:draft.name.trim()||'Unsaved preview',templates:draft.templates,...(draft.design?{design:draft.design}:{})};
   void api<LiveEmailPreview>('/notification-template-drafts/preview','POST',{template,event,verification_mode:mode,sample:syntheticEmailSample(sampleKind,event)})
    .then(value=>{if(typeof value?.rendered?.html!=='string'||value.rendered.html.length>131072)throw Error('Invalid renderer output');if(sequence.current.current(generation))setResult({key,value});})
    .catch(reason=>{if(sequence.current.current(generation))setError(errorText(reason));})
    .finally(()=>{if(sequence.current.current(generation))setPending(false);});
  },300);
  return()=>{clearTimeout(timer);sequence.current.invalidate();};
 },[key,problemKey]);
 const preview=result?.value;
 return <section aria-label="Live unsaved email preview" aria-busy={pending} className="grant-email-live-preview">
  <details className="grant-email-sample-controls"><summary>Sample data</summary>
   <label>Scenario <select aria-label="Sample scenario" value={sampleKind} onChange={e=>setSampleKind(e.target.value as EmailSampleKind)}>
    <option value="normal">Normal request</option><option value="long_en">Long English</option><option value="long_ko">Long Korean</option><option value="missing_optional">Missing optional reason</option>
   </select></label>
   <label>Sample verification mode <select aria-label="Sample verification mode" value={mode} onChange={e=>setMode(e.target.value)}>
    <option value="EMAIL_PIN">Email PIN</option><option value="EMAIL_PIN_PLUS_OTP">Email PIN + email OTP</option><option value="EMAIL_PIN_PLUS_MFA">Email PIN + sign-in MFA</option>
   </select></label>
   <p>Synthetic request data only. PIN 0000 and sample links cannot authorize a decision.</p>
  </details>
  {problems.map((problem,index)=><Alert key={index} tone="critical" title={problem.message}>
   {onSelectBlock&&<Button variant="secondary" onClick={()=>onSelectBlock(problem.block,problem.field)}>Edit {problem.block==='actions'?'button colors':problem.block}</Button>}
  </Alert>)}
  {error&&<Alert tone="critical" title="The current draft could not be rendered">{error}. Check the selected event and retry. The previous preview is not valid for review.</Alert>}
  {!current&&preview&&<p role="status" className="grant-email-stale">{pending?'Updating preview — previous result shown.':'Previous result shown — not valid for review.'}</p>}
  {pending&&!preview&&<p role="status">Rendering current draft…</p>}
  {preview&&<><button type="button" className="grant-email-subject-select" onClick={()=>onSelectBlock?.('subject')}>
   <small>Subject</small><strong>{preview.rendered.subject}</strong>{preview.rendered.preheader&&<><small>Preheader</small><span aria-label="Inbox preheader preview">{preview.rendered.preheader}</span></>}</button>
   <NotificationRenderedPreview rendered={preview.rendered} selectedBlock={selectedBlock} onSelectBlock={draft.design&&draft.design.shared_layout_revision>=3?onSelectBlock:undefined}/>
   <details><summary>Diagnostics</summary><p>Validated HTML: {preview.validation.html_bytes.toLocaleString()} bytes · Protected actions: {preview.validation.protected_actions}. Renderer: {preview.rendered.renderer_revision??'server renderer'}. Mail-client acceptance has not been tested.</p></details>
  </>}
  <Button variant="secondary" disabled={pending||!!problems.length} onClick={()=>setRefresh(value=>value+1)}>Refresh live preview</Button>
 </section>;
}
