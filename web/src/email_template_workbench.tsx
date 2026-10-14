import {EmailPaletteControls} from './email_palette_controls';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Alert,Button,TextField} from '@datarelay-labs/foundation';
import {api} from './api';
import {EmailBodyEditor} from './email_template_design_editor';
import {createEmailDesign,withButtonSize,type EmailDesign,type EmailStyles} from './email_design';
import {LiveEmailPreview,type EmailPreviewState} from './email_live_preview';
import {inertEmailDocument,type TemplateDraft} from './notification_preview';
import {syntheticEmailSample} from './email_preview_model';
import {applyEmailPreset,resetEmailAppearance,createEmailHistory,insertEmailVariable,emailVariableOptions,editableEmailBlocks,blockLabels,blockScope,type EmailBlock} from './email_canvas_model';
import type {NotificationEvent,NotificationEventTemplate} from './types';
import './email-template-editor.css';

const presets=[['standard','Standard','Balanced, readable layout'],['compact','Compact','Less space, all required details'],['high_visibility','High visibility','Larger text and decision controls']] as const;
const labels:Record<NotificationEvent,string>={requested:'Approval requested',reminder:'Approval reminder',approved:'Approved',denied:'Denied',expired:'Expired',cancelled:'Cancelled',execution_succeeded:'Execution succeeded',execution_failed:'Execution failed',execution_unknown:'Execution unknown'};

function EmailPresetPicker({value,onChange,disabled,events}:{value:EmailDesign;onChange:(value:EmailDesign)=>void;disabled:boolean;events:NotificationEvent[]}){
 const [previews,setPreviews]=useState<Record<string,string>>({});
 const [failed,setFailed]=useState(false);
 const locale=value.locale;
 useEffect(()=>{
  let active=true;setPreviews({});setFailed(false);
  // Fixed synthetic examples: typing in the main draft does not trigger three extra renders.
  for(const [preset] of presets){
   const design={...createEmailDesign(preset),locale};
   const templates=Object.fromEntries(events.map(event=>[event,{subject:'{{request_title}}',body:'Please review the requested change.'}]));
   void api<{rendered:{html:string}}>('/notification-template-drafts/preview','POST',{
    template:{name:'Style example',templates,design},event:'requested',verification_mode:'EMAIL_PIN',sample:syntheticEmailSample('normal','requested'),
   }).then(result=>{if(active&&typeof result.rendered.html==='string'&&result.rendered.html.length<=131072)setPreviews(current=>({...current,[preset]:result.rendered.html}));})
    .catch(()=>{if(active)setFailed(true);});
  }
  return()=>{active=false;};
 },[locale]);
 return <details className="grant-email-presets"><summary>Style presets · {presets.find(([key])=>key===value.preset)?.[1]}</summary>
  <p>Appearance across all events. Your wording, language and button descriptions are preserved.</p>
  <div className="grant-email-preset-grid">{presets.map(([preset,label,description])=><Button type="button" key={preset} variant="secondary" disabled={disabled}
   aria-pressed={value.preset===preset} aria-label={'Use '+label+' preset'} onClick={()=>onChange(applyEmailPreset(value,preset))}>
   <span className="grant-email-preset-thumbnail" aria-hidden="true">{previews[preset]?<iframe title={label+' sample thumbnail'} tabIndex={-1} sandbox="" referrerPolicy="no-referrer" srcDoc={inertEmailDocument(previews[preset])}/>:<span>{failed?'Sample unavailable':'Rendering sample…'}</span>}</span>
   <strong>{label}</strong><small>{description}</small>
  </Button>)}</div>
 </details>;
}

