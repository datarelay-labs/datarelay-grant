import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  prepareDelegationCreateReview, prepareDelegationRevokeReview,
  isCurrentDelegationCreateReview, DelegationReviewConfirmation,
  createDelegationAttemptGuard, submitReviewedDelegationChange,
  verifyDelegationChangeReceipt,
  type DelegationRow, type DirectoryMember,
} from '../../src/delegation_review';
import type { User } from '../../src/types';
import { delegationReconciliationCopy } from '../../src/delegations';

const alice: User = { id:'alice',username:'alice',email:'a@example.invalid',
  role:'member',mfa_enabled:false };
const admin: User = { ...alice,id:'admin',username:'admin',role:'admin' };
const directory: DirectoryMember[] = [{id:'bob',username:'Bob Delegate'},
  {id:'charlie',username:'Charlie'}, {id:'alice',username:'Alice'}];
const saved: DelegationRow = {
  id:'delegation-1',delegator_id:'alice',substitute_id:'bob',
  starts_at:10000,ends_at:20000,revoked_at:null,
};
const now=9000;
function create() {return prepareDelegationCreateReview(alice,directory,'bob',10000,20000,now);}
function revoke() {return prepareDelegationRevokeReview(alice,saved,now);}
function html(review:ReturnType<typeof create>,valid=true) {
  return renderToStaticMarkup(createElement(DelegationReviewConfirmation,{
    review,valid,busy:false,actor:alice,directory,
    onCancel:()=>undefined,onConfirm:()=>undefined,
  }));
}

