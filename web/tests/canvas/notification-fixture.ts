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

function normalizeSyntheticLogo(data_base64:string):Promise<any>{return new Promise((resolve,reject)=>{
 const child=execFile('uv',['run','--frozen','python','tests/normalize_email_logo_sample.py'],{cwd:root,maxBuffer:1024*1024,timeout:15000},(error,stdout,stderr)=>error?reject(Error(stderr)):resolve(JSON.parse(stdout)));
 child.stdin!.end(JSON.stringify({data_base64}));
});}
export async function notificationsFixture(page:Page){
 const state={rows:[{id:'synthetic-template',name:'Synthetic approval',enabled:true,design:createEmailDesign(),
  templates:Object.fromEntries(events.map(event=>[event,{subject:'Request {{request_title}}',body:'Please review {{target}}.'}])),
  created_at:1,updated_at:1,draft_revision:1,published_revision:1,active_policy_count:2}] as NotificationTemplateSet[],
  failSave:false,commitThenFail:false,writes:[] as string[],errors:[] as string[],assets:new Map<string,any>()};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),method=route.request().method(),pathname=url.pathname;
  if(pathname==='/api/v1/notification-template-sets'&&method==='GET'){await route.fulfill({json:state.rows});return;}
  if(pathname.endsWith('/notification-variables')){await route.fulfill({json:{variables:['request_title','request_url','external_id','action_kind','target','reason','deadline','decision_state','execution_state']}});return;}
  if(pathname.endsWith('/notification-branding')){await route.fulfill({json:{brand_name:'DataRelay Grant',sender_display_name:'DataRelay Grant',logo_asset:''}});return;}
  if(pathname==='/api/v1/notification-assets'&&method==='POST'){
   const payload=route.request().postDataJSON(),value=await normalizeSyntheticLogo(payload.data_base64);
   state.assets.set(value.id,value);await route.fulfill({status:201,json:{id:value.id,media_type:value.media_type,width:value.width,height:value.height,bytes:value.bytes,immutable:true}});return;
  }
  if(pathname.startsWith('/api/v1/notification-assets/')&&method==='GET'){
   const id=decodeURIComponent(pathname.slice('/api/v1/notification-assets/'.length)),value=state.assets.get(id);
   if(!value){await route.fulfill({status:404,json:{error:{code:'NOTIFICATION_ASSET_NOT_FOUND'}}});return;}
   await route.fulfill({json:value});return;
  }
  if(pathname==='/api/v1/notification-template-defaults'&&method==='GET'){
   const locale=url.searchParams.get('locale')==='ko'?'ko':'en';
   const value=await new Promise<string>((resolve,reject)=>execFile('uv',['run','--frozen','python','-c','import json,sys; from grant.email_localization import event_defaults; print(json.dumps({"locale":sys.argv[1],"templates":event_defaults(sys.argv[1])}))',locale],{cwd:root,timeout:15000},(error,stdout)=>error?reject(error):resolve(stdout)));
   await route.fulfill({json:JSON.parse(value)});return;
  }
  if(pathname.endsWith('/preview')){
   const match=pathname.match(/^\/api\/v1\/notification-template-sets\/([^/]+)\/preview$/);
   const payload=route.request().postDataJSON(),row=match?state.rows.find(item=>item.id===decodeURIComponent(match[1]))!:state.rows[0];
   const template=structuredClone(payload.template??{name:row.name,templates:row.templates,design:row.design});
   const logoId=template.design?.logo_asset_id;if(logoId){const logo=state.assets.get(logoId);if(!logo){await route.fulfill({status:422,json:{error:{code:'NOTIFICATION_ASSET_NOT_FOUND'}}});return;}template.logo={id:logo.id,media_type:logo.media_type,width:logo.width,height:logo.height,data_base64:logo.data_base64};}
   const result=await renderSyntheticEmail({...payload,verification_mode:payload.verification_mode??'EMAIL_PIN',template});
   await route.fulfill({json:{...result,event:payload.event,...(match?{template_set_id:row.id,template_updated_at:row.updated_at,preview_hash:'c'.repeat(64)}:{template_set_id:''}),transport_accepted:false,receipt_confirmed:false,execution_allowed:false}});return;
  }
  if(pathname==='/api/v1/notification-template-sets'&&method==='POST'){
   state.writes.push('POST');const payload=route.request().postDataJSON();
   const copy={...state.rows[0],...payload,id:'synthetic-copy',enabled:true,created_at:3,updated_at:3,draft_revision:1,published_revision:null,active_policy_count:0};
   state.rows.push(copy);await route.fulfill({status:201,json:copy});return;
  }
  if(pathname==='/api/v1/notification-template-sets/synthetic-template/usage'&&method==='GET'){
   await route.fulfill({json:{template_id:'synthetic-template',total:2,offset:0,limit:20,has_more:false,policies:[
    {id:'policy-version-1',profile_id:'policy-1',version:3,name:'Production changes',lifecycle:'ACTIVE',updated_at:1},
    {id:'policy-version-2',profile_id:'policy-2',version:1,name:'Emergency approvals',lifecycle:'ACTIVE',updated_at:1},
   ]}});return;
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