export function EmailTemplateWorkbench({draft,event,variables,disabled,onChange,onEventChange,onRestoreEventCopy,onPreviewState}:{
 draft:TemplateDraft;event:NotificationEvent;variables:string[];disabled:boolean;
 onChange:(draft:TemplateDraft)=>void;onEventChange:(event:NotificationEvent)=>void;
 onRestoreEventCopy?:()=>Promise<NotificationEventTemplate>;onPreviewState?:(state:EmailPreviewState)=>void;
}){
 const [selected,setSelected]=useState<EmailBlock>('message');
 const [inspectorOpen,setInspectorOpen]=useState(false);
 const [variableQuery,setVariableQuery]=useState('');
 const [localError,setLocalError]=useState('');const [restore,setRestore]=useState(false);const [restoring,setRestoring]=useState(false);
 const history=useRef(createEmailHistory<TemplateDraft>());
 const inspector=useRef<HTMLElement>(null);
 const outline=useRef<HTMLElement>(null);
 const field=useRef<HTMLInputElement|HTMLTextAreaElement|null>(null);
 const design=draft.design??null,visual=!!design&&design.shared_layout_revision>=3;
 const busy=disabled||restoring;
 function change(next:TemplateDraft){if(busy)return;history.current.push(draft);setLocalError('');onChange(next);}
 function designChange(next:EmailDesign){change({...draft,design:next});}
 function copyChange(key:'subject'|'body',value:string,formatted=false){
  change({...draft,templates:{...draft.templates,[event]:{...draft.templates[event],[key]:value}},
   ...(formatted&&design?{design:{...design,rich_text:true}}:{})});
 }
 function select(block:EmailBlock,focus=true){
  setSelected(block);setInspectorOpen(true);setRestore(false);setLocalError('');field.current=null;
  if(focus)requestAnimationFrame(()=>inspector.current?.querySelector<HTMLElement>('input:not([type=color]),textarea,select,button')?.focus());
 }
 function closeInspector(){
  setInspectorOpen(false);
  requestAnimationFrame(()=>outline.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus());
 }
 function insert(key:string){
  const element=field.current?.isConnected?field.current:null;
  const inPreheader=selected==='subject'&&!!design&&!!element?.hasAttribute('data-email-preheader');
  const max=inPreheader?200:selected==='message'?8000:selected==='footer'?1000:250;
  const value=inPreheader?(design?.event_preheaders?.[event]??''):selected==='subject'?draft.templates[event].subject:selected==='message'?draft.templates[event].body:selected==='heading'?(design?.event_headings?.[event]??design?.heading??''):design?.footer??'';
  try{
   const next=insertEmailVariable(value,element?.selectionStart??value.length,element?.selectionEnd??value.length,key,variables,max);
   if(inPreheader&&design)designChange({...design,shared_layout_revision:design.shared_layout_revision>=4?design.shared_layout_revision:4,event_preheaders:{...design.event_preheaders,[event]:next.value}});
   else if(selected==='subject'||selected==='message')copyChange(selected==='subject'?'subject':'body',next.value);
   else if(design)designChange(selected==='heading'?{...design,event_headings:{...design.event_headings,[event]:next.value}}:{...design,footer:next.value});
   requestAnimationFrame(()=>{const target=element??inspector.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>('[data-email-wording]');target?.focus();target?.setSelectionRange(next.cursor,next.cursor);});
  }catch(error){setLocalError(error instanceof Error?error.message:'Unable to insert this variable.');}
 }
 function style<K extends keyof EmailStyles>(key:K,value:EmailStyles[K]){if(design)designChange({...design,styles:{...design.styles,[key]:value}});}
 const wording=['subject','heading','message','footer'].includes(selected)&&(visual||selected==='subject'||selected==='message');
 const variablePicker=wording?<details className="grant-email-variable-picker"><summary>Insert variable</summary>
  <TextField label="Find a variable" value={variableQuery} onChange={e=>setVariableQuery(e.target.value)} disabled={busy}/>
  <div className="grant-email-variable-options">{emailVariableOptions(variables,variableQuery).map(item=><Button key={item.key} type="button" variant="ghost" disabled={busy} onClick={()=>insert(item.key)}>
   <strong>{item.label}</strong><small>{item.description}</small><span>Example: {item.example}</span><code>{'{{'+item.key+'}}'}</code>
  </Button>)}</div>
  {!emailVariableOptions(variables,variableQuery).length&&<p>No matching available variables.</p>}
 </details>:null;
 const capture=(target:EventTarget|null)=>{const element=target as HTMLElement|null;if(element?.matches('[data-email-wording],textarea'))field.current=element as HTMLInputElement|HTMLTextAreaElement;};
 let properties:ReactNode;
 if(selected==='subject')properties=<><TextField data-email-wording label="Event subject" required maxLength={250} value={draft.templates[event].subject} disabled={busy} onChange={e=>copyChange('subject',e.target.value)}/>
  {visual&&design&&<><TextField data-email-wording data-email-preheader label="Event preheader" maxLength={200} value={design.event_preheaders?.[event]??''} disabled={busy}
   onChange={e=>designChange({...design,shared_layout_revision:design.shared_layout_revision>=4?design.shared_layout_revision:4,event_preheaders:{...design.event_preheaders,[event]:e.target.value}})}/>
   <p>Optional inbox summary for this event. Use one line and up to 200 characters; leave empty to omit. Published mail is unchanged.</p></>}
 </>;
 else if(selected==='message')properties=<>
  <EmailBodyEditor value={draft.templates[event].body} visual={!!design} disabled={busy}
   onChange={value=>copyChange('body',value)} onEnableFormatting={()=>{}}
   onFormattedChange={value=>copyChange('body',value,true)}/>
  {visual&&<details><summary>Shared text appearance</summary><p>All events in this template set</p>
   <TextField label="Body font size (px)" type="number" min={14} max={20} value={String(design.styles.font_size)} disabled={busy}
    onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=14&&n<=20)style('font_size',n);}}/>
   <label>Paragraph alignment<select value={design.paragraph_alignment??'left'} disabled={busy} onChange={e=>designChange({...design,paragraph_alignment:e.target.value as 'left'|'center'|'right'})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
   <Button type="button" variant="secondary" disabled={busy} onClick={()=>designChange(resetEmailAppearance(design,'message'))}>Reset text appearance</Button>
  </details>}
  {visual&&<EmailPaletteControls design={design} disabled={busy} onChange={designChange}/>}
  <Button type="button" variant="secondary" disabled={busy||!onRestoreEventCopy} onClick={()=>setRestore(true)}>Restore default wording</Button>
 </>;
 else if(selected==='heading')properties=visual?<><TextField data-email-wording label="Event heading" value={design.event_headings?.[event]??design.heading} required maxLength={250} disabled={busy}
  onChange={e=>designChange({...design,event_headings:{...design.event_headings,[event]:e.target.value}})}/><p>Only {labels[event].toLowerCase()} changes.</p></>:<p>Enable the canvas layout to edit a heading for this event. The current shared heading is preserved.</p>;
 else if(selected==='footer')properties=visual?<TextField data-email-wording label="Additional footer wording" value={design.footer} maxLength={1000} disabled={busy} onChange={e=>designChange({...design,footer:e.target.value})}/>:<p>Enable visual editing to add footer wording.</p>;
 else if(selected==='brand')properties=<><strong>Text brand</strong><p>Brand and sender names are managed in Notifications → Branding. No account or sender settings are changed here.</p><p>Logo upload is not available. The text brand remains visible.</p></>;
 else if(selected==='request_context')properties=<><strong>Protected request details</strong><p>Title, action, target, reference and deadline remain visible before the decisions. These values come from the request; they cannot be removed or rebound.</p></>;
 else if(selected==='verification')properties=<><strong>Verification requirements</strong><p>The approval policy determines PIN, OTP and sign-in MFA. The final Confirm remains mandatory. Change Sample data to inspect each mode; previewing never changes policy.</p></>;
 else properties=visual?<>
  <div role="group" aria-label="Button size" className="grant-email-button-sizes">{(['S','M','L'] as const).map(size=><Button key={size} type="button" variant="secondary" disabled={busy} aria-pressed={design.button_size===size} onClick={()=>designChange(withButtonSize(design,size))}>
   <span style={{fontSize:{S:14,M:16,L:20}[size]}}>{size}</span><small>{{S:'44px',M:'48px',L:'56px'}[size]}</small>
  </Button>)}</div>
  {(['approve_color','hold_color','deny_color'] as const).map(key=><TextField key={key} label={{approve_color:'Approve button color',hold_color:'Hold button color',deny_color:'Deny button color'}[key]} type="color" disabled={busy} value={design.styles[key]} onChange={e=>style(key,e.target.value)}/>)}
  <details><summary>Advanced button appearance</summary>
   {([['button_font_size','Button font size (px)',14,20],['button_padding_x','Horizontal padding (px)',16,32],['button_padding_y','Vertical padding (px)',10,20],['button_gap','Button gap (px)',8,24],['button_radius','Corner radius (px)',0,16]] as const).map(([key,label,min,max])=><TextField key={key} label={label} type="number" min={min} max={max} value={String(design.styles[key])} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=min&&n<=max)style(key,n);}}/>)}
  </details>
  <details><summary>Button descriptions</summary><p>Canonical action names remain visible.</p>{(['approve','hold','deny','details'] as const).map(key=><TextField key={key} label={{approve:'Approve description',hold:'Hold description',deny:'Deny description',details:'View Details description'}[key]} maxLength={40} value={design.button_suffixes?.[key]??''} disabled={busy}
   onChange={e=>designChange({...design,button_suffixes:{approve:'',hold:'',deny:'',details:'',...design.button_suffixes,[key]:e.target.value}})}/>)}</details>
  <Button type="button" variant="secondary" disabled={busy} onClick={()=>designChange(resetEmailAppearance(design,'actions'))}>Reset button appearance</Button>
  <p>Protected approval actions: Approve · Hold · Deny. View Details is navigation, not a fourth decision. Button styling cannot change their meaning.</p>
  {!['requested','reminder'].includes(event)&&<p>This is a terminal/result event. No approval decisions are included.</p>}
 </>:<p>Enable the canvas layout to edit button appearance.</p>;
 return <section className="grant-email-authoring" aria-label="Canvas-first email editor">
  <div className="grant-email-context-bar">
   <label>Event<select aria-label="Event" value={event} disabled={busy} onChange={e=>{setRestore(false);field.current=null;onEventChange(e.target.value as NotificationEvent);}}>{(Object.keys(draft.templates) as NotificationEvent[]).map(key=><option key={key} value={key}>{labels[key]}</option>)}</select></label>
   {visual&&<label>Language<select aria-label="Language" aria-describedby="grant-email-language-scope" value={design.locale} disabled={busy} onChange={e=>designChange({...design,locale:e.target.value as 'en'|'ko'})}><option value="en">English</option><option value="ko">Korean</option></select><small id="grant-email-language-scope">Set-wide; your wording is not translated.</small></label>}
   <div className="grant-actions"><Button type="button" variant="secondary" disabled={busy||!history.current.canUndo()} onClick={()=>{const next=history.current.undo(draft);if(next)onChange(next);}}>Undo</Button>
    <Button type="button" variant="secondary" disabled={busy||!history.current.canRedo()} onClick={()=>{const next=history.current.redo(draft);if(next)onChange(next);}}>Redo</Button></div>
  </div>
  {!visual&&<Alert tone="info" title={design?'Enable canvas layout':'Enable visual draft'}><p>Your published version stays unchanged. The new layout adds block selection and event-specific headings without replacing your wording.</p>
   <Button type="button" variant="secondary" disabled={busy} onClick={()=>designChange(design?{...design,shared_layout_revision:5}:createEmailDesign())}>{design?'Enable canvas editing':'Enable visual draft'}</Button>
  </Alert>}
  {visual&&<EmailPresetPicker value={design} onChange={designChange} disabled={busy} events={Object.keys(draft.templates) as NotificationEvent[]}/>}
  <div className="grant-email-authoring-grid">
   <nav ref={outline} className="grant-email-outline" aria-label="Email blocks">{editableEmailBlocks.map(block=><button key={block} type="button" aria-pressed={selected===block} aria-controls="grant-email-properties" onClick={()=>select(block,false)}>
    {blockLabels[block]}{['request_context','actions','verification'].includes(block)&&<small>Protected</small>}
   </button>)}</nav>
   <div className="grant-email-central-canvas"><p className="grant-email-canvas-hint">Select a message or button to edit its appearance. No approval or navigation is performed.</p>
    <LiveEmailPreview draft={draft} event={event} selectedBlock={selected} onSelectBlock={block=>select(block)} onPreviewState={onPreviewState}/>
   </div>
   <section id="grant-email-properties" ref={inspector} className={'grant-email-properties'+(inspectorOpen?' is-open':'')} aria-label="Selected block properties"
    onFocusCapture={e=>capture(e.target)} onSelect={e=>capture(e.target)}
    onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();closeInspector();}}}>
    <div className="grant-email-property-heading"><h3>{blockLabels[selected]}</h3><Button className="grant-email-close-properties" type="button" variant="ghost" onClick={closeInspector}>Close settings</Button></div>
    <p className="grant-email-setting-scope">{blockScope[selected]}</p>
    {localError&&<Alert tone="critical" title={localError}/>}
    {properties}{variablePicker}
    {restore&&<Alert tone="warning" title="Replace this event wording?">
     <p>Only the subject and body of {labels[event].toLowerCase()} will be replaced with built-in {design?.locale==='ko'?'Korean':'English'} text. Other events and published versions are unchanged.</p>
     <Button type="button" variant="secondary" onClick={()=>setRestore(false)}>Keep wording</Button>
     <Button type="button" disabled={busy} onClick={()=>{if(!onRestoreEventCopy)return;setRestoring(true);void onRestoreEventCopy().then(copy=>{history.current.push(draft);onChange({...draft,templates:{...draft.templates,[event]:copy}});setRestore(false);}).catch(()=>setLocalError('Default wording could not be loaded. Your draft is unchanged.')).finally(()=>setRestoring(false));}}>Replace event wording</Button>
    </Alert>}
   </section>
  </div>
 </section>;
}
