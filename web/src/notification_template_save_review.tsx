import {Alert,Button} from '@datarelay-labs/foundation';
import type {NotificationEvent,NotificationTemplateSet} from './types';
import {templateDraftSignature,type TemplateDraft} from './notification_preview';

const requiredEvents:NotificationEvent[]=[
  'requested','reminder','approved','denied','expired','cancelled',
  'execution_succeeded','execution_failed','execution_unknown',
];
export type TemplateSaveMode='create'|'update';
export type TemplateSaveReview=Readonly<{
  mode:TemplateSaveMode;
  key:string;
  savedId:string;
  savedUpdatedAt:number|null;
  savedFingerprint:string|null;
  savedName:string|null;
  savedEnabled:boolean|null;
  draft:TemplateDraft;
  draftFingerprint:string;
  changedEvents:NotificationEvent[];
}>;
function cloned(draft:TemplateDraft):TemplateDraft{
  return {
    name:draft.name,enabled:draft.enabled,
    ...(draft.design?{design:structuredClone(draft.design)}:{}),
    templates:Object.fromEntries(requiredEvents.map(event=>[
      event,{
        subject:draft.templates[event].subject,
        body:draft.templates[event].body,
      },
    ])) as NotificationTemplateSet['templates'],
  };
}
function valid(draft:TemplateDraft):boolean{
  const events=draft?.templates;
  if(!draft||typeof draft.name!=='string'||!draft.name.trim()
    ||draft.name.length>100||/[\r\n]/.test(draft.name)
    ||typeof draft.enabled!=='boolean'
    ||!events||typeof events!=='object'||Array.isArray(events)
    ||Object.keys(events).length!==requiredEvents.length
    ||requiredEvents.some(event=>{
      const item=events[event];
      return !item||typeof item.subject!=='string'||!item.subject.trim()
        ||item.subject.length>250||/[\r\n]/.test(item.subject)
        ||typeof item.body!=='string'||!item.body.trim()
        ||item.body.length>8000;
    }))return false;
  return true;
}
/** Read-only exact nine-event snapshot. This does not substitute for
 * server-side variable validation or atomic multi-admin version CAS.
 */
export function prepareTemplateSaveReview(
  mode:TemplateSaveMode,
  saved:NotificationTemplateSet|null,
  draft:TemplateDraft,
):TemplateSaveReview{
  if(!valid(draft)
    ||(mode==='create'&&(saved!==null||draft.enabled!==true))
    ||(mode==='update'&&(!saved?.id||!Number.isFinite(saved.updated_at)
      ||!valid(saved)))
    ||!['create','update'].includes(mode)){
    throw Error('TEMPLATE_SAVE_REVIEW_INVALID');
  }
  const fresh=cloned(draft);
  const fingerprint=templateDraftSignature(fresh);
  if(mode==='update'&&saved&&templateDraftSignature(saved)===fingerprint){
    throw Error('TEMPLATE_SAVE_REVIEW_INVALID');
  }
  const sourceSignature=saved?templateDraftSignature(saved):null;
  const changedEvents=requiredEvents.filter(event=>
    !saved||saved.templates[event]?.subject!==fresh.templates[event].subject
    ||saved.templates[event]?.body!==fresh.templates[event].body);
  return {
    mode,
    key:mode==='update'?saved!.id:'create:'+fresh.name.trim().toLowerCase(),
    savedId:saved?.id??'',
    savedUpdatedAt:saved?.updated_at??null,
    savedFingerprint:saved
      ?JSON.stringify([saved.id,saved.updated_at,sourceSignature]):null,
    savedName:saved?.name??null,
    savedEnabled:saved?.enabled??null,
    draft:fresh,draftFingerprint:fingerprint,changedEvents,
  };
}
export function isCurrentTemplateSaveReview(
  intent:TemplateSaveReview|null,
  saved:NotificationTemplateSet|null,
  draft:TemplateDraft,
):boolean{
  if(!intent)return false;
  try {
    const updated=prepareTemplateSaveReview(intent.mode,saved,draft);
    return JSON.stringify(intent)===JSON.stringify(updated);
  }catch{return false;}
}
export type TemplateSavePayload={
  name:string;templates:NotificationTemplateSet['templates'];enabled?:boolean;design?:NotificationTemplateSet['design'];
  expected_updated_at?:number;
};
/** Synchronous one-shot. A potentially committed save is kept latched
 * until explicit role-scoped refresh for its original reviewed identity.
 */
