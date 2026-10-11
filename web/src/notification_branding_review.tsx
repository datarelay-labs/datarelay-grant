import { Alert,Button } from '@datarelay-labs/foundation';
import type {NotificationBranding} from './types';

export type BrandingDraft=Pick<NotificationBranding,'brand_name'|'sender_display_name'>;
export type BrandingReview=Readonly<{
  saved:NotificationBranding;
  changed:BrandingDraft;
  savedFingerprint:string;
}>;
function validName(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0
    &&value.length<=100&&!/[\r\n]/.test(value);
}
/** This is read-only review data, never a permission or notification send.
 * Server still enforces current principal and header-safe validation.
 */
export function prepareBrandingReview(
  saved:NotificationBranding,draft:BrandingDraft,
):BrandingReview{
  if(!saved||!draft||!validName(saved.brand_name)
    ||!validName(saved.sender_display_name)
    ||!validName(draft.brand_name)||!validName(draft.sender_display_name)
    ||typeof saved.logo_asset!=='string'||!saved.logo_asset.trim()
    ||(saved.brand_name===draft.brand_name
      &&saved.sender_display_name===draft.sender_display_name)){
    throw Error('BRANDING_REVIEW_INVALID');
  }
  const current={
    brand_name:saved.brand_name,sender_display_name:saved.sender_display_name,
    logo_asset:saved.logo_asset,
  };
  return {
    saved:current,
    changed:{brand_name:draft.brand_name,sender_display_name:draft.sender_display_name},
    savedFingerprint:JSON.stringify(current),
  };
}
export function isCurrentBrandingReview(
  intent:BrandingReview|null,saved:NotificationBranding,draft:BrandingDraft,
):boolean{
  if(!intent)return false;
  try{
    return JSON.stringify(intent)===
      JSON.stringify(prepareBrandingReview(saved,draft));
  }catch{return false;}
}
/** In-process synchronous one-shot, not backend two-administrator CAS.
 * Once PUT might have committed, the only unlock is explicit fresh GET.
 */
export function createBrandingSaveGuard(){
  let claimed=false,inFlight=false,putStarted=false;
  return {
    claim():boolean{
      if(claimed||inFlight)return false;
      claimed=true;inFlight=true;putStarted=false;
      return true;
    },
    markPutStarted():void{
      if(!inFlight)throw Error('BRANDING_CLAIM_REQUIRED');
      putStarted=true;
    },
    settled():void{
      inFlight=false;
      if(!putStarted)claimed=false;
    },
    blocked():boolean{return claimed||inFlight;},
    readSucceeded():boolean{
      if(inFlight||!claimed||!putStarted)return false;
      claimed=false;putStarted=false;return true;
    },
  };
}
export function verifyBrandingReceipt<T extends NotificationBranding>(
  intent:BrandingReview,result:T,
):T{
  if(!result||result.brand_name!==intent.changed.brand_name
    ||result.sender_display_name!==intent.changed.sender_display_name
    ||result.logo_asset!==intent.saved.logo_asset){
    throw Error('BRANDING_RECEIPT_MISMATCH');
  }
  return result;
}
export async function submitReviewedBrandingSave<T extends NotificationBranding>(
  intent:BrandingReview,
  guard:ReturnType<typeof createBrandingSaveGuard>,
  freshGet:()=>Promise<NotificationBranding>,
  putOnce:(draft:BrandingDraft)=>Promise<T>,
  stillEditing:()=>boolean,
):Promise<T|null>{
  if(!guard.claim())return null;
  try{
    if(!stillEditing())throw Error('BRANDING_CURRENT_CHANGED');
    const saved=await freshGet();
    if(!stillEditing()||!isCurrentBrandingReview(intent,saved,intent.changed)){
      throw Error('BRANDING_CURRENT_CHANGED');
    }
    guard.markPutStarted();
    return verifyBrandingReceipt(intent,await putOnce({...intent.changed}));
  }finally{guard.settled();}
}
export function BrandingChangeConfirmation({
  reviewed,valid,busy,onBack,onConfirm,
}:{
  reviewed:BrandingReview|null;valid:boolean;busy:boolean;
  onBack:()=>void;onConfirm:()=>void;
}){
  if(!reviewed)return null;
  return <Alert tone="warning" title="Review notification branding">
    <p>Review the sender identity for FUTURE notification snapshots.
      No existing request snapshots or human approval authority change.
      This review does not send email or execute any protected action.</p>
    <dl className="grant-facts">
      <dt>Current brand</dt><dd>{reviewed.saved.brand_name}</dd>
      <dt>New brand</dt><dd>{reviewed.changed.brand_name}</dd>
      <dt>Current sender</dt><dd>{reviewed.saved.sender_display_name}</dd>
      <dt>New sender</dt><dd>{reviewed.changed.sender_display_name}</dd>
      <dt>System logo (unchanged)</dt><dd><code>{reviewed.saved.logo_asset}</code></dd>
    </dl>
    <p>A current administrator-scoped GET precedes one PUT. This cannot
      prevent another administrator changing branding between read and PUT;
      server-side CAS remains separately required for atomic conflict handling.</p>
    {!valid&&<p role="alert">Saved branding or selected new values changed.
      Review the current values again.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onBack}>Back to edit</Button>
      <Button disabled={busy||!valid} onClick={onConfirm}>Confirm branding change</Button>
    </div>
  </Alert>;
}
