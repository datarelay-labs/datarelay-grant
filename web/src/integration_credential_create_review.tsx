import {useState} from 'react';
import { Alert, Button } from '@datarelay-labs/foundation';
import type { Integration } from './types';

const allowedScopes = [
  'request:create','request:read','grant:consume','result:write',
] as const;
const scopePresets: Record<string, readonly string[]> = {
  producer:['request:create','request:read'],
  executor:['request:read','grant:consume','result:write'],
  read_only:['request:read'],
};
export type CredentialIssueReview = Readonly<{
  integrationId:string;
  integrationName:string;
  integrationFingerprint:string;
  scopes:string[];
  purpose:string;
  mixedProducerExecutor:boolean;
}>;
export type CredentialIssueReceipt = {id:string;token:string;scopes:string[]};

/** One exact enabled connection, known immutable scopes and explicit purpose.
 * This review is never an integration token and cannot authorize a POST.
 */
export function prepareCredentialIssueReview(
  integration:Integration|null,
  scopes:readonly string[],
  purpose:string,
):CredentialIssueReview {
  if(!integration?.id || !integration.name.trim() || !integration.enabled
    || !['datarelay','stellar'].includes(integration.kind)
    || !['producer','executor','read_only','custom'].includes(purpose)
    || scopes.length<1 || scopes.length>4
    || new Set(scopes).size!==scopes.length
    || scopes.some(s=>!allowedScopes.includes(s as typeof allowedScopes[number]))
    || (purpose!=='custom'
      && JSON.stringify(scopes)!==JSON.stringify(scopePresets[purpose]))) {
    throw new Error('CREDENTIAL_ISSUE_REVIEW_INVALID');
  }
  return {
    integrationId:integration.id,
    integrationName:integration.name,
    integrationFingerprint:JSON.stringify({
      id:integration.id,name:integration.name,kind:integration.kind,
      tenant:integration.tenant,enabled:integration.enabled,
      callback_origin:integration.callback_origin,
      decision_verification_minimum:integration.decision_verification_minimum??null,
    }),
    scopes:[...scopes],
    purpose,
    mixedProducerExecutor:scopes.includes('request:create')
      && (scopes.includes('grant:consume')||scopes.includes('result:write')),
  };
}
export function isCurrentCredentialIssueReview(
  reviewed:CredentialIssueReview|null,
  integration:Integration|null,
  scopes:readonly string[],purpose:string,
):boolean {
  if(!reviewed)return false;
  try {
    return JSON.stringify(reviewed)===JSON.stringify(
      prepareCredentialIssueReview(integration,scopes,purpose));
  }catch{return false;}
}

/** In-process synchronous gate. A credential POST can have succeeded even if
 * its response was lost. Never auto-repeat it after uncertain transport.
 * A successful explicit role-scoped refresh of the SAME integration is
 * necessary to allow another independently reviewed issuance.
 */
export function createCredentialIssueGuard(){
  let claimed=false,inFlight=false,postStarted=false,attemptedIntegration='';
  return {
    claim(integrationId:string):boolean {
      if(!integrationId||claimed||inFlight)return false;
      claimed=true;inFlight=true;postStarted=false;attemptedIntegration=integrationId;
      return true;
    },
    markPostStarted():void {
      if(!inFlight)throw new Error('CREDENTIAL_ISSUE_CLAIM_REQUIRED');
      postStarted=true;
    },
    settled():void {
      inFlight=false;
      if(!postStarted){claimed=false;attemptedIntegration='';}
    },
    blocked():boolean{return claimed||inFlight;},
    attemptedFor():string{return attemptedIntegration;},
    readSucceeded(integrationId:string):boolean {
      if(inFlight||!attemptedIntegration||attemptedIntegration!==integrationId)return false;
      claimed=false;postStarted=false;attemptedIntegration='';
      return true;
    },
  };
}

/** A raw token is NOT a verified external effect. Validate the exact source
 * scopes and opaque ID without logging, copying or storing any credentials.
 */
export function verifyCredentialIssueReceipt<T extends CredentialIssueReceipt>(
  intent:CredentialIssueReview,result:T,
):T {
  if(!result||typeof result.id!=='string'||!result.id.trim()
    ||typeof result.token!=='string'||!result.token.trim()
    ||!Array.isArray(result.scopes)
    ||JSON.stringify(result.scopes)!==JSON.stringify(intent.scopes)){
    throw new Error('CREDENTIAL_ISSUE_RECEIPT_MISMATCH');
  }
  return result;
}

/** Reviewer-confirmed operation: exact saved connection GET, at most one POST,
 * and exact returned receipt. The backend still enforces admin/current
 * principal, enabled integration and allowed scopes inside its transaction.
 */
