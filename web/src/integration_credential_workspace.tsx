import { Alert, Button } from '@datarelay-labs/foundation';
import { when } from './common';

export type CredentialMetadata = {
  id: string;
  scopes: string[];
  enabled: boolean;
  created_at: number;
};
type ReadToken = { integrationId: string; generation: number };

export function createCredentialReadGate() {
  let currentIntegration = '';
  let generation = 0;
  return {
    select(id:string):void {
      if (currentIntegration !== id) { currentIntegration=id; generation++; }
    },
    begin(id:string):ReadToken|null {
      if (!id || currentIntegration!==id) return null;
      return {integrationId:id,generation:++generation};
    },
    isSelected(id:string):boolean{return currentIntegration===id;},
    isCurrent(token:ReadToken):boolean {
      return currentIntegration===token.integrationId && token.generation===generation;
    },
    invalidate(id:string):boolean {
      if (currentIntegration!==id) return false;
      generation++;
      return true;
    },
  };
}

export function currentCredentialProjection(
  saved:{key:string;rows:CredentialMetadata[]}|null,selectedId:string,
):CredentialMetadata[]{
  return saved?.key===selectedId?[...saved.rows]:[];
}

/** Caller-supplied id comes from the authenticated, role-scoped integration
 * selector, and superseded results/errors never populate another selection.
 */
export async function readScopedCredentials(
  gate:ReturnType<typeof createCredentialReadGate>,
  integrationId:string,
  read:()=>Promise<CredentialMetadata[]>,
  present:(rows:CredentialMetadata[])=>void,
):Promise<boolean>{
  const token=gate.begin(integrationId);
  if (!token) return false;
  try {
    const rows=await read();
    if (!gate.isCurrent(token)) return false;
    if (!Array.isArray(rows)) throw new Error('CREDENTIAL_LIST_INVALID');
    present(rows);
    return true;
  }catch(error){
    if (!gate.isCurrent(token)) return false;
    throw error;
  }
}

function partition(rows:readonly CredentialMetadata[]){
  const active=rows.filter(row=>row.enabled)
    .sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id));
  const history=rows.filter(row=>!row.enabled)
    .sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id));
  return {active,history};
}

