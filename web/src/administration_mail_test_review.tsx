import {Alert,Button} from '@datarelay-labs/foundation';
import type {User} from './types';

/** The recipient is the authenticated administrator, not a caller-supplied
 * third party. This UI never introduces a new recipient or mail setting.
 */
export type AdministrationMailReview=Readonly<{
  actorId:string;username:string;recipient:string;subject:string;
}>;
export type AdministrationMailReceipt={
  smtp_accepted:boolean;event_id:string;
};
export function createAdministrationMailReview(
  user:Pick<User,'id'|'username'|'email'|'role'>,
):AdministrationMailReview{
  if(user.role!=='admin'||!user.id?.trim()||!user.username?.trim()
    ||typeof user.email!=='string'
    ||!(/^[^@\s]+@[^@\s]+\.[^@\s]+$/).test(user.email)
    ||/[\r\n]/.test(user.email)){
    throw Error('MAIL_TEST_REVIEW_INVALID');
  }
  return {
    actorId:user.id,username:user.username,recipient:user.email,
    subject:'[Grant] Delivery configuration test',
  };
}
export function isCurrentAdministrationMailReview(
  intent:AdministrationMailReview|null,
  user:Pick<User,'id'|'username'|'email'|'role'>,
):boolean{
  if(!intent)return false;
  try{return JSON.stringify(intent)===JSON.stringify(createAdministrationMailReview(user));}
  catch{return false;}
}
/** Once an SMTP POST starts, it may have been accepted even if the
 * browser loses the response. Keep it latched on this mount: never
 * automatically retry and never treat SMTP acceptance as inbox receipt.
 */
export function createAdministrationMailAttemptGuard(){
  let claimed=false,inFlight=false,postStarted=false;
  return {
    claim():boolean{
      if(claimed||inFlight)return false;
      claimed=true;inFlight=true;postStarted=false;return true;
    },
    markPostStarted():void{
      if(!inFlight)throw Error('MAIL_TEST_CLAIM_REQUIRED');
      postStarted=true;
    },
    settled():void{
      inFlight=false;
      if(!postStarted)claimed=false;
    },
    blocked():boolean{return claimed||inFlight;},
  };
}
export function verifyAdminMailTestReceipt<T extends AdministrationMailReceipt>(receipt:T):T{
  if(!receipt||receipt.smtp_accepted!==true
    ||typeof receipt.event_id!=='string'||!receipt.event_id.trim()){
    throw Error('MAIL_TEST_RECEIPT_INVALID');
  }
  return receipt;
}
export async function submitReviewedAdministrationMailTest<T extends AdministrationMailReceipt>(
  intent:AdministrationMailReview,
  guard:ReturnType<typeof createAdministrationMailAttemptGuard>,
  user:Pick<User,'id'|'username'|'email'|'role'>,
  sendOnce:()=>Promise<T>,
  stillSelected:()=>boolean,
):Promise<T|null>{
  if(!guard.claim())return null;
  try{
    if(!stillSelected()||!isCurrentAdministrationMailReview(intent,user)){
      throw Error('MAIL_TEST_REVIEW_CHANGED');
    }
    guard.markPostStarted();
    return verifyAdminMailTestReceipt(await sendOnce());
  }finally{guard.settled();}
}
export function AdministrationMailReviewConfirmation({
  reviewed,busy,valid,onBack,onConfirm,
}:{
  reviewed:AdministrationMailReview|null;busy:boolean;valid:boolean;
  onBack:()=>void;onConfirm:()=>void;
}){
  if(!reviewed)return null;
  return <Alert tone="warning" title="Review mail delivery test">
    <p>This is one real SMTP test-message attempt to your current Grant
      administrator mailbox only. SMTP transport acceptance is not inbox receipt,
      and this test never approves a human decision or executes an external action.</p>
    <dl className="grant-facts">
      <dt>Signed-in administrator</dt><dd>{reviewed.username}</dd>
      <dt>Administrator ID</dt><dd><code>{reviewed.actorId}</code></dd>
      <dt>Recipient (signed-in account)</dt><dd>{reviewed.recipient}</dd>
      <dt>Subject</dt><dd>{reviewed.subject}</dd>
    </dl>
    <p>An uncertain SMTP response may already have sent the email.
      A separate attempt requires a new explicit review and must not be
      automatically retried. Server administrator authority and rate limits
      remain authoritative.</p>
    {!valid&&<p role="alert">User identity or selected task changed.
      Review the current account again.</p>}
    <div className="grant-actions">
      <Button variant="secondary" disabled={busy} onClick={onBack}>
        Back to administration
      </Button>
      <Button disabled={busy||!valid} onClick={onConfirm}>
        Confirm mail test to me
      </Button>
    </div>
  </Alert>;
}
