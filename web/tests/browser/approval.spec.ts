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
  await expect.poll(async()=>{const r=await request.get(f.receiver);return (await r.json()).mail.some((m:string)=>m.includes('Approved: Browser request '+pass)&&m.includes(id));}).toBeTruthy();
  row=await(await request.get('/api/v1/requests/'+id,{headers})).json();expect(row.execution_state).toBe('NOT_STARTED');
  const first=await request.post('/api/v1/requests/'+id+'/consume',{headers,data:claim});expect(first.status()).toBe(200);expect((await first.json()).replay).toBe(false);
  const second=await request.post('/api/v1/requests/'+id+'/consume',{headers,data:claim});expect((await second.json()).replay).toBe(true);
  expect((await request.post('/api/v1/requests/'+id+'/result',{headers,data:{...claim,status:'REPORTED_SUCCEEDED',evidence:'Isolated consumer fixture, not a real DataRelay integration'}})).status()).toBe(200);
  await expect.poll(async()=>{const r=await request.get(f.receiver);return (await r.json()).mail.some((m:string)=>m.includes('Execution succeeded: Browser request '+pass)&&m.includes(id));}).toBeTruthy();
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


test('Foundation login and grouped Grant shell follow the DataRelay family layout',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
 await page.goto('/home');await expect(page.locator('.dr-auth-layout')).toBeVisible();await expect(page.getByRole('heading',{name:'Welcome to DataRelay',exact:true})).toBeVisible();await expect(page.getByText('Please sign in to continue.',{exact:true})).toBeVisible();
 await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(fixture().password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();await expect(page.getByText('Work',{exact:true})).toBeVisible();await expect(page.getByText('Configuration',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Account & security',exact:true})).toBeVisible();await expect(page.getByText('Work that needs a human decision',{exact:true})).toBeVisible();
 await context.close();
});

// Existing permitted desktop Chromium journey; does not replace the blocked
// 320/375 mobile login/account-menu acceptance gate.
test('Foundation member account action reaches personal security, not Administration',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 await login(page,'approver');
 await page.getByRole('button',{name:'Account & security',exact:true}).click();
 await expect(page.getByText('Active sessions',{exact:true})).toBeVisible();
 await expect(page.getByText('Change password',{exact:true})).toBeVisible();
 await page.goto('/system');
 await expect(page.getByText('Page unavailable',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).first().click();
 await expect(page.getByLabel('Username',{exact:true})).toBeVisible();
 await context.close();
});

test('Foundation administration and mobile approval page are real adapters',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();await login(page,'admin');
 await page.goto('/system');await expect(page.getByText('System Health',{exact:true})).toBeVisible();await expect(page.getByText('User Management',{exact:true})).toBeVisible();await page.getByRole('button',{name:'View System Health',exact:true}).click();await expect(page.getByText('Approval database',{exact:true})).toBeVisible();
 await page.goto('/integrations');await expect(page.locator('strong').filter({hasText:/^Isolated DataRelay fixture$/})).toBeVisible();await page.getByRole('button',{name:'Test connection',exact:true}).click();await expect(page.getByText('Test event accepted by the HTTP receiver. This is not approval or execution.')).toBeVisible();
 await page.goto('/notifications');await expect(page.getByRole('heading',{name:'Notifications',exact:true,level:2})).toBeVisible();
 await page.goto('/profiles');await expect(page.getByRole('heading',{name:'Approval policies',exact:true,level:2})).toBeVisible();
 await page.goto('/security');await expect(page.getByText('Active sessions',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Set up MFA',exact:true})).toBeVisible();
 await page.screenshot({path:'../.e2e/screenshots/mobile-security.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await context.close();
});


test('Grant Foundation Administration shortcuts and selected task focus work on desktop',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/system');
  await expect(page.getByRole('button',{name:'My account & MFA',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Configuration preview',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View System Health',exact:true}).click();
  await expect(page.getByTestId('grant-admin-selected-detail')).toBeFocused();
  await expect(page.getByText('Approval database',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'My account & MFA',exact:true}).click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByText('Active sessions',{exact:true})).toBeVisible();
  await page.goto('/system');
  await page.getByRole('button',{name:'Configuration preview',exact:true}).click();
  await expect(page).toHaveURL(/\/integrations$/);
 }finally{await context.close();}
});

test('requester cancels and creates a newly approved replacement through the UI',async({browser,request})=>{
 const f=fixture();const context=await browser.newContext();const page=await context.newPage();
 await login(page,'requester');await page.getByRole('button',{name:'New request',exact:true}).click();
 await page.getByLabel('Approval profile',{exact:true}).selectOption(f.profile_id);
 await page.getByLabel('Request title',{exact:true}).fill('Replace cancelled operation');
 await page.getByLabel('Target',{exact:true}).fill('old-test-target');
 await page.getByRole('button',{name:'Submit request',exact:true}).click();
 await expect(page.getByText('Exact action to be approved',{exact:true})).toBeVisible();
 const oldId=page.url().split('/').pop()!;
 await page.getByRole('button',{name:'Cancel request',exact:true}).click();
 await page.getByRole('button',{name:'Confirm cancelled',exact:true}).click();
 await page.getByRole('button',{name:'Create replacement request',exact:true}).click();
 await expect(page.getByLabel('Target',{exact:true})).toHaveValue('old-test-target');
 await page.getByLabel('Target',{exact:true}).fill('new-test-target');
 await page.getByRole('button',{name:'Submit request',exact:true}).click();
 await expect(page.getByText('Exact action to be approved',{exact:true})).toBeVisible();
 const newId=page.url().split('/').pop()!;expect(newId).not.toBe(oldId);
 const headers={authorization:'Bearer '+f.token};
 const row=await(await request.get('/api/v1/requests/'+newId,{headers})).json();
 expect(row.predecessor_id).toBe(oldId);expect(row.state).toBe('AWAITING');expect(row.action.target).toBe('new-test-target');
 expect((await request.post('/api/v1/requests/'+newId+'/consume',{headers,data:{execution_id:crypto.randomUUID(),action_hash:row.action_hash}})).status()).toBe(409);
 await expect(page.getByRole('button',{name:oldId,exact:true})).toBeVisible();
 await expect(page.getByText('Replacement revision comparison',{exact:true})).toBeVisible();
 await expect(page.getByText('Changed action.target',{exact:true})).toBeVisible();
 await expect(page.getByText('Previous authorization cannot be reused.',{exact:false})).toBeVisible();
 await context.close();
});

test('administrator configures accounts/profile and explicitly revokes a scoped credential',async({browser,request})=>{
 const f=fixture();const context=await browser.newContext();const page=await context.newPage();
 await login(page,'admin');await page.goto('/system');
 await page.getByRole('button',{name:'Manage User Management',exact:true}).click();
 await page.getByLabel('New username',{exact:true}).fill('browser-member');
 await page.getByLabel('New user email',{exact:true}).fill('browser-member@example.invalid');
 await page.getByLabel('Initial password',{exact:true}).fill(f.password);
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByText('Account created. Share credentials through an approved secure channel.')).toBeVisible();
 await page.goto('/integrations');
 await page.getByLabel('Integration name',{exact:true}).fill('Configured through browser');
 await page.getByLabel('Registered callback URL',{exact:true}).fill(f.receiver);
 await page.getByRole('button',{name:'Create integration',exact:true}).click();
 await expect(page.getByText('Integration created. Assign a profile and use scoped credentials.')).toBeVisible();
 await page.getByLabel('Token integration',{exact:true}).selectOption({label:'Configured through browser'});
 const minted=page.waitForResponse(r=>r.url().endsWith('/api/v1/integrations/tokens')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Create scoped token',exact:true}).click();
 const credential=await(await minted).json();
 await page.getByRole('button',{name:'Hide credential',exact:true}).click();
 await page.getByLabel('Inspect credential integration',{exact:true}).selectOption({label:'Configured through browser'});
 await page.getByRole('button',{name:'Revoke credential',exact:true}).click();
 await page.getByRole('button',{name:'Keep credential',exact:true}).click();
 expect((await request.get('/api/v1/requests',{headers:{authorization:'Bearer '+credential.token}})).status()).toBe(200);
 await page.getByRole('button',{name:'Revoke credential',exact:true}).click();
 await page.getByRole('button',{name:'Confirm revoke',exact:true}).click();
 await expect(page.getByText('Credential revoked. Other credentials remain unchanged.')).toBeVisible();
 expect((await request.get('/api/v1/requests',{headers:{authorization:'Bearer '+credential.token}})).status()).toBe(401);
 await page.goto('/notifications');
 await page.getByRole('button',{name:'Create template set',exact:true}).click();
 await page.getByLabel('Template set name',{exact:true}).fill('Browser approval notifications');
 await page.getByLabel('Event subject',{exact:true}).fill('[Browser] {{request_title}}');
 await page.getByLabel('Event body',{exact:true}).fill('Approve {{action_kind}} on {{target}}.\n{{request_url}}');
 await page.getByRole('button',{name:'Create template set',exact:true}).click();
 await expect(page.getByText('Notification template set created.')).toBeVisible();
 await page.getByRole('button',{name:'Preview rendered message',exact:true}).click();
 await expect(page.getByText('[Browser] Sample approval request',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Send test to me',exact:true}).click();
 await expect(page.getByText(/Transport accepted: true.*Inbox receipt confirmed: false/)).toBeVisible();
 await page.goto('/profiles');
 await page.getByRole('button',{name:'Create policy',exact:true}).click();
 await page.getByLabel('Policy name',{exact:true}).fill('Configured browser approval');
 await page.getByLabel('Integration',{exact:true}).selectOption({label:'Configured through browser'});
 await page.getByLabel('Assigned approver',{exact:true}).selectOption({label:'approver'});
 await page.getByLabel('Allowed action kind',{exact:true}).fill('test.configured');
 await page.getByLabel('Notification template set',{exact:true}).selectOption({label:'Browser approval notifications'});
 await page.getByRole('button',{name:'Create draft',exact:true}).click();
 await expect(page.getByText('Draft saved. It is not live until it passes Testing and is explicitly activated.')).toBeVisible();
 await page.getByRole('button',{name:'Test policy',exact:true}).click();
 await expect(page.getByText('Policy moved to Testing. Use isolated test before activation.')).toBeVisible();
 await page.getByRole('button',{name:'Preview & Test',exact:true}).click();
 await page.getByRole('button',{name:'Run isolated test',exact:true}).click();
 await expect(page.getByText(/Isolated test: Configured browser approval v1/)).toBeVisible();
 await page.getByRole('button',{name:'Activate policy',exact:true}).click();
 await expect(page.getByText('Policy activated. Existing requests retain their original version snapshot.')).toBeVisible();
 await page.getByRole('button',{name:'Preview active resolution',exact:true}).click();
 await expect(page.getByText(/Resolved policy: Configured browser approval v1/)).toBeVisible();
 await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.getByText('Version / change history',{exact:true})).toBeVisible();
 await page.screenshot({path:'../.e2e/screenshots/configured-policy-notifications.png',fullPage:true});
 await context.close();
});

test('G4 administrator confirms escalation and reassignment in the browser',async({browser,request})=>{
 const f=fixture();const headers={authorization:'Bearer '+f.token};
 const created=await request.post('/api/v1/requests',{headers,data:{
  external_id:crypto.randomUUID(),profile_id:f.profile_id,title:'Browser G4 approval routing',
  action:{kind:'test.operation',target:'isolated-escalation-target',parameters:{}},
 }});
 expect(created.status()).toBe(202);const original=await created.json();
 const context=await browser.newContext();const page=await context.newPage();
 await login(page,'admin');await page.goto('/requests/'+original.id);
 await expect(page.getByText('Escalation',{exact:true})).toBeVisible();
 const escalation=page.getByLabel('Escalation target',{exact:true});
 await escalation.selectOption({index:1});
 await page.getByLabel('Escalation delay (minutes)',{exact:true}).fill('60');
 await page.getByRole('button',{name:'Review escalation',exact:true}).click();
 await expect(page.getByText('Confirm escalation schedule',{exact:true})).toBeVisible();
 let current=await(await request.get('/api/v1/requests/'+original.id,{headers})).json();
 expect(current.timeline.some((item:any)=>item.action==='request.escalation_configured')).toBe(false);
 await page.getByRole('button',{name:'Confirm routing change',exact:true}).click();
 await expect(page.getByText('Approval routing updated and recorded in the request audit trail.')).toBeVisible();
 current=await(await request.get('/api/v1/requests/'+original.id,{headers})).json();
 expect(current.timeline.some((item:any)=>item.action==='request.escalation_configured')).toBe(true);
 expect(current.state).toBe('AWAITING');
 expect(current.execution_state).toBe('NOT_STARTED');

 await page.getByLabel('Original approver',{exact:true}).selectOption(original.approver_id);
 const replacement=page.getByLabel('Replacement approver',{exact:true});
 await replacement.selectOption({index:1});
 const substitute=await replacement.inputValue();
 await page.getByLabel('Reassignment reason for audit',{exact:true}).fill('Browser on-call handoff');
 await page.getByRole('button',{name:'Review reassignment',exact:true}).click();
 await expect(page.getByText('Confirm approver reassignment',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm routing change',exact:true}).click();
 await expect(page.getByText('Approval routing updated and recorded in the request audit trail.')).toBeVisible();
 current=await(await request.get('/api/v1/requests/'+original.id,{headers})).json();
 expect(current.approval_plan.members).toEqual([substitute]);
 expect(current.timeline.some((item:any)=>item.action==='request.reassigned')).toBe(true);
 expect(current.execution_state).toBe('NOT_STARTED');
 await context.close();
});

test('G4 approver schedules, exercises and revokes own delegation without implicit approval',async({browser,request})=>{
 const context=await browser.newContext();const page=await context.newPage();
 await login(page,'approver');
 await page.goto('/delegations');
 await expect(page.getByText('Delegate my approvals',{exact:true})).toBeVisible();
 await page.getByLabel('Substitute approver',{exact:true}).selectOption({label:'stranger'});
 const substitute=await page.getByLabel('Substitute approver',{exact:true}).inputValue();
 await page.getByRole('button',{name:'Review delegation',exact:true}).click();
 await expect(page.getByText('Confirm time-bounded delegation',{exact:true})).toBeVisible();
 const before=await(await page.request.get('/api/v1/delegations')).json();
 expect(before.some((item:any)=>item.substitute_id===substitute)).toBe(false);
 await page.getByRole('button',{name:'Confirm delegation change',exact:true}).click();
 await expect(page.getByText('Delegation change recorded in the audit trail.')).toBeVisible();
 const during=await(await page.request.get('/api/v1/delegations')).json();
 const delegation=during.find((item:any)=>item.substitute_id===substitute);
 expect(delegation).toBeTruthy();
 expect(delegation.revoked_at).toBeNull();

 const f=fixture();const headers={authorization:'Bearer '+f.token};
 const created=await request.post('/api/v1/requests',{headers,data:{
  external_id:crypto.randomUUID(),profile_id:f.profile_id,title:'Delegated browser queue',
  action:{kind:'test.operation',target:'delegated-test-target',parameters:{}},
 }});
 expect(created.status()).toBe(202);const delegatedRequest=await created.json();
 const substituteContext=await browser.newContext();const substitutePage=await substituteContext.newPage();
 await login(substitutePage,'stranger');await substitutePage.goto('/approvals');
 await substitutePage.getByLabel('Work view',{exact:true}).selectOption('delegated');
 await expect(substitutePage.getByRole('button',{name:'Delegated browser queue',exact:true})).toBeVisible();
 await substitutePage.getByRole('button',{name:'Delegated browser queue',exact:true}).click();
 await expect(substitutePage.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
 const beforeDecision=await(await request.get('/api/v1/requests/'+delegatedRequest.id,{headers})).json();
 expect(beforeDecision.state).toBe('AWAITING');
 await substituteContext.close();

 await page.getByRole('button',{name:'Revoke',exact:true}).click();
 await expect(page.getByText('Confirm delegation revocation',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm delegation change',exact:true}).click();
 await expect(page.getByText('Delegation change recorded in the audit trail.')).toBeVisible();
 const after=await(await page.request.get('/api/v1/delegations')).json();
 expect(after.find((item:any)=>item.id===delegation.id).revoked_at).not.toBeNull();
 await context.close();
});

test('G4 delegated substitute finds and approves request through My approvals',async({browser,request})=>{
 const f=fixture();const headers={authorization:'Bearer '+f.token};
 const ownerContext=await browser.newContext();const substituteContext=await browser.newContext();
 const owner=await ownerContext.newPage(),substitute=await substituteContext.newPage();
 await login(owner,'approver');await owner.goto('/delegations');
 await owner.getByLabel('Substitute approver',{exact:true}).selectOption({label:'stranger'});
 await owner.getByRole('button',{name:'Review delegation',exact:true}).click();
 await owner.getByRole('button',{name:'Confirm delegation change',exact:true}).click();
 await expect(owner.getByText('Delegation change recorded in the audit trail.')).toBeVisible();

 const title='Delegated browser work queue';
 const created=await request.post('/api/v1/requests',{headers,data:{
  external_id:crypto.randomUUID(),profile_id:f.profile_id,title,
  action:{kind:'test.operation',target:'delegated-isolated-target',parameters:{}},
 }});
 expect(created.status()).toBe(202);const row=await created.json();
 await login(substitute,'stranger');await substitute.goto('/approvals');
 await expect(substitute.getByRole('button',{name:title,exact:true})).toBeVisible();
 await substitute.getByRole('button',{name:title,exact:true}).click();
 await expect(substitute.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
 await substitute.getByRole('button',{name:'Approve',exact:true}).click();
 await substitute.getByRole('button',{name:'Confirm approved',exact:true}).click();
 await expect(substitute.getByText('Recorded. Delivery and execution are tracked separately.')).toBeVisible();
 const result=await(await request.get('/api/v1/requests/'+row.id,{headers})).json();
 expect(result.state).toBe('APPROVED');
 expect(result.execution_state).toBe('NOT_STARTED');
 expect(result.decisions[0].actor_id).toBe(row.approver_id);
 await ownerContext.close();await substituteContext.close();
});

test('G5 two-user request for information pauses approval until response',async({browser,request})=>{
 const f=fixture();
 const requester=await browser.newContext(),approver=await browser.newContext();
 const rp=await requester.newPage(),ap=await approver.newPage();
 await login(rp,'requester');await login(ap,'approver');
 await rp.getByRole('button',{name:'New request',exact:true}).click();
 await rp.getByLabel('Approval profile',{exact:true}).selectOption(f.profile_id);
 await rp.getByLabel('Request title',{exact:true}).fill('G5 collaboration browser request');
 await rp.getByLabel('Target',{exact:true}).fill('isolated-target-for-info');
 await rp.getByRole('button',{name:'Submit request',exact:true}).click();
 await expect(rp.getByText('Exact action to be approved',{exact:true})).toBeVisible();
 const id=rp.url().split('/').pop()!;
 const headers={authorization:'Bearer '+f.token};
 const original=await(await request.get('/api/v1/requests/'+id,{headers})).json();

 await ap.goto('/requests/'+id);
 await expect(ap.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
 await ap.getByLabel('Message purpose',{exact:true}).selectOption('REQUEST_INFO');
 await ap.getByLabel('Message (up to 2000 characters; no credentials)',{exact:true}).fill('Can you confirm the change reference?');
 await ap.getByRole('button',{name:'Confirm message',exact:true}).click();
 await expect(ap.getByText('Waiting for requester information',{exact:true})).toBeVisible();
 await expect(ap.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);
 let current=await(await request.get('/api/v1/requests/'+id,{headers})).json();
 expect(current.action_hash).toBe(original.action_hash);
 expect(current.collaboration_state).toBe('INFO_REQUESTED');
 expect(current.execution_state).toBe('NOT_STARTED');

 await rp.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(rp.getByText('Waiting for requester information',{exact:true})).toBeVisible();
 await rp.getByLabel('Message purpose',{exact:true}).selectOption('INFO_RESPONSE');
 await rp.getByLabel('Message (up to 2000 characters; no credentials)',{exact:true}).fill('Change reference: CRQ-1001');
 await rp.getByRole('button',{name:'Confirm message',exact:true}).click();
 await expect(rp.getByText('Provide requested information',{exact:true})).toBeVisible();
 await ap.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(ap.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
 await ap.getByRole('button',{name:'Approve',exact:true}).click();
 await ap.getByRole('button',{name:'Confirm approved',exact:true}).click();
 await expect(ap.getByText('Recorded. Delivery and execution are tracked separately.')).toBeVisible();
 current=await(await request.get('/api/v1/requests/'+id,{headers})).json();
 expect(current.state).toBe('APPROVED');
 expect(current.action_hash).toBe(original.action_hash);
 expect(current.execution_state).toBe('NOT_STARTED');
 expect(current.comments.map((m:any)=>m.kind)).toEqual(['REQUEST_INFO','INFO_RESPONSE']);
 await requester.close();await approver.close();
});

test('G6 requester inbox server search, pagination and role scoping',async({browser})=>{
  const f=fixture();
  const context=await browser.newContext();
  const page=await context.newPage();
  await login(page,'requester');
  const session=await(await context.request.get('/api/v1/auth/session')).json();
  const csrf=session.csrf;
  expect(typeof csrf).toBe('string');
  const uniqueBatch='G6-'+crypto.randomUUID().slice(0,8);
  for(let i=0;i<57;i++){
    const created=await context.request.post('/api/v1/requests',{
      headers:{'x-csrf-token':csrf},
      data:{
        external_id:crypto.randomUUID(),profile_id:f.profile_id,
        title:uniqueBatch+' '+(i%26===0?'Needle-':'Bulk-')+i,
        action:{kind:'test.operation',target:'bulk-isolated-target',parameters:{}},
      },
    });
    expect(created.status()).toBe(202);
  }

  await page.goto('/my-requests');
  await expect(page.getByRole('heading',{name:'My requests',exact:true})).toBeVisible();
  await page.getByLabel('Search requests',{exact:true}).fill(uniqueBatch);
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await expect(page.getByText('Page 1 · 50 loaded',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(page.getByText('Page 2 · 7 loaded',{exact:true})).toBeVisible();
  await page.getByLabel('Search requests',{exact:true}).fill(uniqueBatch+' Needle');
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  for(const index of [0,26,52]){
    await expect(page.getByRole('button',{name:uniqueBatch+' Needle-'+index,exact:true})).toBeVisible();
  }
  await expect(page.getByText('Page 1 · 3 loaded',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:uniqueBatch+' Bulk-56',exact:true})).toHaveCount(0);
  await context.close();
});

test('G6 approver inbox needs/held/recent views reflect decisions',async({browser,request})=>{
 const f=fixture();const headers={authorization:'Bearer '+f.token};
 const senderContext=await browser.newContext();
 const senderPage=await senderContext.newPage();
 await login(senderPage,'requester');
 const senderSession=await(await senderContext.request.get('/api/v1/auth/session')).json();
 async function create(title:string){
   const created=await senderContext.request.post('/api/v1/requests',{
     headers:{'x-csrf-token':senderSession.csrf},
     data:{
       external_id:crypto.randomUUID(),profile_id:f.profile_id,title,
       action:{kind:'test.operation',target:'inbox-target',parameters:{}},
     },
   });
   expect(created.status()).toBe(202);return await created.json();
 }
 const hold=await create('G6 hold work');
 const ask=await create('G6 ask work');
 const context=await browser.newContext(),page=await context.newPage();
 await login(page,'approver');await page.goto('/approvals');
 await expect(page.getByRole('button',{name:'G6 hold work',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'G6 hold work',exact:true}).click();
 await page.getByRole('button',{name:'Hold',exact:true}).click();
 await page.getByRole('button',{name:'Confirm held',exact:true}).click();
 await page.goto('/approvals');
 await page.getByLabel('Work view',{exact:true}).selectOption('held');
 await page.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByRole('button',{name:'G6 hold work',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'G6 ask work',exact:true})).toHaveCount(0);
 await page.goto('/requests/'+ask.id);
 await page.getByLabel('Message purpose',{exact:true}).selectOption('REQUEST_INFO');
 await page.getByLabel('Message (up to 2000 characters; no credentials)',{exact:true}).fill('What is the ticket?');
 await page.getByRole('button',{name:'Confirm message',exact:true}).click();
 await page.goto('/approvals');
 await expect(page.getByRole('button',{name:'G6 ask work',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'G6 hold work',exact:true}).click();
 await page.getByRole('button',{name:'Approve',exact:true}).click();
 await page.getByRole('button',{name:'Confirm approved',exact:true}).click();
 await page.goto('/approvals');
 await page.getByLabel('Work view',{exact:true}).selectOption('recent');
 await page.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByRole('button',{name:'G6 hold work',exact:true})).toBeVisible();
 const latest=await(await request.get('/api/v1/requests/'+hold.id,{headers})).json();
 expect(latest.state).toBe('APPROVED');
 await context.close();await senderContext.close();
});

test('G1 browser policy selectors create a matching request and keep latest draft on disable',async({browser,request})=>{
 const f=fixture();
 const adminContext=await browser.newContext(),reqContext=await browser.newContext();
 const ap=await adminContext.newPage(),rp=await reqContext.newPage();
 await login(ap,'admin');
 const session=await(await adminContext.request.get('/api/v1/auth/session')).json();
 const headers={'x-csrf-token':session.csrf};
 const policyInput={
   name:'Browser selector v1', integration_id:f.integration_id,
   approver_id:f.users.approver.id, action_kind:'test.selector',
   tenant_selector:'finance',environment:'production',
   severity:'high',risk_level:'critical',
 };
 const created=await adminContext.request.post('/api/v1/profiles',{headers,data:policyInput});
 expect(created.status()).toBe(201);const policy=await created.json();
 expect((await adminContext.request.post('/api/v1/profiles/'+policy.id+'/test',{headers})).status()).toBe(200);
 expect((await adminContext.request.post('/api/v1/profiles/'+policy.id+'/activate',{headers})).status()).toBe(200);

 await login(rp,'requester');
 await rp.goto('/requests/new');
 await rp.getByLabel('Approval profile',{exact:true}).selectOption(policy.id);
 for(const [field,value] of [
   ['Source tenant','finance'],
   ['Environment','production'],
   ['Severity','high'],
   ['Risk level','critical'],
 ]){
   await expect(rp.getByLabel(field,{exact:true})).toHaveValue(value);
 }
 await rp.getByLabel('Request title',{exact:true}).fill('Selector matched browser request');
 await rp.getByLabel('Target',{exact:true}).fill('safe-selector-test');
 await rp.getByRole('button',{name:'Submit request',exact:true}).click();
 await expect(rp.getByText('Exact action to be approved',{exact:true})).toBeVisible();
 const id=rp.url().split('/').pop()!;
 const actual=await(await adminContext.request.get('/api/v1/requests/'+id)).json();
 expect(actual.source.tenant_id).toBe('finance');
 expect(actual.source.environment).toBe('production');
 expect(actual.source.severity).toBe('high');
 expect(actual.source.risk_level).toBe('critical');
 expect(actual.profile_id).toBe(policy.id);

 const updated=await adminContext.request.put('/api/v1/profiles/'+policy.id,{
   headers,data:{...policyInput,name:'Browser selector draft v2'},
 });
 expect(updated.status()).toBe(200);expect((await updated.json()).version).toBe(2);
 await ap.goto('/profiles');
 const policyRow=ap.getByRole('row').filter({hasText:'Browser selector draft v2'});
 await policyRow.getByRole('button',{name:'Open',exact:true}).click();
 await expect(ap.getByLabel('Policy name',{exact:true})).toHaveValue('Browser selector draft v2');
 await ap.getByRole('button',{name:'Disable active',exact:true}).click();
 await expect(ap.getByText('Active policy version disabled.')).toBeVisible();
 await expect(ap.getByLabel('Policy name',{exact:true})).toHaveValue('Browser selector draft v2');
 await adminContext.close();await reqContext.close();
});

test('G7 administrator operations counts open the exact request exception queue',async({browser,request})=>{
 const f=fixture();const headers={authorization:'Bearer '+f.token};
 const title='G7 pending operator '+crypto.randomUUID().slice(0,8);
 const created=await request.post('/api/v1/requests',{headers,data:{
  external_id:crypto.randomUUID(),profile_id:f.profile_id,title,
  action:{kind:'test.operation',target:'operations-isolated-target',parameters:{}},
 }});
 expect(created.status()).toBe(202);
 const context=await browser.newContext();const page=await context.newPage();
 await login(page,'admin');
 await page.goto('/operations');
 await expect(page.getByRole('heading',{name:'Operational work and exceptions',exact:true})).toBeVisible();
 await expect(page.getByText('Integration delivery health',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Pending approvals/})).toBeVisible();
 await page.getByRole('button',{name:/Pending approvals/}).click();
 await expect(page).toHaveURL(/\/operations\/queue\/pending$/);
 await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('ops_pending');
 await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
 await page.goto('/operations');
 await page.getByRole('button',{name:'Isolated DataRelay fixture',exact:true}).click();
 await expect(page).toHaveURL(/\/operations\/integration\/[a-f0-9-]{36}$/);
 await expect(page.getByLabel('Integration',{exact:true})).toHaveValue(f.integration_id);
 await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
 await context.close();
});

test('G7 operations surface is unavailable to non-administrators',async({browser,request})=>{
 const context=await browser.newContext();const page=await context.newPage();
 await login(page,'approver');
 await page.goto('/operations');
 await expect(page.getByText('Page unavailable',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Operations',exact:true})).toHaveCount(0);
 const result=await context.request.get('/api/v1/admin/operations');
 expect(result.status()).toBe(403);
 await context.close();
});

test('G8 integration health and safe export are visible without revealing credentials',async({browser})=>{
 const f=fixture();
 const context=await browser.newContext();
 const page=await context.newPage();
 await login(page,'admin');
 await page.goto('/integrations');
 await page.getByLabel('Credential purpose',{exact:true}).selectOption('executor');
 await expect(page.getByRole('checkbox',{name:'request:create',exact:true})).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:'request:read',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'grant:consume',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'result:write',exact:true})).toBeChecked();
 await expect(page.getByText('Mixed integration credential',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Integration health and activity',{exact:true})).toBeVisible();
 await page.getByLabel('Inspect integration health',{exact:true}).selectOption({label:'Isolated DataRelay fixture'});
 await expect(page.getByText('Credential roles',{exact:true})).toBeVisible();
 await expect(page.getByText('Connection test history',{exact:true})).toBeVisible();
 await expect(page.getByText('Credential audit history',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Preview safe export',exact:true}).click();
 await expect(page.getByText('No automatic import or execution',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save JSON manifest',exact:true})).toBeVisible();
 const downloadPending=page.waitForEvent('download');
 await page.getByRole('button',{name:'Save JSON manifest',exact:true}).click();
 const downloaded=await downloadPending;
 expect(downloaded.suggestedFilename()).toBe('grant-configuration-manifest.json');
 const downloadedPath=await downloaded.path();
 expect(downloadedPath).toBeTruthy();
 const downloadedManifest=JSON.parse(fs.readFileSync(downloadedPath!,'utf8'));
 expect(downloadedManifest.secret_free).toBe(true);
 expect(downloadedManifest.import_supported).toBe(false);
 const exported=await context.request.get('/api/v1/integrations/configuration-export');
 expect(exported.status()).toBe(200);
 const manifest=await exported.json();
 expect(manifest.import_supported).toBe(false);
 expect(manifest.executable_restore_bundle).toBe(false);
 expect(JSON.stringify(manifest)).not.toContain(f.token);
 await context.close();
});

test('G8 integration diagnostics are unavailable to non-administrators',async({browser})=>{
 const context=await browser.newContext();
 const page=await context.newPage();
 await login(page,'approver');
 await page.goto('/integrations');
 await expect(page.getByText('Page unavailable',{exact:true})).toBeVisible();
 const response=await context.request.get('/api/v1/integrations/configuration-export');
 expect(response.status()).toBe(403);
 await context.close();
});

test('G9 admin audit search, CSV/JSON download and request evidence chain',async({browser,request})=>{
 const f=fixture();
 const title='G9 audit browser '+crypto.randomUUID().slice(0,8);
 const created=await request.post('/api/v1/requests',{
  headers:{authorization:'Bearer '+f.token},
  data:{external_id:crypto.randomUUID(),profile_id:f.profile_id,title,
   action:{kind:'test.operation',target:'audit-disposable-target',parameters:{}} },
 });
 expect(created.status()).toBe(202);
 const item=await created.json();
 const context=await browser.newContext(),page=await context.newPage();
 await login(page,'admin');await page.goto('/audit');
 await expect(page.getByText('Audit evidence explorer',{exact:true})).toBeVisible();
 await page.getByLabel('Request ID',{exact:true}).fill(item.id);
 // Wait for this exact filtered API response, not stale rows from the initial audit page.
 const filtered=page.waitForResponse(response=>{
  const url=new URL(response.url());
  return url.pathname==='/api/v1/admin/audit/search' && url.searchParams.get('request_id')===item.id;
 });
 await page.getByRole('button',{name:'Search evidence',exact:true}).click();
 const filteredResponse=await filtered;
 expect(filteredResponse.status()).toBe(200);
 const scopedPage=await filteredResponse.json();
 expect(scopedPage.items.length).toBeGreaterThan(0);
 expect(scopedPage.items.every((event:{request_id:string|null})=>event.request_id===item.id)).toBe(true);
 expect(scopedPage.items.some((event:{action:string})=>event.action==='request.created')).toBe(true);
 // The UI must render the filtered result, not just return correct API data.
 await expect(page.getByRole('cell',{name:'request.created',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Inspect request evidence',exact:true}).first().click();
 await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toBeVisible();
 await expect(page.getByText(item.action_hash,{exact:true})).toBeVisible();
 for(const format of ['json','csv'] as const){
   const pending=page.waitForEvent('download');
   await page.getByRole('button',{name:format==='csv'?'Export CSV':'Export JSON',exact:true}).click();
   const transfer=await pending;
   expect(transfer.suggestedFilename()).toBe('grant-audit-export.'+format);
   const filePath=await transfer.path();
   expect(filePath).toBeTruthy();
   const downloaded=fs.readFileSync(filePath!,'utf8');
   expect(downloaded).toContain('request.created');
   expect(downloaded).not.toContain('password_hash');
 }
 await context.close();
});

test('G9 audit search and export reject non-administrator browser',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 await login(page,'approver');
 await page.goto('/audit');
 await expect(page.getByText('Page unavailable',{exact:true})).toBeVisible();
 const denied=await context.request.get('/api/v1/admin/audit/search');
 expect(denied.status()).toBe(403);
 const exportDenied=await context.request.get('/api/v1/admin/audit/export?format=csv');
 expect(exportDenied.status()).toBe(403);
 await context.close();
});

test('G9 safe configuration import preview is a nonmutating conflict report',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 await login(page,'admin');
 await page.goto('/integrations');
 const before=await(await context.request.get('/api/v1/integrations/configuration-export')).json();
 await page.getByRole('button',{name:'Preview safe export',exact:true}).click();
 await page.getByRole('button',{name:'Preview import conflicts',exact:true}).click();
 await expect(page.getByText('Dry-run only — no changes applied',{exact:true})).toBeVisible();
 await expect(page.getByText('No permissions, credentials, approval policy or notification content can be imported from this preview.',{exact:true})).toBeVisible();
 const after=await(await context.request.get('/api/v1/integrations/configuration-export')).json();
 expect(after).toEqual(before);
 await context.close();
});

test('G10 real browser sign-out revokes audit access and cached administrator view',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 await login(page,'admin');
 await page.goto('/audit');
 await expect(page.getByText('Audit evidence explorer',{exact:true})).toBeVisible();
 const previous=await context.request.get('/api/v1/admin/audit/search');
 expect(previous.status()).toBe(200);
 await page.getByRole('button',{name:'Sign out',exact:true}).first().click();
 await expect(page.getByLabel('Username',{exact:true})).toBeVisible();
 const revoked=await context.request.get('/api/v1/admin/audit/search');
 expect(revoked.status()).toBe(401);
 await page.goto('/audit');
 await expect(page.getByLabel('Username',{exact:true})).toBeVisible();
 await expect(page.getByText('Audit evidence explorer',{exact:true})).toHaveCount(0);
 await context.close();
});

test('G12 Home action summary includes authorized approvals after the first 100 results',async({browser,request})=>{
 test.setTimeout(120000);
 const f=fixture();
 const headers={authorization:'Bearer '+f.token};
 // Supporting disposable Chromium fixture evidence only: not direct-persona acceptance.
 for(let index=0;index<101;index++){
  const created=await request.post('/api/v1/requests',{headers,data:{
   external_id:'home-multipage-'+crypto.randomUUID(),profile_id:f.profile_id,
   title:'Home paging regression '+index,
   action:{kind:'test.operation',target:'isolated-test-target',parameters:{}}
  }});
  expect(created.status()).toBe(202);
 }
 const context=await browser.newContext(),page=await context.newPage();
 try{
  await login(page,'approver');
  let expected=0;
  for(let offset=0;offset<1000;offset+=100){
   const response=await context.request.get('/api/v1/requests?limit=100&offset='+offset+'&view=needs');
   expect(response.status()).toBe(200);
   const rows=await response.json();
   expected+=rows.length;
   if(rows.length<100)break;
  }
  expect(expected).toBeGreaterThanOrEqual(101);
  await page.goto('/home');
  const summary=page.getByRole('region',{name:'Action summary'});
  await expect(summary.getByRole('button',{name:/Needs my decision/}).locator('strong')).toHaveText(String(expected));
  await expect(page.getByText('Summary totals are lower bounds',{exact:false})).toHaveCount(0);
 }finally{
  await context.close();
 }
});

test('G12 Home overdue drilldown opens an actual filtered approval queue',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 try{
  await login(page,'approver');
  await page.goto('/home');
  const filtered=page.waitForResponse(response=>{
   const url=new URL(response.url());
   return url.pathname==='/api/v1/requests' && url.searchParams.get('view')==='overdue';
  });
  await page.getByRole('region',{name:'Action summary'}).getByRole('button',{name:/Overdue/}).click();
  const response=await filtered;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/approvals\?view=overdue$/);
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('overdue');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('needs');
  await expect(page).toHaveURL(/\/approvals$/);
  // Unknown URL views must not override the server-approved queue selector.
  await page.goto('/approvals?view=ops_execution_unknown');
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('needs');
 }finally{await context.close();}
});

test('G12 a queue preset survives Clear filters outside the Home deep link',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/operations/queue/pending');
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('ops_pending');
  await page.getByLabel('Work view',{exact:true}).selectOption('ops_overdue');
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('ops_overdue');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('ops_pending');
 }finally{await context.close();}
});