export function createTemplateSaveGuard(){
  let claimed=false,inFlight=false,postStarted=false,attempted='';
  return {
    claim(key:string):boolean{
      if(!key||claimed||inFlight)return false;
      claimed=true;inFlight=true;postStarted=false;attempted=key;return true;
    },
    markPostStarted():void{
      if(!inFlight)throw Error('TEMPLATE_SAVE_CLAIM_REQUIRED');
      postStarted=true;
    },
    settled():void{
      inFlight=false;
      if(!postStarted){claimed=false;attempted='';}
    },
    blocked():boolean{return claimed||inFlight;},
    attemptedFor():string{return attempted;},
    readSucceeded(key:string):boolean{
      if(inFlight||!attempted||attempted!==key)return false;
      claimed=false;postStarted=false;attempted='';return true;
    },
  };
}
export function verifyTemplateSaveReceipt<T extends NotificationTemplateSet>(
  intent:TemplateSaveReview,result:T,
):T{
  if(!result||typeof result.id!=='string'||!result.id.trim()
    ||(intent.mode==='update'&&result.id!==intent.savedId)
    ||result.name!==intent.draft.name
    ||result.enabled!==intent.draft.enabled
    ||templateDraftSignature(result)!==intent.draftFingerprint){
    throw Error('TEMPLATE_SAVE_RECEIPT_MISMATCH');
  }
  return result;
}
export async function submitReviewedTemplateSave<T extends NotificationTemplateSet>(
  intent:TemplateSaveReview,
  guard:ReturnType<typeof createTemplateSaveGuard>,
  readCurrent:()=>Promise<NotificationTemplateSet[]>,
  postOnce:(mode:TemplateSaveMode,id:string,payload:TemplateSavePayload)=>Promise<T>,
  stillSelected:()=>boolean,
):Promise<T|null>{
  if(!guard.claim(intent.key))return null;
  try{
    if(!stillSelected())throw Error('TEMPLATE_SAVE_SOURCE_CHANGED');
    const current=await readCurrent();
    if(!Array.isArray(current)||!stillSelected()){
      throw Error('TEMPLATE_SAVE_SOURCE_CHANGED');
    }
    if(intent.mode==='update'){
      const source=current.find(item=>item.id===intent.savedId)??null;
      if(!source||!isCurrentTemplateSaveReview(intent,source,intent.draft)){
        throw Error('TEMPLATE_SAVE_SOURCE_CHANGED');
      }
    }else{
      if(current.some(item=>item.name.trim().toLowerCase()===
        intent.draft.name.trim().toLowerCase())){
        throw Error('TEMPLATE_SAVE_NAME_EXISTS');
      }
      if(!isCurrentTemplateSaveReview(intent,null,intent.draft)){
        throw Error('TEMPLATE_SAVE_SOURCE_CHANGED');
      }
    }
    const payload:TemplateSavePayload={
      name:intent.draft.name,
      templates:cloned(intent.draft).templates,
      ...(intent.draft.design?{design:structuredClone(intent.draft.design)}:{}),
      ...(intent.mode==='update'?{
        enabled:intent.draft.enabled,
        expected_updated_at:intent.savedUpdatedAt!,
      }:{}),
    };
    guard.markPostStarted();
    return verifyTemplateSaveReceipt(intent,
      await postOnce(intent.mode,intent.savedId,payload));
  }finally{guard.settled();}
}
export function NotificationTemplateSaveConfirmation({
  reviewed,valid,busy,onBack,onConfirm,
}:{
  reviewed:TemplateSaveReview|null;valid:boolean;busy:boolean;
  onBack:()=>void;onConfirm:()=>void;
}){
  if(!reviewed)return null;
  return <Alert tone="warning" title="Review notification template set">
    <p>Review exact saved identity and all nine future email event messages.
      Existing request snapshots remain unchanged. No email, human approval,
      or execution is triggered by this review.</p>
    <dl className="grant-facts">
      <dt>Operation</dt><dd>{reviewed.mode==='create'?'Create new template set':'Update saved template set'}</dd>
      <dt>Saved set ID</dt><dd><code>{reviewed.savedId||'New set (server assigns ID)'}</code></dd>
      <dt>Saved name</dt><dd>{reviewed.savedName??'No previous template set'}</dd>
      <dt>Requested name</dt><dd>{reviewed.draft.name}</dd>
      <dt>Saved status</dt><dd>{reviewed.savedEnabled===null?'Not created':reviewed.savedEnabled?'Enabled':'Disabled'}</dd>
      <dt>Requested status</dt><dd>{reviewed.draft.enabled?'Enabled':'Disabled'}</dd>
      <dt>Visual design</dt><dd>{reviewed.draft.design?reviewed.draft.design.preset+' · '+reviewed.draft.design.button_size+' buttons':'Legacy text template'}</dd>
      <dt>Changes to messages</dt><dd>{reviewed.changedEvents.length} of {requiredEvents.length} events</dd>
    </dl>
    {reviewed.draft.design&&<details><summary>Review exact visual design</summary><pre className="grant-mono">{JSON.stringify(reviewed.draft.design,null,2)}</pre></details>}
    {reviewed.draft.design&&<section aria-label="Reviewed visual email design">
      <h4>Visual design in this save</h4>
      <p>Preset: {reviewed.draft.design.preset} · Buttons: {reviewed.draft.design.button_size}
        {' · '}Font: {reviewed.draft.design.styles.button_font_size}px
        {' · '}Padding: {reviewed.draft.design.styles.button_padding_y}px / {reviewed.draft.design.styles.button_padding_x}px
        {' · '}Gap: {reviewed.draft.design.styles.button_gap}px · Radius: {reviewed.draft.design.styles.button_radius}px</p>
      <p>Language: {reviewed.draft.design.locale}. Saving this visual draft does not publish it.</p>
    </section>}
    <details>
      <summary>Review all future event subjects and bodies</summary>
      {requiredEvents.map(event=><section key={event} aria-label={'Event '+event}>
        <h4>{event}{reviewed.changedEvents.includes(event)?' · changed':''}</h4>
        <p>Subject: {reviewed.draft.templates[event].subject}</p>
        <pre className="grant-mono">{reviewed.draft.templates[event].body}</pre>
      </section>)}
    </details>
    <p>Server user permissions, complete event-variable validation and
      saved enabled-policy constraints remain authoritative. The reviewed
      revision is checked atomically by the server; another administrator's
      save requires an explicit Refresh and new Review.</p>
    {!valid&&<p role="alert">Template selection, saved version or proposed
      event message changed. Return to edit and review the current set.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onBack}>Back to edit</Button>
      <Button disabled={busy||!valid} onClick={onConfirm}>
        {reviewed.mode==='create'?'Confirm template set creation':'Confirm template set update'}
      </Button>
    </div>
  </Alert>;
}
