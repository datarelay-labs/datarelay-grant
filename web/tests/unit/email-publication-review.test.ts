import {describe,it,expect} from 'vitest';
import {createEmailPublicationGuard,submitEmailPublication} from '../../src/email_publication_review';
const review={template_id:'sample',expected_updated_at:1,review_hash:'a'.repeat(64),source_revision:null} as any;
const row={id:'sample',updated_at:1,published_revision:1} as any;
describe('explicit reviewed email publication',()=>{
 it('preflights exact saved state and prevents duplicate publication',async()=>{
  const guard=createEmailPublicationGuard();let calls=0;
  const result=await submitEmailPublication(review,'Reason',guard,async()=>[row],async payload=>{calls++;expect(payload).toEqual({source_revision:null,expected_updated_at:1,review_hash:'a'.repeat(64),reason:'Reason'});return {...row,updated_at:2,published_revision:2};},()=>true);
  expect(result?.published_revision).toBe(2);
  await submitEmailPublication(review,'Reason',guard,async()=>[row],async()=>{calls++;return row;},()=>true);
  expect(calls).toBe(1);
 });
 it('does not send when the current editor or saved source changed',async()=>{
  const guard=createEmailPublicationGuard();let writes=0;
  await expect(submitEmailPublication(review,'Reason',guard,async()=>[{...row,updated_at:3}],async()=>{writes++;return row;},()=>true)).rejects.toThrow();
  expect(writes).toBe(0);expect(guard.blocked()).toBe(false);
 });
 it('latches ambiguous POST and only reconciles after current saved CAS advances',async()=>{
  const guard=createEmailPublicationGuard();
  await expect(submitEmailPublication(review,'Reason',guard,async()=>[row],async()=>{throw Error('network result unknown');},()=>true)).rejects.toThrow();
  expect(guard.blocked()).toBe(true);expect(guard.observe(row)).toBe(false);
  expect(guard.observe({...row,updated_at:2,published_revision:2})).toBe(true);
 });
});

it('releases a definitively rejected stale proof for fresh review without replaying the consumed POST',async()=>{
 const {ApiError}=await import('../../src/api');const guard=createEmailPublicationGuard();let writes=0;
 await expect(submitEmailPublication(review,'Old review',guard,async()=>[row],async()=>{writes++;throw new ApiError(409,'PUBLICATION_CHANGED_REVIEW_REQUIRED');},()=>true)).rejects.toThrow();
 expect(guard.blocked()).toBe(false);
 await submitEmailPublication(review,'Do not replay',guard,async()=>[row],async()=>{writes++;return {...row,updated_at:2,published_revision:2};},()=>true);
 expect(writes).toBe(1);
 const result=await submitEmailPublication({...review,review_hash:'b'.repeat(64)},'Fresh review',guard,async()=>[row],async()=>{writes++;return {...row,updated_at:2,published_revision:2};},()=>true);
 expect(result?.published_revision).toBe(2);expect(writes).toBe(2);
});

it('does not mistake unknown conflict or network errors for a guaranteed no-write rejection',async()=>{
 const {ApiError}=await import('../../src/api');const guard=createEmailPublicationGuard();
 await expect(submitEmailPublication(review,'Reason',guard,async()=>[row],async()=>{throw new ApiError(409,'UNKNOWN_COMMIT_STATE');},()=>true)).rejects.toThrow();
 expect(guard.blocked()).toBe(true);
});
