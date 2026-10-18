/** Latest selected integration identity + monotonically increasing read.
 * Human UI selection is read-only and never represents approval, execution,
 * token authorization or a diagnostic POST.
 */
type ScopeToken={id:string;generation:number};
export function createIntegrationDiagnosticsReadScope(){
  let id='',generation=0;
  return {
    select(next:string):void {id=next;generation++;},
    begin(target:string):ScopeToken|null{
      if(!target||id!==target)return null;
      return {id:target,generation:++generation};
    },
    isSelected(target:string):boolean{return id===target;},
    isCurrent(token:ScopeToken):boolean{
      return id===token.id && generation===token.generation;
    },
  };
}
export function currentIntegrationDiagnostics<T extends {integration:{id:string}}>(
  saved:{key:string;value:T}|null,selected:string,visibleIntegrationIds:readonly string[],
):T|null{
  return saved?.key===selected && saved.value?.integration?.id===selected
    && visibleIntegrationIds.includes(selected) ? saved.value : null;
}

/** A and B can read concurrently: the newest exact selection/read wins.
 * Stale network errors are dropped just like stale success responses.
 */
export async function readSelectedIntegrationDiagnostics<
  T extends {integration:{id:string}},
>(
  scope:ReturnType<typeof createIntegrationDiagnosticsReadScope>,
  integrationId:string,read:()=>Promise<T>,present:(details:T)=>void,
):Promise<boolean>{
  const token=scope.begin(integrationId);
  if(!token)return false;
  try{
    const result=await read();
    if(!scope.isCurrent(token))return false;
    if(!result || result.integration?.id!==integrationId){
      throw new Error('DIAGNOSTICS_INTEGRATION_MISMATCH');
    }
    present(result);
    return true;
  }catch(error){
    if(!scope.isCurrent(token))return false;
    throw error;
  }
}
