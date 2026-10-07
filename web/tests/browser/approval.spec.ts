import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const fixture=()=>JSON.parse(fs.readFileSync(path.resolve('../.e2e/fixture.json'),'utf8'));
async function login(page:Page,name:string){await page.goto('/requests');await page.getByLabel('Username',{exact:true}).fill(name);await page.getByLabel('Password',{exact:true}).fill(fixture().password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Requests',exact:true})).toBeVisible();}

// Each pass logs in independently. No borrowed cookie or mocked auth is used.
for(const pass of [1,2]){
 test(`two-user approve / hold / deny / cancel and real transports - pass ${pass}`,async({browser,request})=>{
  const f=fixture();const requester=await browser.newContext();const approver=await browser.newContext();const stranger=await browser.newContext();
  const rp=await requester.newPage(),ap=await approver.newPage(),sp=await stranger.newPage();
  const errors:string[]=[];for(const p of [rp,ap,sp])p.on('pageerror',e=>errors.push(e.message));
  await login(rp,'requester');await login(ap,'approver');await login(sp,'stranger');
  await rp.getByRole('button',{name:'New request',exact:true}).click();
  await rp.getByLabel('Approval profile',{exact:true}).selectOption(f.profile_id);
  await rp.getByLabel('Request title',{exact:true}).fill('Browser request '+pass);
  await rp.getByLabel('Target',{exact:true}).fill('isolated-test-target');
  await rp.getByLabel('Reason',{exact:true}).fill('Two-user end-to-end verification; no external production action.');
  await rp.getByRole('button',{name:'Submit request',exact:true}).click();
  await expect(rp.getByText('Exact action to be approved',{exact:true})).toBeVisible();
  const url=rp.url();const id=url.split('/').pop()!;
  await expect.poll(async()=>{const r=await request.get(f.receiver);return (await r.json()).mail.some((m:string)=>m.includes(id));}).toBeTruthy();
  // Email GET previews do not decide, and a different user cannot read this request.
  await sp.goto(url);await expect(sp.getByText('REQUEST NOT FOUND',{exact:true})).toBeVisible();
  await ap.goto(url);await expect(ap.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await ap.getByRole('button',{name:'Hold',exact:true}).click();await ap.getByRole('button',{name:'Confirm held',exact:true}).click();
  await expect(ap.getByText('Recorded. Delivery and execution are tracked separately.')).toBeVisible();
  const headers={authorization:'Bearer '+f.token};let row=await(await request.get('/api/v1/requests/'+id,{headers})).json();
  expect(row.state).toBe('HELD');expect(row.execution_state).toBe('NOT_STARTED');
  const claim={execution_id:'browser-pass-'+pass,action_hash:row.action_hash};
  expect((await request.post('/api/v1/requests/'+id+'/consume',{headers,data:claim})).status()).toBe(409);
  await ap.getByRole('button',{name:'Approve',exact:true}).click();
  // Choosing the UI button is not yet the committed decision.
  row=await(await request.get('/api/v1/requests/'+id,{headers})).json();expect(row.state).toBe('HELD');
  await ap.getByRole('button',{name:'Confirm approved',exact:true}).click();
  await expect.poll(async()=>{const r=await request.get(f.receiver);return (await r.json()).events.some((e:any)=>e.request_id===id&&e.state==='APPROVED');}).toBeTruthy();
  row=await(await request.get('/api/v1/requests/'+id,{headers})).json();expect(row.execution_state).toBe('NOT_STARTED');
  const first=await request.post('/api/v1/requests/'+id+'/consume',{headers,data:claim});expect(first.status()).toBe(200);expect((await first.json()).replay).toBe(false);
  const second=await request.post('/api/v1/requests/'+id+'/consume',{headers,data:claim});expect((await second.json()).replay).toBe(true);
  expect((await request.post('/api/v1/requests/'+id+'/result',{headers,data:{...claim,status:'REPORTED_SUCCEEDED',evidence:'Isolated consumer fixture, not a real DataRelay integration'}})).status()).toBe(200);
  await ap.getByRole('button',{name:'Refresh',exact:true}).click();await expect(ap.getByText('Reported execution result',{exact:true})).toBeVisible();
  fs.mkdirSync('../.e2e/screenshots',{recursive:true});await ap.screenshot({path:`../.e2e/screenshots/approval-pass-${pass}.png`,fullPage:true});
  for(const outcome of ['DENIED','CANCELLED']){
   const created=await request.post('/api/v1/requests',{headers,data:{external_id:crypto.randomUUID(),profile_id:f.profile_id,title:'Browser '+outcome,action:{kind:'test.operation',target:'isolated-test-target',parameters:{}}}});
   expect(created.status()).toBe(202);const item=await created.json();
   if(outcome==='DENIED'){await ap.goto('/requests/'+item.id);await ap.getByRole('button',{name:'Deny',exact:true}).click();await ap.getByRole('button',{name:'Confirm denied',exact:true}).click();await expect(ap.getByText('Recorded. Delivery and execution are tracked separately.')).toBeVisible();}
   else {expect((await request.post('/api/v1/requests/'+item.id+'/cancel',{headers,data:{expected_revision:1}})).status()).toBe(200);}
   expect((await request.post('/api/v1/requests/'+item.id+'/consume',{headers,data:{execution_id:crypto.randomUUID(),action_hash:item.action_hash}})).status()).toBe(409);
  }
  expect(errors).toEqual([]);await requester.close();await approver.close();await stranger.close();
 });
}

test('Foundation administration and mobile approval page are real adapters',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();await login(page,'admin');
 await page.goto('/system');await expect(page.getByText('Accounts',{exact:true})).toBeVisible();await expect(page.getByText('Approval database',{exact:true})).toBeVisible();
 await page.goto('/integrations');await expect(page.locator('strong').filter({hasText:/^Isolated DataRelay fixture$/})).toBeVisible();await page.getByRole('button',{name:'Test connection',exact:true}).click();await expect(page.getByText('Test event accepted by the HTTP receiver. This is not approval or execution.')).toBeVisible();
 await page.goto('/security');await expect(page.getByText('Active sessions',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Set up MFA',exact:true})).toBeVisible();
 await page.screenshot({path:'../.e2e/screenshots/mobile-security.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await context.close();
});
