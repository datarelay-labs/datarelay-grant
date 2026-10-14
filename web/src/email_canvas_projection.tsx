import {createElement,useMemo,type CSSProperties,type ReactNode} from 'react';
import {editableEmailBlocks,type EmailBlock} from './email_canvas_model';

const tags=new Set(['table','tbody','thead','tfoot','tr','td','th','div','span','p','strong','b','em','i','ul','ol','li','br','h1','h2','h3','blockquote','a']);
const properties=new Set(['background','background-color','border','border-collapse','border-spacing','border-radius','color','display','font-family','font-size','font-style','font-weight','height','line-height','margin','margin-top','margin-bottom','margin-left','margin-right','max-width','min-width','padding','padding-top','padding-bottom','padding-left','padding-right','text-align','text-decoration','vertical-align','width','word-break','overflow-wrap']);
export function safeEmailCanvasStyle(name:string,value:string):string|null {
 if(!properties.has(name)||value.length>150||/url|expression|var\(|!important|[\\<>@;]/i.test(value))return null;
 if(!/^[\w\s#(),.%'"-]+$/.test(value))return null;
 if(name==='display'&&!['block','inline','inline-block','table','table-row','table-cell','table-row-group'].includes(value))return null;
 return value;
}
/** Inert template parsing only. Never mount raw HTML or copy active attributes. */
export function emailCanvasNodes(html:string,selected:EmailBlock):ReactNode {
 if(typeof document==='undefined')return null;
 if(html.length>131072)throw Error('Email canvas exceeds its bounded size.');
 const template=document.createElement('template');
 template.innerHTML=html;
 let count=0;
 function visit(node:Node,depth=0):ReactNode {
  if(++count>6000||depth>45)throw Error('Email canvas exceeds its bounded structure.');
  if(node.nodeType===Node.TEXT_NODE)return node.textContent;
  if(node.nodeType!==Node.ELEMENT_NODE)return null;
  const element=node as HTMLElement,tag=element.tagName.toLowerCase();
  if(!tags.has(tag))return null;
  const style:Record<string,string>={};
  for(const name of Array.from(element.style??[])){
   const value=safeEmailCanvasStyle(name,element.style.getPropertyValue(name));
   if(value!==null)style[name.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase())]=value;
  }
  const block=Array.from(element.classList).map(value=>value.replace(/^grant-mail-block-/,''))
   .find(value=>editableEmailBlocks.includes(value as EmailBlock)) as EmailBlock|undefined;
  const props:Record<string,unknown>={key:count,style:style as CSSProperties};
  if(block){props['data-email-block']=block;props['className']='grant-email-selectable'+(selected===block?' is-selected':'');}
  if(tag==='td'||tag==='th')for(const key of ['colspan','rowspan']){
   const number=Number(element.getAttribute(key));if(Number.isInteger(number)&&number>0&&number<=20)props[key==='colspan'?'colSpan':'rowSpan']=number;
  }
  if(tag==='table')props.role='presentation';
  // Links become text-shaped presentation elements; selection belongs to the host.
  return createElement(tag==='a'?'span':tag,props,...Array.from(element.childNodes).map(child=>visit(child,depth+1)));
 }
 return Array.from(template.content.childNodes).map(node=>visit(node));
}
export function EmailCanvasProjection({html,selected,onSelect}:{html:string;selected:EmailBlock;onSelect:(block:EmailBlock)=>void}){
 const output=useMemo(()=>{try{return {nodes:emailCanvasNodes(html,selected),error:false};}catch{return {nodes:null,error:true};}},[html,selected]);
 return <div className="grant-email-canvas-projection" aria-label="Selectable email canvas"
  onClick={event=>{const block=(event.target as HTMLElement).closest<HTMLElement>('[data-email-block]')?.dataset.emailBlock;
   if(editableEmailBlocks.includes(block as EmailBlock))onSelect(block as EmailBlock);}}>
  {output.error?<p role="alert">Canvas unavailable. Use the block outline and isolated layout preview.</p>:output.nodes}
 </div>;
}
