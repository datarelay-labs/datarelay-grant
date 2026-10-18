import { describe, expect, it } from 'vitest';
import {
  createIntegrationDiagnosticsReadScope, readSelectedIntegrationDiagnostics,
  currentIntegrationDiagnostics,
} from '../../src/integration_diagnostics_read_scope';

type Detail={integration:{id:string;name:string};count:number};
const a:Detail={integration:{id:'A',name:'Control'},count:2};
const b:Detail={integration:{id:'B',name:'Stellar'},count:5};
function deferred<T>(){
  let resolve!:(v:T)=>void,reject!:(e:Error)=>void;
  const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no});
  return {promise,resolve,reject};
}
describe('P0 exact-selected integration diagnostics task-first read',()=>{
  it('B supersedes slow A and never displays A as B after a selector change',async()=>{
    const gate=createIntegrationDiagnosticsReadScope(),shown:string[]=[];
    const slow=deferred<Detail>();gate.select('A');
    const first=readSelectedIntegrationDiagnostics(gate,'A',()=>slow.promise,
      value=>shown.push(value.integration.id));
    gate.select('B');
    expect(await readSelectedIntegrationDiagnostics(gate,'B',async()=>b,
      value=>shown.push(value.integration.id))).toBe(true);
    slow.resolve(a);
    expect(await first).toBe(false);
    expect(shown).toEqual(['B']);
  });
  it('same-selected newer result rejects old read and old failure without replacing new data',async()=>{
    const gate=createIntegrationDiagnosticsReadScope(),shown:number[]=[];
    gate.select('A');
    const firstRead=deferred<Detail>();
    const pending=readSelectedIntegrationDiagnostics(gate,'A',
      ()=>firstRead.promise,value=>shown.push(value.count));
    const second=await readSelectedIntegrationDiagnostics(gate,'A',
      async()=>({...a,count:3}),value=>shown.push(value.count));
    firstRead.reject(Error('old error'));
    expect(second).toBe(true);expect(await pending).toBe(false);
    expect(shown).toEqual([3]);
  });
  it('fails closed when the backend returns a different integration ID',async()=>{
    const gate=createIntegrationDiagnosticsReadScope(),shown:Detail[]=[];
    gate.select('A');
    await expect(readSelectedIntegrationDiagnostics(gate,'A',async()=>b,
      value=>shown.push(value))).rejects.toThrow('DIAGNOSTICS_INTEGRATION_MISMATCH');
    expect(shown).toEqual([]);
  });
  it('never starts a request without the currently selected and nonempty role-scoped ID',async()=>{
    const gate=createIntegrationDiagnosticsReadScope();gate.select('B');
    let requests=0;
    expect(await readSelectedIntegrationDiagnostics(gate,'A',
      async()=>{requests++;return a;},()=>undefined)).toBe(false);
    gate.select('');
    expect(await readSelectedIntegrationDiagnostics(gate,'',
      async()=>{requests++;return a;},()=>undefined)).toBe(false);
    expect(requests).toBe(0);
  });
  it('hides previous selection immediately, even before the old request resolves',()=>{
    const saved={key:'A',value:a};
    expect(currentIntegrationDiagnostics(saved,'B',['A','B'])).toBeNull();
    expect(currentIntegrationDiagnostics(saved,'A',['B'])).toBeNull();
    expect(currentIntegrationDiagnostics(saved,'A',['A','B'])).toEqual(a);
  });
  it('does not report a stale error after selection changes mid-GET',async()=>{
    const gate=createIntegrationDiagnosticsReadScope(),slow=deferred<Detail>();
    gate.select('A');
    const pending=readSelectedIntegrationDiagnostics(gate,'A',
      ()=>slow.promise,()=>{throw Error('stale rendered');});
    gate.select('B');slow.reject(Error('stale network error'));
    expect(await pending).toBe(false);
  });
});
