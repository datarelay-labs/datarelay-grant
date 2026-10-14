/** Grant-owned approval-mail design contract. No authority/URL fields. */
export type EmailStyles = {
  font_size:number;button_font_size:number;button_padding_x:number;button_padding_y:number;
  button_gap:number;button_radius:number;approve_color:string;hold_color:string;deny_color:string;
};
export type EmailDesign = {
  schema_version:1;renderer_contract_version:1;shared_layout_revision:1|2|3;
  locale:'en'|'ko';preset:'standard'|'compact'|'high_visibility';button_size:'S'|'M'|'L';
  event_headings?:Partial<Record<import("./types").NotificationEvent,string>>;
  heading:string;footer:string;logo_asset_id:null;blocks:string[];styles:EmailStyles;
  rich_text?:boolean;paragraph_alignment?:'left'|'center'|'right';
  button_suffixes?:{approve:string;hold:string;deny:string;details:string};
};
export const emailBlocks=['brand','heading','message','request_context','actions','verification','footer'];
export function createEmailDesign(preset:EmailDesign['preset']='standard'):EmailDesign {
  const design:EmailDesign={schema_version:1,renderer_contract_version:1,shared_layout_revision:3,
    locale:'en',preset,button_size:'M',rich_text:true,paragraph_alignment:'left',button_suffixes:{approve:'',hold:'',deny:'',details:''},heading:'{{request_title}}',footer:'',logo_asset_id:null,
    blocks:[...emailBlocks],styles:{font_size:16,button_font_size:16,button_padding_x:24,
      button_padding_y:12,button_gap:8,button_radius:6,approve_color:'#166534',hold_color:'#854d0e',deny_color:'#991b1b'}};
  if(preset==='compact')return {...withButtonSize(design,'S'),preset};
  if(preset==='high_visibility')return {...withButtonSize(design,'L'),preset,
    styles:{...withButtonSize(design,'L').styles,font_size:18,button_gap:12}};
  return design;
}
export function withButtonSize(design:EmailDesign,size:EmailDesign['button_size']):EmailDesign {
  const values=({S:[14,16,10],M:[16,24,12],L:[20,32,16]} as const)[size];
  return {...structuredClone(design),button_size:size,styles:{...design.styles,
    button_font_size:values[0],button_padding_x:values[1],button_padding_y:values[2]}};
}
export function designSignature(value:EmailDesign|null|undefined):string|null {
  if(value==null)return null;
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):
    v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
  return JSON.stringify(stable({...value,rich_text:value.rich_text??false,paragraph_alignment:value.paragraph_alignment??'left',button_suffixes:{approve:'',hold:'',deny:'',details:'',...value.button_suffixes}}));
}

export function formatEmailText(value:string,start:number,end:number,mark:'bold'|'italic'|'list'|'insert',insert=''){
  const before=value.slice(0,start),after=value.slice(end);
  const selected=value.slice(start,end)||'Important text';
  const addition=mark==='bold'?'**'+selected+'**':mark==='italic'?'_'+selected+'_':
    mark==='list'?'\n'+selected.split('\n').map(line=>'- '+line).join('\n')+'\n':insert;
  return {value:before+addition+after,cursor:before.length+addition.length};
}
