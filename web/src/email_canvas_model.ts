import {createEmailDesign,type EmailDesign} from './email_design';
export const optionalEmailBlocks=['content_1','content_2','content_3'] as const;
export type EmailContentBlock=typeof optionalEmailBlocks[number];
export const editableEmailBlocks=['subject','brand','heading','message',...optionalEmailBlocks,'request_context','actions','verification','footer'] as const;
export type EmailBlock=typeof editableEmailBlocks[number];
export const blockLabels:Record<EmailBlock,string>={subject:'Subject',brand:'Brand',heading:'Heading',message:'Message',content_1:'Content 1',content_2:'Content 2',content_3:'Content 3',request_context:'Request details',actions:'Approval buttons',verification:'Verification',footer:'Footer'};
export const blockScope:Record<EmailBlock,string>={subject:'This event',brand:'All future notification snapshots',heading:'This event',message:'This event',content_1:'All events in this template set',content_2:'All events in this template set',content_3:'All events in this template set',request_context:'Controlled by approval policy',actions:'All events in this template set',verification:'Controlled by approval policy',footer:'All events in this template set'};
export function addEmailContent(value:EmailDesign):EmailDesign {
 const used=new Set(Object.keys(value.optional_content??{}));const id=optionalEmailBlocks.find(item=>!used.has(item));
 if(!id)throw Error('Only three optional content blocks are supported.');
 const blocks=[...value.blocks],context=blocks.indexOf('request_context');if(context<0)throw Error('Protected request context is required.');
 blocks.splice(context,0,id);
 return {...structuredClone(value),shared_layout_revision:7,blocks,optional_content:{...value.optional_content,[id]:'Additional context.'}};
}
export function moveEmailContent(value:EmailDesign,id:EmailBlock,direction:-1|1):EmailDesign {
 if(!optionalEmailBlocks.includes(id as EmailContentBlock))throw Error('Protected blocks cannot be moved.');
 const optionals=value.blocks.filter(block=>optionalEmailBlocks.includes(block as EmailContentBlock));const current=optionals.indexOf(id);const target=current+direction;
 if(current<0)throw Error('Optional content block is not present.');if(target<0||target>=optionals.length)return structuredClone(value);
 [optionals[current],optionals[target]]=[optionals[target]!,optionals[current]!];
 return {...structuredClone(value),blocks:['brand','heading','message',...optionals,'request_context','actions','verification','footer']};
}
export function removeEmailContent(value:EmailDesign,id:EmailBlock):EmailDesign {
 if(!optionalEmailBlocks.includes(id as EmailContentBlock))throw Error('Protected blocks cannot be removed.');
 if(!value.blocks.includes(id))throw Error('Optional content block is not present.');
 const content={...value.optional_content};delete content[id as EmailContentBlock];
 return {...structuredClone(value),blocks:value.blocks.filter(block=>block!==id),optional_content:content};
}
export function applyEmailPreset(value:EmailDesign,preset:EmailDesign['preset']):EmailDesign {
 const defaults=createEmailDesign(preset);
 return {...structuredClone(value),preset,button_size:defaults.button_size,styles:defaults.styles,paragraph_alignment:defaults.paragraph_alignment};
}
export function resetEmailAppearance(value:EmailDesign,block:EmailBlock|'all'):EmailDesign {
 const defaults=createEmailDesign();
 if(block==='all')return applyEmailPreset(value,'standard');
 const next=structuredClone(value);
 if(block==='actions'){next.styles={...defaults.styles,font_size:value.styles.font_size};next.button_size=defaults.button_size;}
 if(block==='message'){next.styles.font_size=defaults.styles.font_size;next.paragraph_alignment='left';}
 return next;
}
export function insertEmailVariable(value:string,start:number,end:number,key:string,allowed:string[],max:number){
 if(!allowed.includes(key)||!/^\w+$/.test(key))throw Error('Choose an available variable.');
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>value.length)throw Error('Select a valid insertion point.');
 const token='{{'+key+'}}',next=value.slice(0,start)+token+value.slice(end);
 if(next.length>max)throw Error('This field is too long for the selected variable.');
 return {value:next,cursor:start+token.length};
}
export function createEmailHistory<T>(){
 let previous:T[]=[],future:T[]=[];
 return {push:(value:T)=>{previous=[...previous.slice(-19),structuredClone(value)];future=[];},
  undo:(current:T):T|null=>{const value=previous.pop();if(value===undefined)return null;future.push(structuredClone(current));return structuredClone(value);},
  redo:(current:T):T|null=>{const value=future.pop();if(value===undefined)return null;previous.push(structuredClone(current));return structuredClone(value);},
  clear:()=>{previous=[];future=[];},canUndo:()=>previous.length>0,canRedo:()=>future.length>0};
}
const variables:Record<string,{label:string;example:string;description:string}>={
 request_title:{label:'Request title',example:'Update collector-01',description:'The title of the requested change.'},
 request_url:{label:'Request URL',example:'https://example.invalid/requests/sample',description:'The protected request details location.'},
 external_id:{label:'External reference',example:'CHANGE-001',description:'Reference assigned by the requesting system.'},
 action_kind:{label:'Action',example:'service.change',description:'The operation being requested.'},
 target:{label:'Target',example:'collector-01',description:'The affected resource.'},
 reason:{label:'Reason',example:'Scheduled maintenance',description:'The explanation supplied with the request.'},
 deadline:{label:'Deadline',example:'2030-01-01 00:00 UTC',description:'The request deadline.'},
 decision_state:{label:'Decision state',example:'AWAITING',description:'The current human decision state.'},
 execution_state:{label:'Execution state',example:'NOT_STARTED',description:'The separately reported execution state.'},
};
export function emailVariableOptions(allowed:string[],query=''){
 const search=query.trim().toLowerCase();
 return allowed.filter(key=>variables[key]).map(key=>({key,...variables[key]}))
  .filter(item=>(item.label+' '+item.key+' '+item.description).toLowerCase().includes(search));
}
