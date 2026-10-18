import { Alert, Button } from '@datarelay-labs/foundation';
import type { Integration } from './types';

const allowed=['EMAIL_PIN','EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA'] as const;
type Minimum=typeof allowed[number];
export type VerificationPayload={
  decision_verification_minimum:Minimum;reason:string;
};
export type IntegrationVerificationReview=Readonly<{
  integrationId:string;integrationName:string;fingerprint:string;
  previousMinimum:Minimum;nextMinimum:Minimum;
  reason:string;reduction:boolean;
}>;
export type IntegrationVerificationReceipt={
  integration_id:string;
  decision_verification_minimum:Minimum;
  existing_snapshots_unchanged:boolean;
};
export function prepareIntegrationVerificationReview(
  integration:Integration|undefined,payload:VerificationPayload,
):IntegrationVerificationReview{
  const old=integration?.decision_verification_minimum;
  const next=payload?.decision_verification_minimum;
  if(!integration?.id||!integration.name?.trim()||!integration.enabled
     ||!allowed.includes(old as Minimum)||!allowed.includes(next)
     ||old===next||!payload.reason?.trim()
     ||payload.reason.trim().length<5||payload.reason.trim().length>1000){
    throw Error('VERIFICATION_REVIEW_INVALID');
  }
  return {
    integrationId:integration.id,integrationName:integration.name,
    fingerprint:JSON.stringify({
      id:integration.id,name:integration.name,kind:integration.kind,
      tenant:integration.tenant,enabled:integration.enabled,
      callback_origin:integration.callback_origin,
      decision_verification_minimum:old,
    }),
    previousMinimum:old as Minimum,nextMinimum:next,
    reason:payload.reason.trim(),
    reduction:allowed.indexOf(next)<allowed.indexOf(old as Minimum),
  };
}
export function isCurrentIntegrationVerificationReview(
  review:IntegrationVerificationReview|null,
  integration:Integration|undefined,payload:VerificationPayload,
):boolean{
  if(!review)return false;
  try{
    return JSON.stringify(review)===JSON.stringify(
      prepareIntegrationVerificationReview(integration,payload));
  }catch{return false;}
}
/** Synchronous in-process single attempt; an uncertain PUT may already
 * be committed. Only explicit SAME integration saved state reconciliation
 * may release the gate; no background retries or invented server CAS.
 */
export function createIntegrationVerificationGuard(){
  let claimed=false,inFlight=false,postStarted=false,attempted='';
  return {
    claim(id:string):boolean{
      if(!id||claimed||inFlight)return false;
      claimed=true;inFlight=true;postStarted=false;attempted=id;
      return true;
    },
    markPostStarted():void{
      if(!inFlight)throw Error('VERIFICATION_CLAIM_REQUIRED');
      postStarted=true;
    },
    settled():void{
      inFlight=false;
      if(!postStarted){claimed=false;attempted='';}
    },
    blocked():boolean{return claimed||inFlight;},
    attemptedFor():string{return attempted;},
    readSucceeded(id:string):boolean{
      if(inFlight||!attempted||attempted!==id)return false;
      claimed=false;postStarted=false;attempted='';return true;
    },
  };
}
export function verifyIntegrationVerificationReceipt<T extends IntegrationVerificationReceipt>(
  reviewed:IntegrationVerificationReview,result:T,
):T{
  if(!result||result.integration_id!==reviewed.integrationId
    ||result.decision_verification_minimum!==reviewed.nextMinimum
    ||result.existing_snapshots_unchanged!==true){
    throw Error('VERIFICATION_RECEIPT_MISMATCH');
  }
  return result;
}
/** A fresh current-role /integrations GET precedes exactly one PUT.
 * The backend still owns authorization and membership; read-before-write
 * is NOT atomic compare-and-swap against another administrator.
 */
export async function submitReviewedIntegrationVerification<
  T extends IntegrationVerificationReceipt,
>(
  intent:IntegrationVerificationReview,
  gate:ReturnType<typeof createIntegrationVerificationGuard>,
  readCurrent:()=>Promise<Integration[]>,
  putOnce:(id:string,payload:VerificationPayload)=>Promise<T>,
  stillSelected:()=>boolean,
):Promise<T|null>{
  if(!gate.claim(intent.integrationId))return null;
  try{
    if(!stillSelected())throw Error('VERIFICATION_REVIEW_CHANGED');
    const current=await readCurrent();
    const row=current.find(item=>item.id===intent.integrationId);
    const payload:VerificationPayload={
      decision_verification_minimum:intent.nextMinimum,reason:intent.reason,
    };
    if(!stillSelected()||!isCurrentIntegrationVerificationReview(intent,row,payload)){
      throw Error('VERIFICATION_REVIEW_CHANGED');
    }
    gate.markPostStarted();
    return verifyIntegrationVerificationReceipt(intent,
      await putOnce(intent.integrationId,payload));
  }finally{gate.settled();}
}
export function IntegrationVerificationConfirmation({
  reviewed,valid,busy,onBack,onConfirm,
}:{
  reviewed:IntegrationVerificationReview|null;
  valid:boolean;busy:boolean;onBack:()=>void;onConfirm:()=>void;
}){
  if(!reviewed)return null;
  return <Alert tone="warning" title="Confirm verification minimum change">
    <p>The configured minimum affects NEW human email decisions. It does not
      replace existing request-time snapshots, grant approvals or execute
      the requested external operation.</p>
    <dl className="grant-facts">
      <dt>Integration</dt><dd>{reviewed.integrationName}</dd>
      <dt>Integration ID</dt><dd><code>{reviewed.integrationId}</code></dd>
      <dt>Current verification minimum</dt><dd>{reviewed.previousMinimum}</dd>
      <dt>Requested new minimum</dt><dd>{reviewed.nextMinimum}</dd>
      <dt>Audited change reason</dt><dd>{reviewed.reason}</dd>
    </dl>
    {reviewed.reduction&&<p role="alert"><strong>Lower security floor.</strong>
      The same mailbox PIN and email OTP are not independent MFA.
      Confirm the impact on future requests before saving.</p>}
    <p>A fresh saved integration GET precedes a single server-authorized PUT.
      This is not server-side two-administrator atomic CAS.</p>
    {!valid&&<p role="alert">Selection, current saved minimum or
      change reason changed. Review current values again.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onBack}>Back to edit</Button>
      <Button disabled={busy||!valid} onClick={onConfirm}>Confirm change</Button>
    </div>
  </Alert>;
}
