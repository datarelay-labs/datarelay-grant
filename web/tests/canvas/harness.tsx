import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {EmailTemplateWorkbench} from '../../src/email_template_workbench';
import {createEmailDesign} from '../../src/email_design';
import type {TemplateDraft} from '../../src/notification_preview';
import type {EmailPreviewState} from '../../src/email_live_preview';
import type {NotificationEvent} from '../../src/types';
const events:NotificationEvent[]=['requested','reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown'];
const initial:TemplateDraft={name:'Synthetic only',enabled:true,design:createEmailDesign(),templates:Object.fromEntries(events.map(event=>[event,{subject:'Approval {{request_title}}',body:'Please review {{target}}.'}])) as TemplateDraft['templates']};
function Harness(){
 const [draft,setDraft]=useState(initial),[event,setEvent]=useState<NotificationEvent>('requested');
 const [state,setState]=useState<EmailPreviewState|null>(null);
 return <main style={{maxWidth:1500,margin:'auto',padding:12}}><h1>Email template — synthetic component test</h1>
  <EmailTemplateWorkbench draft={draft} event={event} variables={['request_title','request_url','external_id','action_kind','target','reason','deadline','decision_state','execution_state']} disabled={false}
   onChange={setDraft} onEventChange={setEvent} onPreviewState={setState}
   onRestoreEventCopy={async()=>({subject:'Restored '+event,body:'Restored wording'})}/>
  <details><summary>Test state</summary><output aria-label="Current draft JSON">{JSON.stringify(draft)}</output><output aria-label="Preview currency">{state?.current?'CURRENT':'STALE'}</output></details>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
