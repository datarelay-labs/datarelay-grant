import type { AuditFilterValues } from './audit_filters';

export type AuditScopedItem={
  id:string;at:number;action:string;actor:string;request_id:string|null;
  details:Record<string,string|number|boolean>;
};
export type AuditScopedPage={
  total:number;limit:number;offset:number;has_more:boolean;items:AuditScopedItem[];
};
type ReadToken={key:string;generation:number};

/** Search intent is held independently of useTask.busy. A newly selected
 * filter or page GET supersedes A immediately, even if A has not completed.
 * No role or identity is manufactured: only backend-authenticated GETs
 * produce records, and no mutation is performed by this scope.
 */
export function createAuditWorklistScope(){
  let selected='',generation=0;
  return {
    select(key:string):void{selected=key;generation++;},
    begin(key:string):ReadToken|null{
      if(!key||selected!==key)return null;
      return {key,generation:++generation};
    },
    isSelected(key:string):boolean{return selected===key;},
    isCurrent(token:ReadToken):boolean{
      return selected===token.key&&generation===token.generation;
    },
  };
}
export function currentAuditPageProjection(
  saved:{key:string;value:AuditScopedPage}|null,
  key:string,
):AuditScopedPage|null{
  return key&&saved?.key===key?saved.value:null;
}
export function auditDraftHasChanges(
  draft:AuditFilterValues,applied:AuditFilterValues,
):boolean{
  return (Object.keys(applied) as (keyof AuditFilterValues)[]).some(
    key=>draft[key]!==applied[key],
  );
}
export function canExportAuditPage(
  saved:{key:string;value:AuditScopedPage}|null,
  key:string,edited:boolean,busy:boolean,
):boolean{
  return Boolean(currentAuditPageProjection(saved,key))&&!edited&&!busy;
}
function validatePage(result:AuditScopedPage,offset:number):void{
  if(!result||!Number.isSafeInteger(result.total)||result.total<0
    ||!Number.isSafeInteger(result.limit)||result.limit!==50
    ||!Number.isSafeInteger(result.offset)||result.offset!==offset
    ||typeof result.has_more!=='boolean'
    ||!Array.isArray(result.items)||result.items.length>result.limit
    ||(result.items.length>0&&result.total<offset+result.items.length)
    ||result.has_more!==(offset+result.items.length<result.total)
    ||result.items.some(item=>!item||typeof item.id!=='string'||!item.id.trim()
      ||typeof item.action!=='string'||!item.action.trim()
      ||typeof item.actor!=='string'
      ||!Number.isFinite(item.at)
      ||(item.request_id!==null&&typeof item.request_id!=='string')
      ||!item.details||typeof item.details!=='object'
      ||Array.isArray(item.details))){
    throw Error('AUDIT_PAGE_SCOPE_INVALID');
  }
}
/** Stale errors are discarded just like stale HTTP responses. A
 * successful GET is still untrusted until it matches the exact page
 * requested, and backend authorization remains authoritative.
 */
export async function readCurrentAuditWorklist<T extends AuditScopedPage>(
  scope:ReturnType<typeof createAuditWorklistScope>,
  query:string,offset:number,
  read:()=>Promise<T>,present:(page:T)=>void,
):Promise<boolean>{
  const token=scope.begin(query);
  if(!token)return false;
  try{
    const result=await read();
    if(!scope.isCurrent(token))return false;
    validatePage(result,offset);
    present(result);
    return true;
  }catch(error){
    if(!scope.isCurrent(token))return false;
    throw error;
  }
}
export function AuditCurrentSearchSummary({
  applied,draft,offset,page,
}:{
  applied:AuditFilterValues;draft:AuditFilterValues;
  offset:number;page:AuditScopedPage|null;
}){
  const dirty=auditDraftHasChanges(draft,applied);
  const names:Record<keyof AuditFilterValues,string>={
    search:'Text',action:'Action',actor:'Actor',request_id:'Request ID',
    since:'From',until:'Through',
  };
  const appliedValues=(Object.keys(names) as (keyof AuditFilterValues)[])
    .filter(key=>Boolean(applied[key].trim()));
  return <section aria-label="Applied audit search" className="grant-stack">
    <p><strong>Applied search</strong>
      {' · '}{page
        ? page.items.length+' visible of '+page.total+' recorded event(s)'
        : 'Awaiting current role-scoped results'}
      {' · Page '}{Math.floor(offset/50)+1}</p>
    <p>{appliedValues.length?appliedValues.map(key=>
      names[key]+': '+applied[key]).join(' · ')
      :'All role-visible recorded events'}</p>
    {dirty&&<p role="status"><strong>Filter edits not yet applied.</strong>
      {' '}Use Search evidence to update the worklist before exporting.
      Previous results are not evidence for the edited filters.</p>}
    <p>Exports contain only the currently applied filters and a
      server-bounded page; no unreviewed search edits or unscoped
      historical activity are silently included.</p>
  </section>;
}