describe('P0 delegated-approval task-first exact human Review → Confirm',()=>{
  it('distinguishes a verified saved delegation from a possibly committed write',()=>{
    const confirmed=delegationReconciliationCopy(true,true);
    expect(confirmed.title).toContain('confirmed');
    expect(confirmed.message).toContain('server confirmed');
    expect(confirmed.message).toContain('Refresh');
    expect(confirmed.message).not.toContain('may have committed');
    const uncertain=delegationReconciliationCopy(false,true);
    expect(uncertain.message).toContain('may have committed');
    expect(uncertain.title).toContain('Reconcile');
    const onlySubmitted=delegationReconciliationCopy(false,false);
    expect(onlySubmitted.message).toContain('submitted');
    expect(onlySubmitted.message).not.toContain('server confirmed');
  });
  it('freezes exact actor, recipient, start and end without sending an approval',()=>{
    const intent=create();
    expect(intent).toEqual({
      kind:'create', actorId:'alice', substituteId:'bob',
      startsAt:10000, endsAt:20000,
    });
    expect(html(intent)).toContain('Bob Delegate');
    expect(html(intent)).toContain('Confirm delegation change');
    expect(html(intent)).toContain('Original assigned approver');
    expect(html(intent)).toContain('not an approval decision');
    expect(html(intent)).not.toContain('Approve</button>');
    expect(html(intent)).not.toContain('Execute</button>');
  });
  it('rejects self-delegation and expired/invalid windows before any confirm',()=>{
    for(const [id,start,end] of [['alice',10000,20000],['bob',18000,11000],
       ['bob',100,5000],['',10000,20000]] as const) {
      expect(()=>prepareDelegationCreateReview(alice,directory,id,start,end,now))
        .toThrow('DELEGATION_REVIEW_INVALID');
    }
  });
  it('rejects a selected user absent from current directory',()=>{
    expect(()=>prepareDelegationCreateReview(alice,directory,'unknown',10000,20000,now))
      .toThrow('DELEGATION_REVIEW_INVALID');
  });
  it('rejects a changed actor, recipient, start or end after a review',()=>{
    const reviewed=create();
    expect(isCurrentDelegationCreateReview(reviewed,alice,directory,'bob',10000,20000,now))
      .toBe(true);
    expect(isCurrentDelegationCreateReview(reviewed,alice,directory,'charlie',10000,20000,now))
      .toBe(false);
    expect(isCurrentDelegationCreateReview(reviewed,alice,directory,'bob',10001,20000,now))
      .toBe(false);
    expect(isCurrentDelegationCreateReview(reviewed,admin,directory,'bob',10000,20000,now))
      .toBe(false);
  });
  it('requires current ownership/admin authority and active unrevoked window to revoke',()=>{
    expect(revoke().kind).toBe('revoke');
    expect(()=>prepareDelegationRevokeReview(
      {...alice,id:'not-owner'},saved,now)).toThrow('DELEGATION_REVIEW_INVALID');
    expect(prepareDelegationRevokeReview(admin,saved,now).kind).toBe('revoke');
    expect(()=>prepareDelegationRevokeReview(alice,{...saved,revoked_at:9001},now))
      .toThrow('DELEGATION_REVIEW_INVALID');
    expect(()=>prepareDelegationRevokeReview(alice,saved,21000))
      .toThrow('DELEGATION_REVIEW_INVALID');
  });
  it('freezes revoked delegation identity plus recorded substitute and dates',()=>{
    const intent=revoke();
    expect(intent).toHaveProperty('source.id','delegation-1');
    const markup=renderToStaticMarkup(createElement(DelegationReviewConfirmation,{
      review:intent,valid:true,busy:false,actor:alice,directory,
      onCancel:()=>undefined,onConfirm:()=>undefined,
    }));
    expect(markup).toContain('Bob Delegate');
    expect(markup).toContain('Revoke a delegation');
    expect(markup).toContain('Decision records are retained');
    expect(markup).not.toContain('Execute</button>');
  });
  it('issues one server GET then exactly one create POST using frozen fields',async()=>{
    const gate=createDelegationAttemptGuard();
    const calls:string[]=[];
    const result=await submitReviewedDelegationChange(create(),gate,
      async()=>{calls.push('GET directory');return {directory,records:[]};},
      async(intent)=>{
        calls.push('POST create');
        if(intent.kind!=='create') throw new Error('wrong action');
        return {id:'new-one',delegator_id:'alice',substitute_id:'bob',
          starts_at:10000,ends_at:20000,revoked_at:null};
      }, now);
    expect(calls).toEqual(['GET directory','POST create']);
    expect(verifyDelegationChangeReceipt(create(),result!)).toBe(result);
    expect(gate.blocked()).toBe(true);
  });
  it('never POSTs a revoked/changed record seen in the fresh read',async()=>{
    const gate=createDelegationAttemptGuard();
    let writes=0;
    await expect(submitReviewedDelegationChange(revoke(),gate,
      async()=>({directory,records:[{...saved,revoked_at:now+1}]}),
      async()=>{writes++;return saved;},now))
      .rejects.toThrow('DELEGATION_CHANGED_REVIEW_REQUIRED');
    expect(writes).toBe(0);
    expect(gate.blocked()).toBe(false);
  });
  it('stops before create POST if substitute was removed from directory',async()=>{
    let writes=0;
    await expect(submitReviewedDelegationChange(create(),createDelegationAttemptGuard(),
      async()=>({directory:[],records:[]}),
      async()=>{writes++;return saved;},now))
      .rejects.toThrow('DELEGATION_CHANGED_REVIEW_REQUIRED');
    expect(writes).toBe(0);
  });
  it('claims synchronously so rapid double Confirm cannot issue two writes',async()=>{
    const gate=createDelegationAttemptGuard(),intent=create();
    let writes=0,release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve});
    const send=()=>submitReviewedDelegationChange(intent,gate,
      async()=>({directory,records:[]}),
      async()=>{writes++;await pending;return saved;},now);
    const a=send(),b=send();
    await Promise.resolve();
    expect(writes).toBe(1);
    release();
    expect(await a).toBe(saved);
    expect(await b).toBeNull();
  });
  it('latches ambiguous POST; explicit successful refresh alone unlocks another review',async()=>{
    const gate=createDelegationAttemptGuard();
    let count=0;
    await expect(submitReviewedDelegationChange(create(),gate,
      async()=>({directory,records:[]}),
      async()=>{count++;throw new Error('UNKNOWN_WRITE');},now))
      .rejects.toThrow('UNKNOWN_WRITE');
    expect(gate.blocked()).toBe(true);
    expect(await submitReviewedDelegationChange(create(),gate,
      async()=>({directory,records:[]}),
      async()=>{count++;return saved;},now)).toBeNull();
    expect(count).toBe(1);
    expect(gate.readSucceeded()).toBe(true);
    expect(gate.blocked()).toBe(false);
  });
  it('refuses a mismatched revocation/create receipt without claiming success',()=>{
    expect(()=>verifyDelegationChangeReceipt(create(),{...saved,substitute_id:'charlie'}))
      .toThrow('DELEGATION_RECEIPT_MISMATCH');
    expect(()=>verifyDelegationChangeReceipt(revoke(),saved))
      .toThrow('DELEGATION_RECEIPT_MISMATCH');
    expect(verifyDelegationChangeReceipt(revoke(),{...saved,revoked_at:now+1}))
      .toHaveProperty('id','delegation-1');
  });
  it('escapes untrusted username and disables stale final Confirm',()=>{
    const output=renderToStaticMarkup(createElement(DelegationReviewConfirmation,{
      review:create(),valid:false,busy:false,actor:alice,
      directory:[{id:'bob',username:'<script>alert(1)</script>'}],
      onCancel:()=>undefined,onConfirm:()=>undefined,
    }));
    expect(output).toContain('&lt;script&gt;');
    expect(output).not.toContain('<script>');
    expect(output).toContain('disabled=""');
  });
});
