import {test,expect,type Page} from '@playwright/test';

const route='/tests/canvas/operations-destination-pending.html';
const summary={
 as_of:1792700000,recovery_paused:false,counts:{
  total:1,pending:1,overdue:0,held:0,approved:0,denied:0,expired:0,cancelled:0,
  approved_unused:0,execution_unknown:0,execution_failed:0,email_failed:0,
  webhook_failed:0,delivery_failed:0,
 },
 approval_latency_seconds:null,approval_latency_sample_count:0,
 integrations:[],decision_email_security:{},semantics:{},
};
type Traffic={writes:string[];unexpected:string[];errors:string[]};
async function setup(page:Page,onDestination:(route:import('@playwright/test').Route)=>Promise<void>){
 const state:Traffic={writes:[],unexpected:[],errors:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){state.writes.push(req.method()+' '+path);return route.abort();}
  if(path==='/api/v1/admin/operations')return route.fulfill({json:summary});
  if(path==='/api/v1/admin/notification-destinations')return onDestination(route);
  state.unexpected.push(path);return route.abort();
 });
 await page.goto('/tests/canvas/operations-destination-pending.html');
 await expect(page.getByRole('heading',{name:'Operational work and exceptions'})).toBeVisible();
 return state;
}
test('pending destination GET is checking, not a false server error',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve});
 let entered=false;
 const state=await setup(page,async route=>{entered=true;await held;await route.fulfill({json:[]});});
 try{
  await expect.poll(()=>entered).toBe(true);
  await expect(page.getByRole('status').filter({hasText:'Checking current notification destinations'})).toBeVisible();
  await expect(page.getByText('Delivery readiness unavailable',{exact:true})).toHaveCount(0);
 }finally{release();}
 await expect(page.getByText('No notification destinations supplied by the product.',{exact:false})).toBeVisible();
 expect(state).toEqual({writes:[],unexpected:[],errors:[]});
});
test('failed destination GET becomes unavailable, refresh succeeds without stale failure',async({page})=>{
 let n=0;
 const state=await setup(page,async route=>{
  n++;
  if(n===1)return route.fulfill({status:503,json:{error:{code:'TEMPORARY_READ_FAILURE'}}});
  return route.fulfill({json:[]});
 });
 await expect(page.getByText('Delivery readiness unavailable',{exact:true})).toBeVisible();
 await expect.poll(()=>n).toBe(1);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(page.getByText('Delivery readiness unavailable',{exact:true})).toHaveCount(0);
 await expect(page.getByText('No notification destinations supplied by the product.',{exact:false})).toBeVisible();
 expect(n).toBe(2);
 expect(state).toEqual({writes:[],unexpected:[],errors:[]});
});
