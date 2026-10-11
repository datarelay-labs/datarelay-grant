import type {NotificationDelivery,NotificationEvent} from './types';

export type DeliverySearchFilters={
  state:'ALL'|'PENDING'|'SENDING'|'FAILED'|'DELIVERED'|'SUPERSEDED';
  event:'ALL'|NotificationEvent;
  requestId:string;
};
export type ScopedDeliveryPage={
  deliveries:NotificationDelivery[];total:number;offset:number;limit:number;
  has_more:boolean;
};
type Token={key:string;generation:number};
/** Read-only selected-source GET sequencing. Never confers resend authority. */
export function createDeliveryQueryReadScope(){
  let key='',generation=0;
  return {
    select(next:string):void{key=next;generation++;},
    begin(target:string):Token|null{
      if(!target||key!==target)return null;
      return {key:target,generation:++generation};
    },
    isSelected(target:string):boolean{return key===target;},
    isCurrent(token:Token):boolean{
      return token.key===key&&token.generation===generation;
    },
  };
}
export function currentDeliveryPageProjection(
  stored:{key:string;value:ScopedDeliveryPage}|null,key:string,
):ScopedDeliveryPage|null{
  return key&&stored?.key===key?stored.value:null;
}
export function deliveryDraftHasChanges(
  draft:DeliverySearchFilters,applied:DeliverySearchFilters,
):boolean{
  return draft.state!==applied.state||draft.event!==applied.event
    ||draft.requestId!==applied.requestId;
}
export function canReviewCurrentDelivery(
  stored:{key:string;value:ScopedDeliveryPage}|null,
  key:string,unapplied:boolean,readBusy:boolean,mutationBusy:boolean,
):boolean{
  return Boolean(currentDeliveryPageProjection(stored,key))
    &&!unapplied&&!readBusy&&!mutationBusy;
}
function verifyDeliveryPage(page:ScopedDeliveryPage,offset:number){
  if(!page||!Number.isSafeInteger(page.total)||page.total<0
    ||!Number.isSafeInteger(page.offset)||page.offset!==offset
    ||page.limit!==50||!Array.isArray(page.deliveries)
    ||page.deliveries.length>50
    ||(page.deliveries.length>0&&page.total<offset+page.deliveries.length)
    ||typeof page.has_more!=='boolean'
    ||page.has_more!==(offset+page.deliveries.length<page.total)
    ||page.deliveries.some(row=>!row||typeof row.id!=='string'||!row.id.trim()
      ||typeof row.request_id!=='string'||!row.request_id.trim()
      ||typeof row.event_type!=='string'||!row.event_type.trim()
      ||typeof row.state!=='string'||!row.state.trim()
      ||!Number.isSafeInteger(row.attempts)||row.attempts<0
      ||!Number.isFinite(row.created_at)
      ||typeof row.transport_accepted!=='boolean'
      ||typeof row.receipt_confirmed!=='boolean')){
    throw Error('DELIVERY_PAGE_SCOPE_INVALID');
  }
}
/** If a newer saved GET or filter/page selection supersedes this read,
 * drop both stale success and stale errors. Role and resend are still
 * exclusively enforced by the existing server/attempt-guard paths.
 */
export async function readCurrentDeliveryWorklist<T extends ScopedDeliveryPage>(
  scope:ReturnType<typeof createDeliveryQueryReadScope>,
  key:string,offset:number,
  read:()=>Promise<T>,present:(value:T)=>void,
):Promise<boolean>{
  const token=scope.begin(key);
  if(!token)return false;
  try{
    const result=await read();
    if(!scope.isCurrent(token))return false;
    verifyDeliveryPage(result,offset);
    present(result);
    return true;
  }catch(error){
    if(!scope.isCurrent(token))return false;
    throw error;
  }
}
export function DeliveryAppliedSearchSummary({
  applied,draft,offset,page,
}:{
  applied:DeliverySearchFilters;draft:DeliverySearchFilters;
  offset:number;page:ScopedDeliveryPage|null;
}){
  const changed=deliveryDraftHasChanges(draft,applied);
  return <section className="grant-stack" aria-label="Applied delivery health search">
    <p><strong>Applied delivery filters</strong>
      {' · '}{applied.state==='ALL'?'All states':applied.state}
      {' · '}{applied.event==='ALL'?'All notification events':applied.event}
      {' · Request ID: '}{applied.requestId.trim()||'Any recorded request'}
      {' · Page '}{Math.floor(offset/50)+1}</p>
    {changed&&<p role="status"><strong>Filter edits not yet applied.</strong>
      {' '}Apply filters before reviewing any delivery resend.
      Previously displayed rows belong only to the applied search.</p>}
    <p>{page?String(page.deliveries.length)+' of '+page.total+
      ' email transport event(s) in saved results'
      :'Waiting for current administrator-scoped saved delivery results'}</p>
    <p>Transport acceptance is not independently confirmed mailbox receipt.
      A resend never approves or executes an external action.</p>
  </section>;
}
