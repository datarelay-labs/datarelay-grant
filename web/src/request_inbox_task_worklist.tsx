import type { RequestRow } from './types';

type ReadToken={key:string;generation:number};
export function createInboxReadScope(){
  let current='',generation=0;
  return {
    select(query:string):void{
      if(current!==query){current=query;generation++;}
    },
    begin(query:string):ReadToken|null{
      if(!query||query!==current)return null;
      return {key:query,generation:++generation};
    },
    isSelected(query:string):boolean{return current===query;},
    isCurrent(token:ReadToken):boolean{
      return current===token.key&&generation===token.generation;
    },
  };
}
export function currentInboxProjection(
  saved:{key:string;rows:RequestRow[]}|null,currentQuery:string,
):RequestRow[]{
  return currentQuery&&saved?.key===currentQuery?[...saved.rows]:[];
}
/** Each GET uses the server's exact role-scoped query. Older filter,
 * page and same-filter reads never overwrite the newer intended worklist.
 */
export async function readCurrentInbox(
  scope:ReturnType<typeof createInboxReadScope>,
  query:string,
  read:()=>Promise<RequestRow[]>,
  present:(rows:RequestRow[])=>void,
):Promise<boolean>{
  const ticket=scope.begin(query);
  if(!ticket)return false;
  try{
    const rows=await read();
    if(!scope.isCurrent(ticket))return false;
    if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=='string'
      ||!row.id.trim())){
      throw Error('INBOX_READ_INVALID');
    }
    present(rows);
    return true;
  }catch(error){
    if(!scope.isCurrent(ticket))return false;
    throw error;
  }
}
const waitingLabels:Record<string,string>={
  APPROVERS:'Waiting on approvers',
  REQUESTER_INFO:'Waiting on requester information',
  REQUESTER_REVISION:'Changes requested — new request required',
  EXECUTOR:'Approved — awaiting execution',
  EXECUTION_RESULT:'Awaiting execution result',
  CLOSED:'Decision closed',
};
export function InboxActionTarget({row}:{row:RequestRow}){
  const kind=row.action?.kind?.trim();
  const target=row.action?.target?.trim();
  if(!kind||!target)return <small>Requested action or target unavailable</small>;
  return <div aria-label="Exact requested operation and target">
    <small>Action: <code>{kind}</code></small>
    <small>Target: <code>{target}</code></small>
  </div>;
}
/** Missing/inconsistent server seat projection is UNKNOWN, not 0/1.
 * Purely read-only evidence; human authorization and overdue belong
 * to the backend and must never be inferred from this table.
 */
export function InboxApprovalProgress({row}:{row:RequestRow}){
  const progress=row.approval_progress;
  if(!progress||!Number.isSafeInteger(progress.approved_count)
    ||!Number.isSafeInteger(progress.required_count)
    ||!Number.isSafeInteger(progress.total_members)
    ||progress.required_count<1||progress.total_members<progress.required_count
    ||progress.approved_count<0||progress.approved_count>progress.total_members
    ||!Array.isArray(progress.waiting_approvers)
    ||typeof progress.waiting_on!=='string'
    ||!waitingLabels[progress.waiting_on]){
    return <span>Approval progress unavailable</span>;
  }
  return <div>
    <strong>{progress.approved_count} / {progress.required_count} approved</strong>
    <small>{waitingLabels[progress.waiting_on]}</small>
    {progress.waiting_approvers.length>0&&<small>
      {progress.group_name?progress.group_name+' · ':''}
      {progress.waiting_approvers.map(person=>person.username).join(', ')}
    </small>}
  </div>;
}
