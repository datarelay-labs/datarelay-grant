import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditFilterValues } from '../../src/audit_filters';
import {
  createAuditWorklistScope, readCurrentAuditWorklist,
  currentAuditPageProjection, auditDraftHasChanges,
  canExportAuditPage, AuditCurrentSearchSummary,
  type AuditScopedPage,
} from '../../src/audit_worklist_current_query';

const empty:AuditFilterValues={
  search:'',action:'',actor:'',request_id:'',since:'',until:'',
};
const qA='offset=0&limit=50&request_id=request-A';
const qB='offset=0&limit=50&request_id=request-B';
const event={
  id:'evt-A',at:1700000000,action:'request.created',actor:'requester',
  request_id:'request-A',details:{foo:'safe reference'},
};
const page:AuditScopedPage={
  total:1,limit:50,offset:0,has_more:false,items:[event],
};
function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(error:Error)=>void;
  const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no});
  return {promise,resolve,reject};
}
describe('B5 task-first audit results and evidence export exact selection',()=>{
  it('latest B filter displays B while old A GET is pending',async()=>{
    const gate=createAuditWorklistScope(),a=deferred<AuditScopedPage>(),shown:string[]=[];
    gate.select(qA);
    const old=readCurrentAuditWorklist(gate,qA,0,()=>a.promise,
      response=>shown.push(response.items[0].id));
    gate.select(qB);
    const b=await readCurrentAuditWorklist(gate,qB,0,
      async()=>({...page,items:[{...event,id:'evt-B',request_id:'request-B'}]}),
      response=>shown.push(response.items[0].id));
    a.resolve(page);
    expect(b).toBe(true);
    expect(await old).toBe(false);
    expect(shown).toEqual(['evt-B']);
  });
  it('rejects same-filter late GET and stale network errors',async()=>{
    const gate=createAuditWorklistScope(),slow=deferred<AuditScopedPage>();
    gate.select(qA);
    const events:string[]=[];
    const old=readCurrentAuditWorklist(gate,qA,0,()=>slow.promise,
      response=>events.push(response.items[0].id));
    expect(await readCurrentAuditWorklist(gate,qA,0,
      async()=>({...page,items:[{...event,id:'evt-new'}]}),
      response=>events.push(response.items[0].id))).toBe(true);
    slow.reject(new Error('old read failed'));
    expect(await old).toBe(false);
    expect(events).toEqual(['evt-new']);
  });
  it('never reads when key is empty, not selected, or replaced',async()=>{
    const gate=createAuditWorklistScope();gate.select(qA);
    let calls=0;
    expect(await readCurrentAuditWorklist(gate,qB,0,
      async()=>{calls++;return page;},()=>{})).toBe(false);
    gate.select('');
    expect(await readCurrentAuditWorklist(gate,'',0,
      async()=>{calls++;return page;},()=>{})).toBe(false);
    expect(calls).toBe(0);
  });
  it('fails closed for wrong offset/limit and invalid source rows, before presentation',async()=>{
    for(const broken of [
      {...page,offset:50},{...page,limit:100},
      {...page,total:-1},{...page,has_more:true},
      {...page,items:[{...event,id:''}]},
      {...page,items:[{...event,at:Infinity}]},
    ]){
      const gate=createAuditWorklistScope();gate.select(qA);
      let renders=0;
      await expect(readCurrentAuditWorklist(gate,qA,0,
        async()=>broken,()=>{renders++;}))
        .rejects.toThrow('AUDIT_PAGE_SCOPE_INVALID');
      expect(renders).toBe(0);
    }
  });
  it('accepts an empty page beyond current total after concurrent record deletion',async()=>{
    const gate=createAuditWorklistScope();
    const key='offset=50&limit=50&request_id=request-A';
    gate.select(key);
    const shown:AuditScopedPage[]=[];
    const result={...page,total:40,offset:50,items:[],has_more:false};
    expect(await readCurrentAuditWorklist(gate,key,50,async()=>result,
      value=>shown.push(value))).toBe(true);
    expect(shown).toEqual([result]);
  });
  it('first-render projection never displays A under B after filter or page change',()=>{
    const stored={key:qA,value:page};
    expect(currentAuditPageProjection(stored,qA)).toEqual(page);
    expect(currentAuditPageProjection(stored,qB)).toBeNull();
    expect(currentAuditPageProjection(stored,'')).toBeNull();
  });
  it('editing any filter never silently changes an already applied search',()=>{
    expect(auditDraftHasChanges(empty,{...empty})).toBe(false);
    for(const name of Object.keys(empty) as (keyof AuditFilterValues)[]){
      expect(auditDraftHasChanges({...empty,[name]:'changed'},empty)).toBe(true);
    }
  });
  it('exports only a loaded currently selected result without unapplied edits',()=>{
    const stored={key:qA,value:page};
    expect(canExportAuditPage(stored,qA,false,false)).toBe(true);
    expect(canExportAuditPage(stored,qB,false,false)).toBe(false);
    expect(canExportAuditPage(stored,qA,true,false)).toBe(false);
    expect(canExportAuditPage(stored,qA,false,true)).toBe(false);
    expect(canExportAuditPage(null,qA,false,false)).toBe(false);
  });
  it('renders applied query and pending draft without manufacturing export permission',()=>{
    const active={...empty,request_id:'request-A'};
    const html=renderToStaticMarkup(createElement(AuditCurrentSearchSummary,{
      applied:active,draft:{...active,request_id:'request-B'},
      offset:0,page,
    }));
    expect(html).toContain('Applied search');
    expect(html).toContain('request-A');
    expect(html).toContain('Filter edits not yet applied');
    expect(html).toContain('Search evidence');
    expect(html).not.toContain('request-B');
    expect(html).not.toContain('Export complete');
  });
  it('escapes untrusted applied actor and request strings',()=>{
    const html=renderToStaticMarkup(createElement(AuditCurrentSearchSummary,{
      applied:{...empty,actor:'<script>alert(1)</script>'},
      draft:{...empty,actor:'<script>alert(1)</script>'},offset:0,page,
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
