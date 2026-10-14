import {useRef,useState,useImperativeHandle,type Ref} from 'react';
import {Button,TextField,Alert} from '@datarelay-labs/foundation';
import {Select,TextArea} from './common';
import {createEmailDesign,withButtonSize,formatEmailText,type EmailDesign,type EmailStyles} from './email_design';
import './email-template-editor.css';

/** Approval-domain composition of existing controls; Foundation is unchanged. */
export function EmailTemplateDesignEditor({value,onChange,onInsertVariable,variables,disabled,onRestoreEventCopy}:{
  value:EmailDesign|null;onChange:(value:EmailDesign)=>void;onInsertVariable:(variable:string)=>void;
  variables:string[];disabled:boolean;onRestoreEventCopy?:()=>void;
}){
  const [restoreCopy,setRestoreCopy]=useState(false);
  const history=useRef<EmailDesign[]>([]);
  const future=useRef<EmailDesign[]>([]);
  function change(next:EmailDesign){
    if(disabled)return;
    if(value)history.current=[...history.current.slice(-19),structuredClone(value)];
    future.current=[];
    onChange(next);
  }
  if(!value)return <section aria-label="Visual design opt-in">
    <h3>Visual email design</h3>
    <p>This is a legacy text template. Enable a visual draft to edit its appearance.
      Saving the draft preserves the current published message until explicit publication.</p>
    <Button variant="secondary" disabled={disabled} onClick={()=>change(createEmailDesign())}>Enable visual draft</Button>
  </section>;
  function style<K extends keyof EmailStyles>(key:K,next:EmailStyles[K]){
    change({...value!,styles:{...value!.styles,[key]:next}});
  }
  const numeric:[keyof EmailStyles,string,number,number][]=[
    ['font_size','Body font size (px)',14,20],['button_font_size','Button font size (px)',14,20],
    ['button_padding_x','Button horizontal padding (px)',16,32],['button_padding_y','Button vertical padding (px)',10,20],
    ['button_gap','Button gap (px)',8,24],['button_radius','Button corner radius (px)',0,16],
  ];
  return <section aria-label="Approval email visual design" className="grant-email-designer">
    <h3>Design your approval email</h3>
    <div className="grant-actions" role="group" aria-label="Email design presets">
      {(['standard','compact','high_visibility'] as const).map((preset,index)=><Button key={preset}
        variant="secondary" disabled={disabled} aria-pressed={value.preset===preset}
        onClick={()=>{const next=createEmailDesign(preset);change({...next,locale:value.locale,heading:value.heading,footer:value.footer,rich_text:value.rich_text,button_suffixes:value.button_suffixes,paragraph_alignment:value.paragraph_alignment});}}>
        {['Standard','Compact','High visibility'][index]}</Button>)}
      <Button variant="secondary" disabled={disabled||history.current.length===0}
        onClick={()=>{const previous=history.current.pop();if(previous){future.current.push(structuredClone(value));onChange(previous);}}}>Undo design change</Button>
      <Button variant="secondary" disabled={disabled||future.current.length===0}
        onClick={()=>{const next=future.current.pop();if(next){history.current.push(structuredClone(value));onChange(next);}}}>Redo design change</Button>
      <Button variant="secondary" disabled={disabled} onClick={()=>change(createEmailDesign())}>Reset design</Button>
    </div>
    <div className="grant-email-design-grid">
      <section aria-label="Email content blocks">
        <h4>1. Content and variables</h4>
        <TextField label="Email heading" maxLength={250} value={value.heading} disabled={disabled}
          onChange={e=>change({...value,heading:e.target.value})}/>
        <TextArea label="Additional footer wording" value={value.footer} onChange={footer=>{if(footer.length<=1000)change({...value,footer});}}/>
        <Select label="Email language" value={value.locale} onChange={locale=>change({...value,locale:locale as EmailDesign['locale']})}>
          <option value="en">English</option><option value="ko">Korean</option>
        </Select>
        <Select label="Paragraph alignment" value={value.paragraph_alignment??'left'}
          onChange={alignment=>change({...value,shared_layout_revision:2,paragraph_alignment:alignment as 'left'|'center'|'right'})}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </Select>
        <Button variant="secondary" disabled={disabled||!onRestoreEventCopy}
          onClick={()=>setRestoreCopy(true)}>Restore selected event wording in this language</Button>
        {restoreCopy&&<Alert tone="warning" title="Replace this event draft wording?">
          The subject and body of the selected event will be replaced with built-in {value.locale==='ko'?'Korean':'English'} text.
          Other events and published messages are unchanged. This does not save or publish.
          <Button variant="secondary" onClick={()=>setRestoreCopy(false)}>Keep current wording</Button>
          <Button disabled={disabled} onClick={()=>{setRestoreCopy(false);onRestoreEventCopy?.();}}>Replace selected event wording</Button>
        </Alert>}
        <p>Insert a safe variable at the event body cursor:</p>
        <div className="grant-actions" aria-label="Safe email variable chips">
          {variables.map(variable=><Button key={variable} variant="secondary" disabled={disabled}
            onClick={()=>onInsertVariable(variable)}>{'{{'+variable+'}}'}</Button>)}
        </div>
        <p>Logo upload is unavailable. The visible brand name is always retained.</p>
        <Button variant="secondary" disabled>Logo upload unavailable</Button>
      </section>
      <section aria-label="Approval button appearance">
        <h4>2. Button appearance</h4>
        <Select label="Button size" value={value.button_size} onChange={size=>change(withButtonSize(value,size as EmailDesign['button_size']))}>
          <option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option>
        </Select>
        <details><summary>Advanced typography and spacing</summary>
          <div className="grant-email-style-grid">{numeric.map(([key,label,min,max])=><TextField key={key}
            label={label} type="number" min={min} max={max} step={1} disabled={disabled} value={String(value.styles[key])}
            onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=min&&n<=max)style(key,n);}}/>)}</div>
        </details>
        {(['approve_color','hold_color','deny_color'] as const).map(key=><TextField key={key}
          label={{approve_color:'Approve button color',hold_color:'Hold button color',deny_color:'Deny button color'}[key]}
          type="color" value={value.styles[key]} disabled={disabled} onChange={e=>style(key,e.target.value)}/>)}
        <details><summary>Optional button descriptions</summary>
          <p>The canonical action always remains visible. Add only a short explanatory suffix.</p>
          {(['approve','hold','deny','details'] as const).map(key=><TextField key={key} maxLength={40}
            label={{approve:'Approve description',hold:'Hold description',deny:'Deny description',details:'View Details description'}[key]}
            value={value.button_suffixes?.[key]??''} disabled={disabled}
            onChange={e=>change({...value,shared_layout_revision:2,button_suffixes:{approve:'',hold:'',deny:'',details:'',...value.button_suffixes,[key]:e.target.value}})}/>)}
        </details>
        <p>White button text must retain at least 4.5:1 contrast. The server rejects unreadable colors.</p>
      </section>
    </div>
    <Alert tone="info" title="Protected approval actions">
      <p>Approve · Hold · Deny · View Details. Labels, links, required request context and action bindings cannot be removed or changed.</p>
      <strong>Verification requirements</strong>
      <p>The server inserts the actual PIN/OTP/MFA instructions and retains final Confirm.
        Styling never changes approval authority. Saving is not publishing.</p>
    </Alert>
  </section>;
}

