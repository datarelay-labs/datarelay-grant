import type {ApproverGroup} from './types';

export type GroupAccountProjection={
  id:string;displayName?:string;status?:string;
};
export type GroupCoverage={
  saved:number;enabled:number|null;unavailable:number|null;
  status:'current'|'attention'|'unverified'|'disabled';
  display:string;
};
/** Saved member IDs and current role-scoped account projections are evidence,
 * NOT the policy's actual approval quorum or decision authority. Existing
 * request snapshots and backend membership checks are authoritative.
 */
export function assessSavedGroupAccountCoverage(
  group:ApproverGroup,
  accounts:readonly GroupAccountProjection[]|null,
):GroupCoverage{
  const ids=group?.member_ids;
  const saved=Array.isArray(ids)?ids.length:0;
  const malformed=!Array.isArray(ids)||ids.length===0
    ||ids.some(id=>typeof id!=='string'||!id.trim());
  if(malformed)return {
    saved,enabled:null,unavailable:null,status:'attention',
    display:'Saved group member identities incomplete. Review saved group.',
  };
  if(new Set(ids).size!==ids.length)return{
    saved,enabled:null,unavailable:null,status:'attention',
    display:'Repeated saved member identity. Review group before using it in a policy.',
  };
  if(!group.enabled)return{
    saved,enabled:null,unavailable:null,status:'disabled',
    display:'Group disabled · '+saved+' saved member IDs. Not an active approver group.',
  };
  if(accounts===null||!Array.isArray(accounts)
    ||accounts.some(account=>!account||typeof account.id!=='string'
      ||!account.id.trim()||typeof account.status!=='string')
    ||new Set(accounts.map(account=>account.id)).size!==accounts.length){
    return {
      saved,enabled:null,unavailable:null,status:'unverified',
      display:'Account status not checked · '+saved+' saved member IDs.',
    };
  }
  const byId=new Map(accounts.map(account=>[account.id,account.status]));
  const enabled=ids.filter(id=>byId.get(id)==='enabled').length;
  const unavailable=saved-enabled;
  if(unavailable)return{
    saved,enabled,unavailable,status:'attention',
    display:enabled+' / '+saved+' currently enabled accounts · '
      +unavailable+' member account'+(unavailable===1?'':'s')
      +' unavailable or disabled. Review the saved group and member accounts.',
  };
  return{
    saved,enabled,unavailable,status:'current',
    display:enabled+' / '+saved+
      ' currently enabled accounts. This does not prove approval eligibility.',
  };
}
export function ApproverGroupAccountCoverage({
  group,accounts,
}:{
  group:ApproverGroup;accounts:readonly GroupAccountProjection[]|null;
}){
  const coverage=assessSavedGroupAccountCoverage(group,accounts);
  return <div aria-label="Saved approver group account coverage">
    <small>{coverage.display}</small>
    {coverage.status==='attention'&&
      <strong role="status"> Member account review required</strong>}
  </div>;
}
export function createApproverDirectoryReadScope(){
  let generation=0;
  return {
    begin():number{return ++generation;},
    current(token:number):boolean{return token===generation;},
    invalidate():void{generation++;},
  };
}
export type ApproverDirectoryResponse<T extends GroupAccountProjection> = {
  groups:ApproverGroup[];accounts:T[];
};
/** Latest-only list data, preserving role-scoped admin GET semantics.
 * Stale responses/errors cannot replace more recently requested list data.
 */
export async function readCurrentApproverDirectory<T extends GroupAccountProjection>(
  gate:ReturnType<typeof createApproverDirectoryReadScope>,
  read:()=>Promise<ApproverDirectoryResponse<T>>,
  present:(result:ApproverDirectoryResponse<T>)=>void,
):Promise<boolean>{
  const token=gate.begin();
  try{
    const value=await read();
    if(!gate.current(token))return false;
    if(!value||!Array.isArray(value.groups)||!Array.isArray(value.accounts)
      ||value.groups.some(row=>!row||typeof row.id!=='string'
        ||!row.id.trim()||typeof row.name!=='string'||!row.name.trim()
        ||!Array.isArray(row.member_ids)
        ||!([true,false,0,1] as unknown[]).includes(row.enabled)
        ||!Number.isFinite(row.updated_at))
      ||value.accounts.some(row=>!row||typeof row.id!=='string'||!row.id.trim()
        ||(row.status!==undefined&&typeof row.status!=='string'))){
      throw Error('APPROVER_DIRECTORY_INVALID');
    }
    // The authoritative legacy SQLite GET projects enabled as 0/1,
    // while POST/PUT receipts use true/false. Normalize exactly these
    // four source-defined representations, never truthiness of strings.
    // This only adapts the UI projection, never changes server authority.
    present({
      ...value,
      groups:value.groups.map(row=>({
        ...row,enabled:([true,1] as unknown[]).includes(row.enabled),
      })),
    });
    return true;
  }catch(error){
    if(!gate.current(token))return false;
    throw error;
  }
}
