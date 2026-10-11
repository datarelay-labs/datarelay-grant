import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {User} from '../../src/types';
import {
 createAdministrationMailReview,isCurrentAdministrationMailReview,
 AdministrationMailReviewConfirmation,createAdministrationMailAttemptGuard,
 submitReviewedAdministrationMailTest,verifyAdminMailTestReceipt,
} from '../../src/administration_mail_test_review';
const admin:User={id:'administrator-1',username:'fixture-admin',
 email:'test-admin@example.invalid',role:'admin',mfa_enabled:true};
const receipt={smtp_accepted:true,event_id:'synthetic-test-event-1'};
const review=()=>createAdministrationMailReview(admin);
describe('B3 Administration mail test explicit source review',()=>{
 it('review is bound to the authenticated administrator own recipient',()=>{
  expect(review().recipient).toBe(admin.email);
  expect(review().actorId).toBe(admin.id);
  expect(review().subject).toBe('[Grant] Delivery configuration test');
 });
 it('does not prepare a member or invalid recipient',()=>{
  for(const user of [{...admin,role:'member' as const},{...admin,email:'bad'},
   {...admin,email:'evil\n@example.invalid'},{...admin,id:''}]){
   expect(()=>createAdministrationMailReview(user)).toThrow('MAIL_TEST_REVIEW_INVALID');
  }
 });
 it('requires a separate confirmation with honest transport and receipt limitations',()=>{
  const html=renderToStaticMarkup(createElement(AdministrationMailReviewConfirmation,{
   reviewed:review(),busy:false,valid:true,onBack:()=>undefined,onConfirm:()=>undefined}));
  expect(html).toContain('Confirm mail test to me');
  expect(html).toContain('test-admin@example.invalid');
  expect(html).toContain('not inbox receipt');
  expect(html).toContain('never approves');
 });
 it('invalidates old user identity and email',()=>{
  expect(isCurrentAdministrationMailReview(review(),admin)).toBe(true);
  expect(isCurrentAdministrationMailReview(review(),{...admin,email:'new@example.invalid'})).toBe(false);
 });
 it('one explicit POST only, with synchronous duplicate-claim protection',async()=>{
  const gate=createAdministrationMailAttemptGuard();let send=0;
  let finish!:(r:typeof receipt)=>void;
  const pending=new Promise<typeof receipt>(resolve=>{finish=resolve});
  const call=()=>submitReviewedAdministrationMailTest(review(),gate,admin,
   async()=>{send++;return pending},()=>true);
  const a=call(),b=call();await Promise.resolve();
  expect(send).toBe(1);finish(receipt);
  expect(await a).toEqual(receipt);expect(await b).toBeNull();
 });
 it('malformed SMTP receipt does not qualify real mailbox delivery',()=>{
  expect(verifyAdminMailTestReceipt(receipt)).toEqual(receipt);
  expect(()=>verifyAdminMailTestReceipt({...receipt,smtp_accepted:false}))
   .toThrow('MAIL_TEST_RECEIPT_INVALID');
  expect(()=>verifyAdminMailTestReceipt({...receipt,event_id:''}))
   .toThrow('MAIL_TEST_RECEIPT_INVALID');
 });
 it('possible accepted POST remains latched; no automatic resend',async()=>{
  const gate=createAdministrationMailAttemptGuard();let posts=0;
  await expect(submitReviewedAdministrationMailTest(review(),gate,admin,
   async()=>{posts++;throw Error('SMTP_TIMEOUT')},()=>true)).rejects.toThrow('SMTP_TIMEOUT');
  expect(gate.blocked()).toBe(true);
  expect(await submitReviewedAdministrationMailTest(review(),gate,admin,
   async()=>{posts++;return receipt},()=>true)).toBeNull();
  expect(posts).toBe(1);
 });
 it('changed administration selection does not send',async()=>{
  const gate=createAdministrationMailAttemptGuard();let posts=0;
  await expect(submitReviewedAdministrationMailTest(review(),gate,admin,
   async()=>{posts++;return receipt},()=>false)).rejects.toThrow('MAIL_TEST_REVIEW_CHANGED');
  expect(posts).toBe(0);expect(gate.blocked()).toBe(false);
 });
});
