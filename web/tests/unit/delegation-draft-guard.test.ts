import {describe,expect,it} from 'vitest';
import {isDelegationDraftDirty} from '../../src/delegations';

const initial={starts:'2026-10-22T19:00',ends:'2026-10-23T03:00'};
describe('Delegation draft loss prevention',()=>{
 it('does not intercept untouched defaults',()=>{
  expect(isDelegationDraftDirty(initial,'',initial.starts,initial.ends,false)).toBe(false);
 });
 it('intercepts changed date range even when no substitute was chosen yet',()=>{
  expect(isDelegationDraftDirty(initial,'','2026-10-22T20:00',initial.ends,false)).toBe(true);
  expect(isDelegationDraftDirty(initial,'',initial.starts,'2026-10-23T04:00',false)).toBe(true);
 });
 it('intercepts selected delegate and pending revoke or create Review',()=>{
  expect(isDelegationDraftDirty(initial,'member-1',initial.starts,initial.ends,false)).toBe(true);
  expect(isDelegationDraftDirty(initial,'',initial.starts,initial.ends,true)).toBe(true);
 });
 it('treats reverted local values as clean again',()=>{
  const reverted={...initial};
  expect(isDelegationDraftDirty(initial,'',reverted.starts,reverted.ends,false)).toBe(false);
 });
});
