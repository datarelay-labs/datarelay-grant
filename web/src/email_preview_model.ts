import type {NotificationEvent} from './types';
import type {TemplateDraft} from './notification_preview';
import type {EmailBlock} from './email_canvas_model';
export type EmailSampleKind='normal'|'long_en'|'long_ko'|'missing_optional';
export function syntheticEmailSample(kind:EmailSampleKind,event:NotificationEvent){
 const states:Partial<Record<NotificationEvent,string>>={approved:'APPROVED',denied:'DENIED',expired:'EXPIRED',cancelled:'CANCELLED',execution_succeeded:'APPROVED',execution_failed:'APPROVED',execution_unknown:'APPROVED'};
 return {request_title:kind==='long_en'?'Scheduled infrastructure change — '.repeat(7):kind==='long_ko'?'예정된 보안 정책 변경 승인 요청 — '.repeat(9):'Update collector-01',
  request_url:'https://example.invalid/requests/sample',external_id:'SAMPLE-001',action_kind:'service.change',
  target:kind==='long_en'?'sample-long-resource-name-'.repeat(10):kind==='long_ko'?'샘플-대상-서버-'.repeat(20):'collector-01',
  reason:kind==='missing_optional'?'':'Synthetic preview only',deadline:'2030-01-01T00:00:00Z',
  decision_state:states[event]??'AWAITING',execution_state:event==='execution_succeeded'?'REPORTED_SUCCEEDED':event==='execution_failed'?'REPORTED_FAILED':event==='execution_unknown'?'UNKNOWN':'NOT_STARTED'};
}
export type EmailPreviewProblem={block:EmailBlock;message:string};
export function emailPreviewProblems(draft:TemplateDraft,event:NotificationEvent):EmailPreviewProblem[]{
 const problems:EmailPreviewProblem[]=[];
 const text=draft.templates[event],design=draft.design;
 if(!text.subject.trim()||text.subject.length>250)problems.push({block:'subject',message:'Enter a subject of 1 to 250 characters.'});
 if(!text.body.trim()||text.body.length>8000)problems.push({block:'message',message:'Enter message wording of 1 to 8,000 characters.'});
 if(design){
  const heading=design.event_headings?.[event]??design.heading;
  if(!heading.trim()||heading.length>250)problems.push({block:'heading',message:'Enter a heading of 1 to 250 characters.'});
  for(const [key,label] of [['approve_color','Approve'],['hold_color','Hold'],['deny_color','Deny']] as const){
   const color=design.styles[key];let contrast=0;
   if(/^#[0-9a-f]{6}$/i.test(color)){
    const linear=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
    contrast=1.05/(linear[0]!*.2126+linear[1]!*.7152+linear[2]!*.0722+.05);
   }
   if(contrast<4.5)problems.push({block:'actions',message:label+' button text is difficult to read. Choose a darker background.'});
  }
 }
 return problems;
}
