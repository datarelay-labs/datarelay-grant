import { Alert, Button } from '@datarelay-labs/foundation';
import { when } from './common';
import type { User } from './types';

export type DirectoryMember = { id: string; username: string };
export type DelegationRow = {
  id: string; delegator_id: string; substitute_id: string;
  starts_at: number; ends_at: number; revoked_at: number | null;
};
export type DelegationReview =
  | {kind:'create';actorId:string;substituteId:string;startsAt:number;endsAt:number}
  | {kind:'revoke';actorId:string;source:DelegationRow};

export function prepareDelegationCreateReview(
  actor: Pick<User,'id'>, directory: readonly DirectoryMember[],
  substituteId: string, startsAt: number, endsAt: number, now: number,
): DelegationReview & {kind:'create'} {
  if(!actor.id || !substituteId || substituteId===actor.id
     || !directory.some(row=>row.id===substituteId)
     || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)
     || !Number.isFinite(now) || endsAt<=startsAt || endsAt<=now) {
    throw new Error('DELEGATION_REVIEW_INVALID');
  }
  return {kind:'create',actorId:actor.id,substituteId,startsAt,endsAt};
}

export function prepareDelegationRevokeReview(
  actor:Pick<User,'id'|'role'>, row:DelegationRow, now:number,
): DelegationReview & {kind:'revoke'} {
  if(!actor.id || !row?.id
     || (actor.role!=='admin' && row.delegator_id!==actor.id)
     || row.revoked_at!==null || !Number.isFinite(now)
     || !Number.isFinite(row.ends_at) || row.ends_at<=now) {
    throw new Error('DELEGATION_REVIEW_INVALID');
  }
  return {kind:'revoke',actorId:actor.id,source:{...row}};
}
export function isCurrentDelegationCreateReview(
  reviewed: DelegationReview|null,
  actor:Pick<User,'id'>,directory:readonly DirectoryMember[],
  substituteId:string,startsAt:number,endsAt:number,now:number,
):boolean {
  if(!reviewed || reviewed.kind!=='create') return false;
  try {
    return JSON.stringify(prepareDelegationCreateReview(actor,directory,
      substituteId,startsAt,endsAt,now))===JSON.stringify(reviewed);
  }catch{return false}
}

/** A delegation's stored identity, active window and revocation status
 * must match the server's current role-scoped GET before a revoke POST.
 */
function sameDelegation(a:DelegationRow,b:DelegationRow):boolean {
  return a.id===b.id && a.delegator_id===b.delegator_id
    && a.substitute_id===b.substitute_id && a.starts_at===b.starts_at
    && a.ends_at===b.ends_at && a.revoked_at===b.revoked_at;
}

export function createDelegationAttemptGuard(){
  let attempted=false,inFlight=false,postStarted=false;
  return {
    claim():boolean {
      if(attempted||inFlight) return false;
      attempted=true; inFlight=true; postStarted=false;return true;
    },
    markPostStarted():void {
      if(!inFlight) throw new Error('DELEGATION_CLAIM_REQUIRED');
      postStarted=true;
    },
    settled():void {
      inFlight=false;
      if(!postStarted) attempted=false;
    },
    blocked():boolean{return attempted||inFlight;},
    readSucceeded():boolean {
      if(inFlight) return false;
      attempted=false;postStarted=false;return true;
    },
  };
}

/** At most one external write per human Confirm, after a real read-only
 * freshness check. The server retains exclusive permission authority.
 * A failed pre-write GET can be reviewed again; an ambiguous POST cannot.
 */
export async function submitReviewedDelegationChange<T>(
  intent:DelegationReview,
  guard:ReturnType<typeof createDelegationAttemptGuard>,
  readCurrent:()=>Promise<{directory:DirectoryMember[];records:DelegationRow[]}>,
  postOnce:(intent:DelegationReview)=>Promise<T>,
  now:number,
):Promise<T|null> {
  if(!guard.claim()) return null;
  try {
    const current=await readCurrent();
    if(intent.kind==='create'){
      if(!current.directory.some(row=>row.id===intent.substituteId)
         ||intent.actorId===intent.substituteId||intent.endsAt<=now){
        throw new Error('DELEGATION_CHANGED_REVIEW_REQUIRED');
      }
    }else {
      const row=current.records.find(item=>item.id===intent.source.id);
      if(!row||!sameDelegation(row,intent.source)
         ||row.ends_at<=now||row.revoked_at!==null) {
        throw new Error('DELEGATION_CHANGED_REVIEW_REQUIRED');
      }
    }
    guard.markPostStarted();
    return await postOnce(intent);
  }finally{guard.settled()}
}

/** The server's POST projection, not a client optimistic assumption, is
 * required before displaying any acknowledged result.
 */
export function verifyDelegationChangeReceipt(
  intent:DelegationReview,result:DelegationRow,
):DelegationRow {
  if(!result?.id || !result.delegator_id|| !result.substitute_id){
    throw new Error('DELEGATION_RECEIPT_MISMATCH');
  }
  if(intent.kind==='create'){
    if(result.delegator_id!==intent.actorId
      ||result.substitute_id!==intent.substituteId
      ||result.starts_at!==intent.startsAt
      ||result.ends_at!==intent.endsAt
      ||result.revoked_at!==null) throw new Error('DELEGATION_RECEIPT_MISMATCH');
  }else{
    if(!sameDelegation({...result,revoked_at:intent.source.revoked_at},intent.source)
      ||!Number.isFinite(result.revoked_at)
      ||(result.revoked_at??0)<=0)
      throw new Error('DELEGATION_RECEIPT_MISMATCH');
  }
  return result;
}

export function DelegationReviewConfirmation({
  review, valid, busy, actor, directory, onCancel, onConfirm,
}:{
  review:DelegationReview|null;valid:boolean;busy:boolean;
  actor:Pick<User,'id'|'username'>;directory:readonly DirectoryMember[];
  onCancel:()=>void;onConfirm:()=>void;
}) {
  if(!review) return null;
  const id=review.kind==='create'?review.substituteId:review.source.substitute_id;
  const name=directory.find(member=>member.id===id)?.username??'Unavailable account';
  const source=review.kind==='create'?review.actorId:review.source.delegator_id;
  return (
    <Alert tone="warning" title={review.kind==='create'
      ? 'Confirm time-bounded delegation' : 'Revoke a delegation'}>
      <p>This authorizes a substitute to make a separate human approval
        decision during the reviewed window. It is not an approval decision
        and does not execute any protected action.</p>
      <dl className="grant-facts">
        <dt>Original assigned approver</dt>
        <dd>{source===actor.id?actor.username:'Other recorded approver'}</dd>
        <dt>Substitute</dt><dd>{name}</dd>
        <dt>Valid from</dt><dd>{when(review.kind==='create'
          ?review.startsAt:review.source.starts_at)}</dd>
        <dt>Valid until</dt><dd>{when(review.kind==='create'
          ?review.endsAt:review.source.ends_at)}</dd>
        <dt>Action</dt><dd>{review.kind==='create'?'Schedule delegation':'Revoke delegation'}</dd>
      </dl>
      {review.kind==='revoke' && <p>Decision records are retained.
        Revocation removes future substitute authority, including
        still-active delegation-linked email issuances.</p>}
      {!valid && <p role="alert">The review is stale or a delegation
        changed. Cancel and recheck current access before confirming.</p>}
      <div className="grant-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Back to review</Button>
        <Button disabled={busy||!valid} onClick={onConfirm}>Confirm delegation change</Button>
      </div>
    </Alert>
  );
}
