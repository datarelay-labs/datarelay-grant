/** Source edits, export refreshes and newer previews invalidate older
 * responses. This governs display only, not administrator authority.
 */
type ReadToken={generation:number};
export function createConfigurationPreviewReadScope(){
  let generation=0;
  return {
    invalidate():void{generation++;},
    begin():ReadToken{return {generation:++generation};},
    isCurrent(token:ReadToken):boolean{return token.generation===generation;},
  };
}
export function acceptReadOnlyConfigurationPreview<T>(value:T):T{
  const data=value as Record<string,unknown>|null;
  const readiness=data?.readiness as Record<string,unknown>|undefined;
  const summary=data?.summary as Record<string,unknown>|undefined;
  const requirements=data?.requirements as unknown[]|undefined;
  const conflicts=data?.conflicts as unknown[]|undefined;
  const warnings=data?.warnings as unknown[]|undefined;
  if(!data||typeof data!=='object'
    ||data.schema_version!==1||data.preview_only!==true||data.can_apply!==false
    ||!readiness||readiness.manual_review_only!==true
    ||readiness.automatic_apply_available!==false
    ||!Number.isSafeInteger(readiness.required_actions)
    ||!Array.isArray(requirements)||readiness.required_actions!==requirements.length
    ||!Array.isArray(conflicts)||!Array.isArray(warnings)
    ||!warnings.every(entry=>typeof entry==='string')
    ||!summary||!['integrations','policies','templates'].every(key=>
      Number.isSafeInteger(summary[key])&&(summary[key] as number)>=0)
    ||!requirements.every(row=>row&&typeof row==='object'
      &&['kind','name','reason','operator_action'].every(key=>
        typeof (row as Record<string,unknown>)[key]==='string'))
    ||!conflicts.every(row=>row&&typeof row==='object'
      &&['kind','name','reason'].every(key=>
        typeof (row as Record<string,unknown>)[key]==='string'))){
    throw new Error('CONFIGURATION_PREVIEW_NOT_READ_ONLY');
  }
  return value;
}
/** POST /admin/configuration/preview is server-confirmed non-mutating,
 * and may be shown only if the source generation is still current.
 */
export async function readCurrentConfigurationPreview<T>(
  gate:ReturnType<typeof createConfigurationPreviewReadScope>,
  read:()=>Promise<T>,present:(value:T)=>void,
):Promise<boolean>{
  const token=gate.begin();
  try{
    const value=await read();
    if(!gate.isCurrent(token))return false;
    present(acceptReadOnlyConfigurationPreview(value));
    return true;
  }catch(error){
    if(!gate.isCurrent(token))return false;
    throw error;
  }
}
export async function readCurrentConfigurationExport<T>(
  gate:ReturnType<typeof createConfigurationPreviewReadScope>,
  read:()=>Promise<T>,present:(value:T)=>void,
):Promise<boolean>{
  const token=gate.begin();
  try{
    const value=await read();
    if(!gate.isCurrent(token))return false;
    present(value);
    return true;
  }catch(error){
    if(!gate.isCurrent(token))return false;
    throw error;
  }
}
