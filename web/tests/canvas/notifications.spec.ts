import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEmailDesign} from '../../src/email_design';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const events=['requested','reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown'];
function render(payload:unknown):Promise<any>{return new Promise((resolve,reject)=>{
 const child=execFile('uv',['run','--frozen','python','tests/render_email_canvas_sample.py'],{cwd:root,maxBuffer:1024*1024,timeout:15000},(error,stdout,stderr)=>error?reject(Error(stderr)):resolve(JSON.parse(stdout)));
 child.stdin!.end(JSON.stringify(payload));
});}
test('real Notifications composition opens inventory and saves only the reviewed current draft',async({page})=>{
 let row={id:'synthetic-template',name:'Synthetic approval',enabled:true,design:createEmailDesign(),templates:Object.fromEntries(events.map(event=>[event,{subject:'Request {{request_title}}',body:'Please review {{target}}.'}])),created_at:1,updated_at:1,draft_revision:1,published_revision:1,active_policy_count:2};
 const writes:string[]=[];const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/v1/**',async route=>{
  const url=route.request().url(),method=route.request().method();
  if(url.endsWith('/notification-template-sets')&&method==='GET'){await route.fulfill({json:[row]});return;}
  if(url.endsWith('/notification-variables')){await route.fulfill({json:{variables:['request_title','request_url','external_id','action_kind','target','reason','deadline','decision_state','execution_state']}});return;}
  if(url.endsWith('/notification-branding')){await route.fulfill({json:{brand_name:'DataRelay Grant',sender_display_name:'DataRelay Grant',logo_asset:''}});return;}
  if(url.endsWith('/preview')){
   const payload=route.request().postDataJSON();const result=await render({...payload,template:payload.template??{name:row.name,templates:row.templates,design:row.design}});
   await route.fulfill({json:{...result,transport_accepted:false,receipt_confirmed:false,execution_allowed:false}});return;
  }
  if(url.endsWith('/notification-template-sets/synthetic-template')&&method==='PUT'){
   writes.push(method);const payload=route.request().postDataJSON();expect(payload.expected_updated_at).toBe(1);
   expect(payload.templates.requested.body).toBe('Reviewed integration change.');row={...row,...payload,updated_at:2,draft_revision:2};await route.fulfill({json:row});return;
  }
  writes.push(method+' '+url);await route.abort();
 });
 await page.goto('/tests/canvas/notifications.html');
 await expect(page.getByLabel('Email template inventory')).toContainText('Used by 2 active policies');
 await page.getByRole('button',{name:'Edit draft',exact:true}).click();
 await expect(page.getByLabel('Canvas-first email editor')).toBeVisible();
 await expect(page.locator('[data-email-block="message"]')).toBeVisible();
 await page.getByLabel('Event body').fill('Reviewed integration change.');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Review notification template set',{exact:true})).toBeVisible();expect(writes).toEqual([]);
 await page.getByRole('button',{name:'Confirm template set update',exact:true}).click();
 await expect.poll(()=>writes).toEqual(['PUT']);
 await expect(page.getByLabel('Email draft publication status')).toContainText('Saved draft');
 expect(errors).toEqual([]);
});
