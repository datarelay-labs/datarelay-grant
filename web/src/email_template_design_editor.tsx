import {useRef,useImperativeHandle,type Ref} from 'react';
import {Button} from '@datarelay-labs/foundation';
import {formatEmailText} from './email_design';

export type EmailBodyHandle={insert:(text:string)=>void};
export function EmailBodyEditor({value,onChange,visual,onEnableFormatting,onFormattedChange,disabled=false,ref}:{
  value:string;onChange:(value:string)=>void;visual:boolean;onEnableFormatting:()=>void;onFormattedChange?:(value:string)=>void;disabled?:boolean;ref?:Ref<EmailBodyHandle>;
}){
  const input=useRef<HTMLTextAreaElement>(null);
  function apply(mark:'bold'|'italic'|'list'|'insert',insert=''){
    if(disabled)return;
    const element=input.current;
    const next=formatEmailText(value,element?.selectionStart??value.length,element?.selectionEnd??value.length,mark,insert);
    if(next.value.length>8000)return;
    if(mark!=='insert'&&onFormattedChange)onFormattedChange(next.value);
    else{if(mark!=='insert')onEnableFormatting();onChange(next.value);}
    requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(next.cursor,next.cursor);});
  }
  useImperativeHandle(ref,()=>({insert:text=>apply('insert',text)}));
  return <div className="grant-field">
    <div className="grant-actions" role="group" aria-label="Safe event text formatting">
      {(['bold','italic','list'] as const).map(mark=><Button key={mark} variant="secondary" disabled={!visual||disabled}
        onClick={()=>apply(mark)}>{mark==='bold'?'Bold':mark==='italic'?'Italic':'Bullet list'}</Button>)}
    </div>
    <label>Event body<textarea data-email-wording disabled={disabled} ref={input} value={value} required maxLength={8000} rows={6}
      onChange={e=>onChange(e.target.value)}/></label>
    <small>Safe emphasis and lists appear in the preview. Raw HTML and arbitrary links are not interpreted.</small>
  </div>;
}