export type EmailBodyHandle={insert:(text:string)=>void};
export function EmailBodyEditor({value,onChange,visual,onEnableFormatting,ref}:{
  value:string;onChange:(value:string)=>void;visual:boolean;onEnableFormatting:()=>void;ref?:Ref<EmailBodyHandle>;
}){
  const input=useRef<HTMLTextAreaElement>(null);
  function apply(mark:'bold'|'italic'|'list'|'insert',insert=''){
    const element=input.current;
    const next=formatEmailText(value,element?.selectionStart??value.length,element?.selectionEnd??value.length,mark,insert);
    if(next.value.length>8000)return;
    if(mark!=='insert')onEnableFormatting();
    onChange(next.value);
    requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(next.cursor,next.cursor);});
  }
  useImperativeHandle(ref,()=>({insert:text=>apply('insert',text)}));
  return <div className="grant-field">
    <div className="grant-actions" role="group" aria-label="Safe event text formatting">
      {(['bold','italic','list'] as const).map(mark=><Button key={mark} variant="secondary" disabled={!visual}
        onClick={()=>apply(mark)}>{mark==='bold'?'Bold':mark==='italic'?'Italic':'Bullet list'}</Button>)}
    </div>
    <label>Event body<textarea ref={input} value={value} required maxLength={8000} rows={6}
      onChange={e=>onChange(e.target.value)}/></label>
    <small>Safe emphasis and lists appear in the preview. Raw HTML and arbitrary links are not interpreted.</small>
  </div>;
}
