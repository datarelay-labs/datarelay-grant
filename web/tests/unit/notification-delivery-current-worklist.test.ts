import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {NotificationDelivery} from '../../src/types';
import {
  createDeliveryQueryReadScope,readCurrentDeliveryWorklist,
  currentDeliveryPageProjection,deliveryDraftHasChanges,
  canReviewCurrentDelivery,DeliveryAppliedSearchSummary,
  type ScopedDeliveryPage, type DeliverySearchFilters,
} from '../../src/notification_delivery_current_worklist';

const empty:DeliverySearchFilters={state:'ALL',event:'ALL',requestId:''};
const queryA='/notification-deliveries?limit=50&offset=0&request_id=A';
const queryB='/notification-deliveries?limit=50&offset=0&request_id=B';
const row:NotificationDelivery={
  id:'delivery-1',request_id:'A',event_type:'requested',state:'FAILED',
  attempts:2,last_error:'SMTP 451',available_at:1000,delivered_at:null,
  created_at:1000,transport_accepted:false,receipt_confirmed:false,
};
const page:ScopedDeliveryPage={deliveries:[row],total:1,offset:0,limit:50,has_more:false};
function deferred<T>(){
 let resolve!:(v:T)=>void,reject!:(e:Error)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
describe('B4 Delivery Health task-first current saved filter authority',()=>{
 it('latest query B loads while A is pending and drops A success',async()=>{
  const gate=createDeliveryQueryReadScope(),a=deferred<ScopedDeliveryPage>(),seen:string[]=[];
  gate.select(queryA);
  const old=readCurrentDeliveryWorklist(gate,queryA,0,()=>a.promise,
    result=>seen.push(result.deliveries[0].id));
  gate.select(queryB);
  expect(await readCurrentDeliveryWorklist(gate,queryB,0,
    async()=>({...page,deliveries:[{...row,id:'delivery-B',request_id:'B'}]}),
    result=>seen.push(result.deliveries[0].id))).toBe(true);
  a.resolve(page);expect(await old).toBe(false);
  expect(seen).toEqual(['delivery-B']);
 });
 it('late same-query success or error never overwrites latest read',async()=>{
  const gate=createDeliveryQueryReadScope(),old=deferred<ScopedDeliveryPage>();
  gate.select(queryA);const seen:string[]=[];
  const before=readCurrentDeliveryWorklist(gate,queryA,0,()=>old.promise,
    result=>seen.push(result.deliveries[0].id));
  await readCurrentDeliveryWorklist(gate,queryA,0,
    async()=>({...page,deliveries:[{...row,id:'latest'}]}),
    result=>seen.push(result.deliveries[0].id));
  old.reject(Error('old SMTP read error'));
  expect(await before).toBe(false);expect(seen).toEqual(['latest']);
 });
 it('invalid selected query never performs any GET',async()=>{
  const gate=createDeliveryQueryReadScope();gate.select(queryB);
  let calls=0;
  expect(await readCurrentDeliveryWorklist(gate,queryA,0,
    async()=>{calls++;return page;},()=>undefined)).toBe(false);
  gate.select('');
  expect(await readCurrentDeliveryWorklist(gate,'',0,
    async()=>{calls++;return page;},()=>undefined)).toBe(false);
  expect(calls).toBe(0);
 });
 it('rejects wrong saved page, invented delivery IDs and invalid pagination',async()=>{
  for(const invalid of [
    {...page,offset:50},{...page,limit:100},{...page,total:-1},
    {...page,has_more:true},{...page,deliveries:[{...row,id:''}]},
    {...page,deliveries:[{...row,attempts:-1}]},
    {...page,deliveries:[{...row,created_at:Infinity}]},
  ]){
    const gate=createDeliveryQueryReadScope();gate.select(queryA);
    let shown=0;
    await expect(readCurrentDeliveryWorklist(gate,queryA,0,
      async()=>invalid,()=>{shown++})).rejects.toThrow('DELIVERY_PAGE_SCOPE_INVALID');
    expect(shown).toBe(0);
  }
 });
 it('allows legitimately empty stale page after concurrent delivery deletion',async()=>{
  const gate=createDeliveryQueryReadScope();
  const key='/notification-deliveries?limit=50&offset=50&request_id=A';
  gate.select(key);
  expect(await readCurrentDeliveryWorklist(gate,key,50,
    async()=>({...page,total:42,offset:50,deliveries:[]}),
    ()=>undefined)).toBe(true);
 });
 it('hides page A before B request finishes and never renders old resend',()=>{
  const stored={key:queryA,value:page};
  expect(currentDeliveryPageProjection(stored,queryA)).toEqual(page);
  expect(currentDeliveryPageProjection(stored,queryB)).toBeNull();
 });
 it('unapplied filter edits block Review resend even with valid old rows',()=>{
  const stored={key:queryA,value:page};
  expect(canReviewCurrentDelivery(stored,queryA,false,false,false)).toBe(true);
  expect(canReviewCurrentDelivery(stored,queryB,false,false,false)).toBe(false);
  expect(canReviewCurrentDelivery(stored,queryA,true,false,false)).toBe(false);
  expect(canReviewCurrentDelivery(stored,queryA,false,true,false)).toBe(false);
  expect(canReviewCurrentDelivery(stored,queryA,false,false,true)).toBe(false);
  expect(canReviewCurrentDelivery(null,queryA,false,false,false)).toBe(false);
 });
 it('every independently edited state/event/request target is flagged as unapplied',()=>{
  expect(deliveryDraftHasChanges(empty,{...empty})).toBe(false);
  expect(deliveryDraftHasChanges({...empty,state:'FAILED'},empty)).toBe(true);
  expect(deliveryDraftHasChanges({...empty,event:'reminder'},empty)).toBe(true);
  expect(deliveryDraftHasChanges({...empty,requestId:'other'},empty)).toBe(true);
 });
 it('visible applied filter truth escapes untrusted request strings and never claims inbox delivery',()=>{
  const applied={...empty,requestId:'<script>alert(1)</script>'};
  const html=renderToStaticMarkup(createElement(DeliveryAppliedSearchSummary,{
    applied,draft:{...applied,requestId:'other'},offset:0,page,
  }));
  expect(html).toContain('Applied delivery filters');
  expect(html).toContain('Filter edits not yet applied');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Inbox receipt verified');
  expect(html).not.toContain('other</');
 });
});
