/** Synthetic route transport for actual Grant Notifications component interactions.
 * No account, real mailbox, production server or approval endpoint is accessed.
 */
import {expect,type Page} from '@playwright/test';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEmailDesign} from '../../src/email_design';
import type {NotificationTemplateSet} from '../../src/types';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const events=['requested','reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown'];
export function renderSyntheticEmail(payload:unknown):Promise<any>{return new Promise((resolve,reject)=>{
 const child=execFile('uv',['run','--frozen','python','tests/render_email_canvas_sample.py'],{cwd:root,maxBuffer:1024*1024,timeout:15000},(error,stdout,stderr)=>error?reject(Error(stderr)):resolve(JSON.parse(stdout)));
 child.stdin!.end(JSON.stringify(payload));
});}
export async function notificationsFixture(page:Page){
 const state={rows:[{id:'synthetic-template',name:'Synthetic approval',enabled:true,design:createEmailDesign(),
  templates:Object.fromEntries(events.map(event=>[event,{subject:'Request {{request_title}}',body:'Please review {{target}}.'}])),
  created_at:1,updated_at:1,draft_revision:1,published_revision:1,active_policy_count:2}] as NotificationTemplateSet[],
  failSave:false,commitThenFail:false,writes:[] as string[],errors:[] as string[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),method=route.request().method(),pathname=url.pathname;
  if(pathname==='/api/v1/notification-template-sets'&&method==='GET'){await route.fulfill({json:state.rows});return;}
  if(pathname.endsWith('/notification-variables')){await route.fulfill({json:{variables:['request_title','request_url','external_id','action_kind','target','reason','deadline','decision_state','execution_state']}});return;}
  if(pathname.endsWith('/notification-branding')){await route.fulfill({json:{brand_name:'DataRelay Grant',sender_display_name:'DataRelay Grant',logo_asset:''}});return;}
  if(pathname==='/api/v1/notification-template-defaults'&&method==='GET'){
   const locale=url.searchParams.get('locale')==='ko'?'ko':'en';
   const value=await new Promise<string>((resolve,reject)=>execFile('uv',['run','--frozen','python','-c','import json,sys; from grant.email_localization import event_defaults; print(json.dumps({"locale":sys.argv[1],"templates":event_defaults(sys.argv[1])}))',locale],{cwd:root,timeout:15000},(error,stdout)=>error?reject(error):resolve(stdout)));
   await route.fulfill({json:JSON.parse(value)});return;
  }
  if(pathname.endsWith('/preview')){
   const match=pathname.match(/^\/api\/v1\/notification-template-sets\/([^/]+)\/preview$/);
   const payload=route.request().postDataJSON(),row=match?state.rows.find(item=>item.id===decodeURIComponent(match[1]))!:state.rows[0];
   const result=await renderSyntheticEmail({...payload,template:payload.template??{name:row.name,templates:row.templates,design:row.design}});
   await route.fulfill({json:{...result,transport_accepted:false,receipt_confirmed:false,execution_allowed:false}});return;
  }
  if(pathname==='/api/v1/notification-template-sets/synthetic-template'&&method==='PUT'){
   state.writes.push('PUT');const payload=route.request().postDataJSON();expect(payload.expected_updated_at).toBe(state.rows[0].updated_at);
   if(!state.failSave||state.commitThenFail)state.rows[0]={...state.rows[0],...payload,updated_at:state.rows[0].updated_at+1,draft_revision:(state.rows[0].draft_revision??1)+1};
   if(state.failSave)await route.abort('failed');else await route.fulfill({json:state.rows[0]});return;
  }
  state.writes.push(method+' '+pathname);await route.abort();
 });
 await page.goto('/tests/canvas/notifications.html');
 await expect(page.getByLabel('Email template inventory')).toContainText('Synthetic approval');
 return state;
}
export async function openSyntheticEditor(page:Page){
 await page.getByRole('button',{name:'Edit draft',exact:true}).first().click();
 await expect(page.locator('[data-email-block="message"]')).toBeVisible();
}
export async function saveSyntheticDraft(page:Page){
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Review notification template set',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm template set update',exact:true}).click();
}