export function CredentialWorklist({
  rows,busy,onReviewRevoke,onSelect,selectedId='',
}:{
  rows:readonly CredentialMetadata[];
  busy:boolean;
  onReviewRevoke:(row:CredentialMetadata)=>void;
  onSelect?:(row:CredentialMetadata)=>void;
  selectedId?:string;
}){
  const {active,history}=partition(rows);
  const items=(set:readonly CredentialMetadata[],action:boolean)=>(
    <div className="grant-table-scroll">
      <table className="grant-table">
        <thead><tr><th>Issued ID</th><th>Scopes</th>
          <th>Issued</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {set.map(row=><tr key={row.id}>
            <td><code>{row.id}</code></td>
            <td>{row.scopes.join(', ')}</td>
            <td>{when(row.created_at)}</td>
            <td>{row.enabled?'Enabled':'Revoked'}</td>
            <td>
              {onSelect&&<Button variant="secondary" disabled={busy}
                onClick={()=>onSelect(row)}>
                {selectedId===row.id?'Selected':'Inspect metadata'}
              </Button>}
              {' '}{action
                ? <Button variant="secondary" disabled={busy}
                    onClick={()=>onReviewRevoke(row)}>Review revoke</Button>
                : !onSelect?'—':null}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
  return <div className="grant-stack">
    <h4>Active credentials</h4>
    <p>{active.length} active credential{active.length===1?'':'s'}.
      Only issued IDs and scope metadata are displayed; raw secrets
      cannot be recovered here.</p>
    {active.length?items(active,true):<p>No active credentials.</p>}
    <details>
      <summary>Revoked credential history ({history.length})</summary>
      {history.length?items(history,false)
        :<p>No revoked credentials for this selected integration.</p>}
    </details>
  </div>;
}

export type CredentialRevokeReview = Readonly<{
  integrationId:string;
  tokenId:string;
  scopes:string[];
  createdAt:number;
}>;

export function createCredentialRevokeReview(
  integrationId:string, row:CredentialMetadata,
):CredentialRevokeReview{
  if (!integrationId || !row?.id || !row.enabled
      || !Number.isFinite(row.created_at)
      || !Array.isArray(row.scopes) || !row.scopes.every(scope=>typeof scope==='string')){
    throw new Error('CREDENTIAL_REVOKE_UNAVAILABLE');
  }
  return {
    integrationId,tokenId:row.id,
    scopes:[...row.scopes],createdAt:row.created_at,
  };
}
export function isCurrentCredentialRevokeReview(
  intent:CredentialRevokeReview|null,
  integrationId:string,row:CredentialMetadata|undefined,
):boolean{
  if(!intent||!row) return false;
  try {return JSON.stringify(intent)
    ===JSON.stringify(createCredentialRevokeReview(integrationId,row));}
  catch{return false}
}

export function createCredentialRevokeGuard(){
  let claimed=false,inFlight=false,postStarted=false,attemptedIntegration='';
  return {
    claim(intent:CredentialRevokeReview):boolean{
      if(claimed||inFlight) return false;
      claimed=true;inFlight=true;postStarted=false;
      attemptedIntegration=intent.integrationId;
      return true;
    },
    markPostStarted():void{
      if(!inFlight) throw new Error('CREDENTIAL_REVOKE_CLAIM_REQUIRED');
      postStarted=true;
    },
    settled():void{
      inFlight=false;
      if(!postStarted){claimed=false;attemptedIntegration='';}
    },
    blocked():boolean{return claimed||inFlight;},
    attemptedFor():string{return attemptedIntegration;},
    readSucceeded(integrationId:string):boolean{
      // Reading another integration does NOT reconcile the original POST.
      if(inFlight||attemptedIntegration!==integrationId) return false;
      claimed=false;postStarted=false;attemptedIntegration='';
      return true;
    },
  };
}
export type CredentialRevokeReceipt={id:string;enabled:boolean};
export function verifyCredentialRevokeReceipt<T extends CredentialRevokeReceipt>(
  intent:CredentialRevokeReview,result:T,
):T{
  if(!result || result.id!==intent.tokenId || result.enabled!==false){
    throw new Error('CREDENTIAL_REVOKE_RECEIPT_MISMATCH');
  }
  return result;
}

/** Guard pre-POST fresh read; backend still owns revocation permission and
 * exact token state. No automatic retry after a potentially committed POST.
 */
export async function submitReviewedCredentialRevocation<T extends CredentialRevokeReceipt>(
  intent:CredentialRevokeReview,
  guard:ReturnType<typeof createCredentialRevokeGuard>,
  readCurrent:()=>Promise<CredentialMetadata[]>,
  postOnce:(tokenId:string)=>Promise<T>,
  stillSelected:()=>boolean,
):Promise<T|null>{
  if(!guard.claim(intent)) return null;
  try{
    if(!stillSelected()) throw new Error('CREDENTIAL_CHANGED_REVIEW_REQUIRED');
    const rows=await readCurrent();
    if(!stillSelected() || !isCurrentCredentialRevokeReview(intent,
      intent.integrationId,rows.find(row=>row.id===intent.tokenId))){
      throw new Error('CREDENTIAL_CHANGED_REVIEW_REQUIRED');
    }
    guard.markPostStarted();
    return verifyCredentialRevokeReceipt(intent,await postOnce(intent.tokenId));
  }finally{guard.settled()}
}

export function CredentialRevokeConfirmation({
  reviewed,valid,busy,onBack,onConfirm,
}:{
  reviewed:CredentialRevokeReview|null;
  valid:boolean;busy:boolean;onBack:()=>void;onConfirm:()=>void;
}){
  if(!reviewed) return null;
  return <Alert tone="warning" title="Confirm revoke credential">
    <p>Revoking this credential blocks subsequent integration API calls.
      It cannot undo an external action already committed, an existing
      Grant human decision, or previously delivered callback.</p>
    <dl className="grant-facts">
      <dt>Selected integration ID</dt><dd><code>{reviewed.integrationId}</code></dd>
      <dt>Credential ID</dt><dd><code>{reviewed.tokenId}</code></dd>
      <dt>Current scopes</dt><dd>{reviewed.scopes.join(', ')}</dd>
      <dt>Created</dt><dd>{when(reviewed.createdAt)}</dd>
    </dl>
    {!valid && <p role="alert">The selected integration or credential
      changed. Refresh and review again.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onBack}>Keep credential</Button>
      <Button disabled={busy||!valid} onClick={onConfirm}>Confirm revoke</Button>
    </div>
  </Alert>;
}