export async function submitReviewedCredentialIssue<T extends CredentialIssueReceipt>(
  intent:CredentialIssueReview,
  guard:ReturnType<typeof createCredentialIssueGuard>,
  readCurrent:()=>Promise<Integration[]>,
  postOnce:(id:string,scopes:string[])=>Promise<T>,
  stillSelected:()=>boolean,
):Promise<T|null> {
  if(!guard.claim(intent.integrationId))return null;
  try {
    if(!stillSelected())throw new Error('CREDENTIAL_ISSUE_CHANGED_REVIEW_REQUIRED');
    const rows=await readCurrent();
    const current=rows.find(row=>row.id===intent.integrationId)??null;
    if(!stillSelected()||!isCurrentCredentialIssueReview(intent,current,
      intent.scopes,intent.purpose)){
      throw new Error('CREDENTIAL_ISSUE_CHANGED_REVIEW_REQUIRED');
    }
    guard.markPostStarted();
    return verifyCredentialIssueReceipt(intent,
      await postOnce(intent.integrationId,[...intent.scopes]));
  }finally{guard.settled();}
}

export function CredentialIssueConfirmation({
  reviewed,valid,busy,onBack,onConfirm,
}:{
  reviewed:CredentialIssueReview|null;valid:boolean;busy:boolean;
  onBack:()=>void;onConfirm:()=>void;
}){
  if(!reviewed)return null;
  return <Alert tone="warning" title="Confirm scoped credential creation">
    <p>Creating an integration credential grants precisely the reviewed
      machine API permissions. It does not make a human approval decision,
      and it never executes a protected action merely by being issued.</p>
    <dl className="grant-facts">
      <dt>Saved integration</dt><dd>{reviewed.integrationName}</dd>
      <dt>Integration ID</dt><dd><code>{reviewed.integrationId}</code></dd>
      <dt>Credential purpose</dt><dd>{reviewed.purpose}</dd>
      <dt>Exact selected scopes</dt><dd>{reviewed.scopes.join(', ')}</dd>
    </dl>
    {reviewed.mixedProducerExecutor&&
      <p role="alert"><strong>Mixed producer and executor privileges:</strong>
        {' '}Prefer separate scoped credentials for least privilege and
        explicit separation of request producers from approved executors.</p>}
    <p>The raw credential will be Shown once after a confirmed server receipt.
      Copy it securely. Do not put it in chat, logs or browser storage.
      The credential cannot be recovered later from the token list.</p>
    {!valid&&<p role="alert">Integration identity, enabled state, purpose
      or exact scopes changed. Review the current selection again.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onBack}>Back to edit</Button>
      <Button disabled={busy||!valid} onClick={onConfirm}>Confirm create credential</Button>
    </div>
  </Alert>;
}

/** This function has no side effect unless invoked by the user's explicit
 * Copy click. It never writes to logs, telemetry or persistent browser
 * storage. In particular, failure must never be reported as copied.
 */
export async function copyVisibleCredentialSecret(
  raw:string, write:(secret:string)=>Promise<void>,
):Promise<void>{
  if(!raw)throw new Error('CREDENTIAL_SECRET_UNAVAILABLE');
  await write(raw);
}

/** Raw secret is held only in short-lived component memory after an exact
 * server receipt; never sent to analytics, localStorage or errorText.
 * The operating-system clipboard can outlive this React component and is
 * controlled by the user, not by Grant after the copy.
 */
export function OneTimeCredentialSecret({
  raw,tokenId,onHide,
}:{raw:string;tokenId:string;onHide:()=>void}){
  const [copyFeedback,setCopyFeedback]=useState<{
    tokenId:string;status:'copied'|'unavailable';
  }|null>(null);
  async function copy(){
    try{
      // No automatic copy, and no fallback to legacy clipboard commands.
      // Clipboard permission and secure-context requirements are enforced by
      // the browser; Grant never stores a second copy of the token.
      if(typeof navigator==='undefined'||!navigator.clipboard?.writeText)
        throw new Error('CLIPBOARD_UNAVAILABLE');
      await copyVisibleCredentialSecret(raw,
        (secret)=>navigator.clipboard.writeText(secret));
      setCopyFeedback({tokenId,status:'copied'});
    }catch{
      // Avoid logging exceptions: some browser errors include sensitive
      // context, and no failed copy should display the secret as feedback.
      setCopyFeedback({tokenId,status:'unavailable'});
    }
  }
  if(!raw)return null;
  const feedback=copyFeedback?.tokenId===tokenId?copyFeedback.status:null;
  return <Alert tone="warning" title="Store this credential securely — Shown once">
    <p>Credential ID: <code>{tokenId}</code>. The raw secret cannot be
      recovered from credential history. Leaving Credential tools or
      hiding it clears this browser view.</p>
    <p className="grant-mono">{raw}</p>
    <p>Clipboard contents may remain after hiding. Copy only when needed,
      store in an approved secret manager, and clear the system clipboard
      through your device's approved process.</p>
    <div className="grant-actions">
      <Button variant="secondary" onClick={()=>{void copy();}}>
        Copy credential
      </Button>
      <Button variant="secondary" onClick={onHide}>Hide credential</Button>
    </div>
    {feedback&&<p role="status">{feedback==='copied'
      ? 'Credential copied by browser permission. Clipboard contents are not controlled by Grant.'
      : 'Clipboard copy was not available or not permitted. Select the visible credential manually if authorized.'}
    </p>}
  </Alert>;
}
