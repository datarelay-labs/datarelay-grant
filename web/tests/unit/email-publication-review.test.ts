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
