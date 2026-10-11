import { describe, expect, it } from 'vitest';
import {
 createRequestIntakeReadGate, readScopedRequestIntake,
 currentIntakeProjection,
} from '../../src/request_intake_read_scope';

type Policy = { id: string; lifecycle: 'ACTIVE' | 'DRAFT' };
type Prior = { id: string; state: string; collaboration_state: string; title: string };
const policies: Policy[] = [{ id: 'policy-a', lifecycle: 'ACTIVE' }];
const a: Prior = {id:'old-a',state:'CANCELLED',collaboration_state:'OPEN',title:'Request A'};
const b: Prior = {id:'old-b',state:'EXPIRED',collaboration_state:'CHANGES_REQUESTED',title:'Request B'};

function deferred<T>() {
 let resolve!: (value:T)=>void;
 let reject!: (error:Error)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
const valid = (p: Prior) => p.state==='CANCELLED'
 || (p.state==='EXPIRED' && p.collaboration_state==='CHANGES_REQUESTED');

describe('P0 task-first NewRequest safe replacement context',()=>{
 it('does not project stale predecessor or policy choices during route transition',()=>{
  expect(currentIntakeProjection({key:'old-a',profiles:policies,predecessor:a},
    'old-b')).toBeNull();
  expect(currentIntakeProjection({key:'old-a',profiles:policies,predecessor:a},
    'old-a')?.predecessor).toBe(a);
  expect(currentIntakeProjection(null,'')).toBeNull();
 });
 it('ignores an old A predecessor response after selecting replacement B',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext('old-a');
  const first=deferred<Prior>(),projected:string[]=[];
  const oldRead=readScopedRequestIntake(gate,'old-a',
    async()=>policies,async()=>first.promise,valid,
    result=>projected.push(result.predecessor?.id??'none'));
  gate.selectContext('old-b');
  const fresh=await readScopedRequestIntake(gate,'old-b',
    async()=>policies,async()=>b,valid,
    result=>projected.push(result.predecessor?.id??'none'));
  first.resolve(a);
  expect(fresh).toBe(true);
  expect(await oldRead).toBe(false);
  expect(projected).toEqual(['old-b']);
 });
 it('does not begin a read of an old context after a new one is selected',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext('old-b');
  let GETs=0;
  const r=await readScopedRequestIntake(gate,'old-a',
    async()=>{GETs++;return policies;},
    async()=>{GETs++;return a;},valid,()=>undefined);
  expect(r).toBe(false);
  expect(GETs).toBe(0);
 });
 it('accepts an ordinary new-request load without asking for a predecessor',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext(undefined);
  let originalFetches=0;
  const out:string[]=[];
  expect(await readScopedRequestIntake(gate,undefined,
    async()=>policies,async()=>{originalFetches++;return a;},valid,
    result=>out.push(result.key))).toBe(true);
  expect(originalFetches).toBe(0);
  expect(out).toEqual(['']);
 });
 it('rejects a mismatched or ineligible predecessor from the server',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext('old-a');
  const projected:Prior[]=[];
  await expect(readScopedRequestIntake(gate,'old-a',async()=>policies,
    async()=>b,valid,result=>{if(result.predecessor)projected.push(result.predecessor)}))
    .rejects.toThrow('REQUEST_PREDECESSOR_ID_MISMATCH');
  await expect(readScopedRequestIntake(gate,'old-a',async()=>policies,
    async()=>({...a,state:'APPROVED'}),valid,()=>undefined))
    .rejects.toThrow('REQUEST_REPLACEMENT_NOT_ELIGIBLE');
  expect(projected).toEqual([]);
 });
 it('ignores an earlier same-context policy load when a newer request loaded first',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext(undefined);
  const prior=deferred<Policy[]>(),versions:string[]=[];
  const early=readScopedRequestIntake(gate,undefined,()=>prior.promise,
    async()=>a,valid,result=>versions.push(result.profiles[0]?.id??''));
  const newer=await readScopedRequestIntake(gate,undefined,
    async()=>[{id:'fresh-policy',lifecycle:'ACTIVE'}] as Policy[],
    async()=>a,valid,result=>versions.push(result.profiles[0]?.id??''));
  prior.resolve(policies);
  expect(newer).toBe(true);
  expect(await early).toBe(false);
  expect(versions).toEqual(['fresh-policy']);
 });
 it('suppresses an irrelevant old GET error but propagates an error for current context',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext('old-a');
  const slow=deferred<Policy[]>();
  const previous=readScopedRequestIntake(gate,'old-a',()=>slow.promise,
    async()=>a,valid,()=>undefined);
  gate.selectContext('old-b');
  slow.reject(new Error('OLD_GET_FAILED'));
  expect(await previous).toBe(false);
  await expect(readScopedRequestIntake(gate,'old-b',
    async()=>{throw Error('CURRENT_GET_FAILED')},async()=>b,valid,
    ()=>undefined)).rejects.toThrow('CURRENT_GET_FAILED');
 });
 it('refuses to project data if the request context becomes stale between two GETs',async()=>{
  const gate=createRequestIntakeReadGate();
  gate.selectContext('old-a');
  const slow=deferred<Prior>();
  let count=0;
  const started=readScopedRequestIntake(gate,'old-a',async()=>policies,
    ()=>slow.promise,valid,()=>{count++});
  await Promise.resolve();
  gate.selectContext('old-b');
  slow.resolve(a);
  expect(await started).toBe(false);
  expect(count).toBe(0);
 });
});
