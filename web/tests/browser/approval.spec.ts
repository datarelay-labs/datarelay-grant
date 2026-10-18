import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const fixture=()=>JSON.parse(fs.readFileSync(process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'),'utf8'));
async function login(page:Page,name:string){await page.goto('/home');await page.getByLabel('Username',{exact:true}).fill(name);await page.getByLabel('Password',{exact:true}).fill(fixture().password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();}

// Only test-only isolated SMTP MIME is decoded here. Long capability URLs
// are quoted-printable-folded by Python's real mail transport.
function decodeFixtureMime(message:string):string{
 return message.replace(/=\r?\n/g,'').replace(
  /=([0-9A-F]{2})/gi,(_text,hex:string)=>String.fromCharCode(parseInt(hex,16)),
 );
}

// P0-2C: disposable installed Chromium, exact live Grant RequestDetail.
// Creation is through the existing requester Review → Confirm UI, not an
// injected backend write. No protected external execution or mail recipient.
test('P0-2C task-first activity stays collapsed, keyboard accessible and does not conceal human decision', async ({browser}) => {
 const f = fixture();
 const requester = await browser.newContext({viewport:{width:1280,height:800}});
 const approver = await browser.newContext({viewport:{width:1280,height:800}});
 try {
  const rp = await requester.newPage();
  const ap = await approver.newPage();
  await login(rp,'requester');
  await rp.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
  await rp.getByLabel('Request type',{exact:true}).selectOption(f.profile_id);
  await rp.getByLabel('Request title',{exact:true}).fill('Decision-first activity regression');
  await rp.getByLabel('Target',{exact:true}).fill('isolated-test-target');
  await rp.getByLabel('Reason',{exact:true}).fill('Synthetic role-scoped UI disclosure test');
  await rp.getByRole('button',{name:'Review request',exact:true}).click();
  await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
  await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
  const url = rp.url();
  await login(ap,'approver');
  await ap.goto(url);
  await expect(ap.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await expect(ap.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
  const activity = ap.locator('details.grant-activity-disclosure');
  await expect(activity).toBeVisible();
  await expect(activity).not.toHaveAttribute('open','');
  await expect(activity.locator(':scope > summary')).toContainText('Activity & supporting evidence');
  await expect(activity.getByText('Reviewer decisions',{exact:true})).toBeHidden();
  await activity.locator(':scope > summary').focus();
  await activity.locator(':scope > summary').press('Enter');
  await expect(activity).toHaveAttribute('open','');
  await expect(activity.getByText('Reviewer decisions',{exact:true})).toBeVisible();
  await expect(activity.getByText('Request timeline',{exact:true})).toBeVisible();
  await expect(ap.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await activity.locator(':scope > summary').press('Space');
  await expect(activity).not.toHaveAttribute('open','');
  await expect(activity.getByText('Reviewer decisions',{exact:true})).toBeHidden();
 } finally {
  await requester.close();
  await approver.close();
 }
});

// Each pass logs in independently. No borrowed cookie or mocked auth is used.
for(const pass of [1,2]){
 test(`two-user approve / hold / deny / cancel and real transports - pass ${pass}`,async({browser,request})=>{
  const f=fixture();const requester=await browser.newContext();const approver=await browser.newContext();const stranger=await browser.newContext();
  const rp=await requester.newPage(),ap=await approver.newPage(),sp=await stranger.newPage();
  const errors:string[]=[];for(const p of [rp,ap,sp])p.on('pageerror',e=>errors.push(e.message));
  await login(rp,'requester');await login(ap,'approver');await login(sp,'stranger');
  await rp.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
  await rp.getByLabel('Request type',{exact:true}).selectOption(f.profile_id);
  await rp.getByLabel('Request title',{exact:true}).fill('Browser request '+pass);
  await rp.getByLabel('Target',{exact:true}).fill('isolated-test-target');
  await rp.getByLabel('Reason',{exact:true}).fill('Two-user end-to-end verification; no external production action.');
  await rp.getByRole('button',{name:'Review request',exact:true}).click();
  await expect(rp.getByRole('button',{name:'Confirm create request',exact:true})).toBeVisible();
  await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
  await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
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
 await page.goto('/home');await expect(page.locator('[data-testid="gdc-login-centered"]')).toBeVisible();await expect(page.locator('.dr-control-reference')).toBeVisible();await expect(page.getByRole('heading',{name:'Welcome to DataRelay',exact:true})).toBeVisible();await expect(page.getByText('Please sign in to continue.',{exact:true})).toBeVisible();
 const password=page.getByLabel('Password',{exact:true});await expect(password).toHaveAttribute('type','password');await expect(page.getByRole('button',{name:'Show password',exact:true})).toBeVisible();await page.getByRole('button',{name:'Show password',exact:true}).click();await expect(password).toHaveAttribute('type','text');await page.getByRole('button',{name:'Hide password',exact:true}).click();await expect(password).toHaveAttribute('type','password');
 await page.getByLabel('Username',{exact:true}).fill('admin');await password.fill(fixture().password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();await expect(page.locator('.dr-control-shell')).toBeVisible();await expect(page.getByRole('button',{name:'Toggle color theme',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'User workspace',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Approval administration',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Account & security',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Good to see you, admin',exact:true})).toBeVisible();
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
 await page.goto('/system');await expect(page.getByText('System Health',{exact:true})).toBeVisible();await expect(page.getByText('User Management',{exact:true})).toBeVisible();for(const label of ['Management Access (ACL)','Multi-Factor Authentication','Roles & Permissions','Sessions']) await expect(page.getByText(label,{exact:true})).toBeVisible();await page.getByTestId('core.health').getByRole('button', { name: 'View', exact: true }).click();await expect(page.getByText('Approval database',{exact:true})).toBeVisible();
 await page.goto('/integrations');await expect(page.getByRole('list',{name:'Registered connections mobile list'}).getByText('Isolated DataRelay fixture',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Review connection test',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm connection test',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm connection test',exact:true}).click();
 await expect(page.getByText('Diagnostic transport accepted by the receiver.',{exact:false})).toBeVisible();
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
  await expect(page.getByTestId('core.https').getByRole('button', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByTestId('core.password').getByRole('button', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByTestId('core.network').getByRole('button', { name: 'View', exact: true })).toBeVisible();
  await page.getByTestId('core.https').getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByTestId('grant-admin-selected-detail')).toBeFocused();
  await expect(page.getByText('Configured HTTPS surface',{exact:true})).toBeVisible();
  await expect(page.getByText('Deployment operator',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to administration tasks',exact:true}).click();
  await page.getByTestId('core.network').getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByTestId('grant-admin-selected-detail')).toBeFocused();
  await expect(page.getByText('Configured network surface',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to administration tasks',exact:true}).click();
  await page.getByTestId('core.password').getByRole('button', { name: 'View', exact: true }).click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByText('Change password',{exact:true})).toBeVisible();
  await page.goto('/system');
  await page.getByTestId('core.health').getByRole('button', { name: 'View', exact: true }).click();
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

test('SM-2 display timezone default and personal override require review and persist on real Grant routes',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/system');
  await page.getByTestId('core.timezone').getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.getByText('Platform display timezone',{exact:true})).toBeVisible();
  await expect(page.getByText('UTC',{exact:true}).first()).toBeVisible();
  await page.getByLabel('Default IANA timezone',{exact:true}).fill('Asia/Seoul');
  await page.getByRole('button',{name:'Review default timezone',exact:true}).click();
  await expect(page.getByText('Proposed default: Asia/Seoul.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Confirm default timezone',exact:true}).click();
  await expect(page.getByText('Platform display timezone default saved.',{exact:false})).toBeVisible();
  await expect(page.getByText('Asia/Seoul',{exact:true}).first()).toBeVisible();

  await page.goto('/security');
  await expect(page.getByText('Display timezone',{exact:true})).toBeVisible();
  await expect(page.getByText('Asia/Seoul',{exact:true}).first()).toBeVisible();
  await page.getByLabel('Personal IANA timezone',{exact:true}).fill('America/New_York');
  await page.getByRole('button',{name:'Review timezone change',exact:true}).click();
  await expect(page.getByText('Proposed override: America/New_York.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Confirm timezone change',exact:true}).click();
  await expect(page.getByText('Display timezone preference saved.',{exact:false})).toBeVisible();
  await expect(page.getByText('America/New_York',{exact:true}).first()).toBeVisible();

  // Restore the disposable fixture so later browser tests inherit the canonical default.
  await page.getByLabel('Personal IANA timezone',{exact:true}).fill('');
  await page.getByRole('button',{name:'Review timezone change',exact:true}).click();
  await page.getByRole('button',{name:'Confirm timezone change',exact:true}).click();
  await expect(page.getByText('Use platform default',{exact:true})).toBeVisible();
  await page.goto('/system');
  await page.getByTestId('core.timezone').getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByLabel('Default IANA timezone',{exact:true}).fill('UTC');
  await page.getByRole('button',{name:'Review default timezone',exact:true}).click();
  await page.getByRole('button',{name:'Confirm default timezone',exact:true}).click();
  await expect(page.getByText('UTC',{exact:true}).first()).toBeVisible();
 }finally{await context.close();}
});

// Synthetic fixture and one existing administrator session only. This is UI
// regression evidence, NOT independently authenticated full User E2E.
test('G9 configuration preview shows manual migration tasks without an Apply action',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/integrations');
  await page.getByRole('button',{name:'Diagnostics',exact:true}).click();
  await page.getByRole('button',{name:'Preview safe export',exact:true}).click();
  await expect(page.getByText('No automatic import or execution',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Preview import conflicts',exact:true}).click();
  const readiness=page.getByTestId('grant-configuration-readiness');
  await expect(readiness).toBeVisible();
  await expect(readiness.getByText('Required administrator actions',{exact:true})).toBeVisible();
  await expect(readiness.getByText('Automatic import and activation are unavailable.',{exact:false})).toBeVisible();
  await expect(readiness.getByRole('heading',{name:'Approval policies',exact:true})).toBeVisible();
  await expect(readiness.getByText('Select authorized local approvers',{exact:false}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Apply configuration'})).toHaveCount(0);
 }finally{await context.close();}
});

// Disposable browser_server fixture, one administrator only. Not independent-user E2E.
test('G9 v2 imports explicitly mapped settings as disabled Drafts via the real admin UI',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  const exportResponse=await context.request.get('/api/v1/admin/configuration/export-v2');
  expect(exportResponse.status()).toBe(200);
  const bundle=await exportResponse.json();
  expect(bundle.schema_version).toBe(2);
  expect(bundle.policies.length).toBeGreaterThan(0);
  for(const policy of bundle.policies)policy.config.name='Browser imported '+policy.config.name;
  for(const template of bundle.templates)template.name='Browser imported '+template.name;
  await page.goto('/integrations');
  await page.getByRole('button',{name:'Diagnostics',exact:true}).click();
  await page.getByTestId('grant-v2-json-file').setInputFiles({
   name:'isolated-v2-bundle.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page.getByRole('button',{name:'Validate Draft-only import'})).toBeVisible();
  for(const source of bundle.integrations){
   await page.getByLabel('Map source integration: '+source.name).selectOption({index:1});
  }
  for(const id of new Set(bundle.policies.map((p:any)=>p.config.approver_id))){
   await page.getByLabel('Map source approver: '+id).selectOption({label:'approver'});
  }
  await page.getByRole('button',{name:'Validate Draft-only import'}).click();
  const preview=page.getByTestId('grant-v2-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Ready for Draft-only import',{exact:true})).toBeVisible();
  await page.getByLabel('Import confirmation',{exact:true}).fill('IMPORT_DRAFTS_ONLY');
  await page.getByRole('button',{name:'Create reviewed Drafts only'}).click();
  await expect(page.getByText('Disabled Draft import recorded',{exact:true})).toBeVisible();
  const read=await context.request.get('/api/v1/profiles');
  expect(read.status()).toBe(200);
  const policies=await read.json();
  const created=policies.find((p:any)=>p.name===bundle.policies[0].config.name);
  expect(created).toBeTruthy();
  expect(created.lifecycle).toBe('DRAFT');
  expect(created.enabled).toBe(false);
  await expect(page.getByRole('button',{name:'Create reviewed Drafts only'})).toHaveCount(0);
 }finally{await context.close();}
});

test('requester cancels and creates a newly approved replacement through the UI',async({browser,request})=>{
 const f=fixture();const context=await browser.newContext();const page=await context.newPage();
 await login(page,'requester');await page.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
 await page.getByLabel('Request type',{exact:true}).selectOption(f.profile_id);
 await page.getByLabel('Request title',{exact:true}).fill('Replace cancelled operation');
 await page.getByLabel('Target',{exact:true}).fill('old-test-target');
 await page.getByRole('button',{name:'Review request',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm create request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm create request',exact:true}).click();
 await expect(page.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
 const oldId=page.url().split('/').pop()!;
 await page.getByRole('button',{name:'Cancel request',exact:true}).click();
 await page.getByRole('button',{name:'Confirm cancelled',exact:true}).click();
 await page.getByRole('button',{name:'Create replacement request',exact:true}).click();
 await expect(page.getByLabel('Target',{exact:true})).toHaveValue('old-test-target');
 await page.getByLabel('Target',{exact:true}).fill('new-test-target');
 await page.getByRole('button',{name:'Review request',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm create request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm create request',exact:true}).click();
 await expect(page.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
 const newId=page.url().split('/').pop()!;expect(newId).not.toBe(oldId);
 const headers={authorization:'Bearer '+f.token};
 const row=await(await request.get('/api/v1/requests/'+newId,{headers})).json();
 expect(row.predecessor_id).toBe(oldId);expect(row.state).toBe('AWAITING');expect(row.action.target).toBe('new-test-target');
 expect((await request.post('/api/v1/requests/'+newId+'/consume',{headers,data:{execution_id:crypto.randomUUID(),action_hash:row.action_hash}})).status()).toBe(409);
 await expect(page.getByRole('button',{name:'View prior request',exact:true})).toBeVisible();
 await expect(page.locator('code').filter({hasText:oldId})).toBeVisible();
 await expect(page.getByText('Replacement revision comparison',{exact:true})).toBeVisible();
 await expect(page.getByText('Changed action.target',{exact:true})).toBeVisible();
 await expect(page.getByText('Previous authorization cannot be reused.',{exact:false})).toBeVisible();
 await context.close();
});

test('administrator configures accounts/profile and explicitly revokes a scoped credential',async({browser,request})=>{
 test.setTimeout(300000);
 // Synthetic one-time bearer credential: clipboard permission exists only in
 // this disposable Chromium context, never on a real administrator account.
 const f=fixture();
 const context=await browser.newContext({
  permissions:['clipboard-read','clipboard-write'],
 });
 const page=await context.newPage();
 await login(page,'admin');await page.goto('/system');
 await page.getByTestId('core.users').getByRole('button', { name: 'Manage', exact: true }).click();
 await page.getByLabel('New username',{exact:true}).fill('browser-member');
 await page.getByLabel('New user email',{exact:true}).fill('browser-member@example.invalid');
 await page.getByLabel('Initial password',{exact:true}).fill(f.password);
 await page.getByRole('button',{name:'Review account creation',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review before creating account',exact:true})).toBeVisible();
 await expect(page.getByText('Provided privately; never displayed in review.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm create account',exact:true}).click();
 await expect(page.getByText('Grant acknowledged the new account. Provide the initial credential through an approved private channel; no email or business execution was sent.',{exact:true})).toBeVisible();
 await page.goto('/integrations');
 // Registration stores the exact installation-approved receiver only after
 // explicit Review -> Confirm. A successful POST still needs Refresh.
 const tasks=page.getByRole('navigation',{name:'Integration tasks'});
 await tasks.getByRole('button',{name:'Add connection',exact:true}).click();
 await page.getByLabel('Integration name',{exact:true}).fill('Configured through browser');
 await page.getByLabel('Decision verification minimum',{exact:true}).selectOption('EMAIL_PIN');
 await page.getByLabel('Registered callback URL',{exact:true}).fill(f.receiver);
 await page.getByRole('button',{name:'Review connection registration',exact:true}).click();
 await page.getByRole('button',{name:'Confirm create connection',exact:true}).click();
 await expect(page.getByText('Registration acknowledged by the server.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Refresh saved connections',exact:true}).click();
 await tasks.getByRole('button',{name:'Credential tools',exact:true}).click();
 await page.getByLabel('Token integration',{exact:true}).selectOption({label:'Configured through browser'});
 await page.getByRole('button',{name:'Review scoped credential',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm create credential',exact:true})).toBeVisible();
 const minted=page.waitForResponse(r=>r.url().endsWith('/api/v1/integrations/tokens')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Confirm create credential',exact:true}).click();
 const credential=await(await minted).json();
 await expect(page.getByRole('button',{name:'Copy credential',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Copy credential',exact:true}).click();
 await expect(page.getByText('Credential copied by browser permission.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(credential.token);
 await page.getByRole('button',{name:'Hide credential',exact:true}).click();
 await expect(page.getByRole('button',{name:'Copy credential',exact:true})).toHaveCount(0);
 await expect(page.getByText(credential.token,{exact:true})).toHaveCount(0);
 // The same token ID is inspected only from a fresh, role-scoped saved list.
 await page.getByRole('button',{name:'Refresh issued credentials',exact:true}).click();
 await expect(page.getByRole('button',{name:'Review revoke',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review revoke',exact:true}).click();
 await page.getByRole('button',{name:'Keep credential',exact:true}).click();
 expect((await request.get('/api/v1/requests',{headers:{authorization:'Bearer '+credential.token}})).status()).toBe(200);
 await page.getByRole('button',{name:'Review revoke',exact:true}).click();
 await page.getByRole('button',{name:'Confirm revoke',exact:true}).click();
 await expect(page.getByText('Server acknowledged credential revocation.',{exact:false})).toBeVisible();
 expect((await request.get('/api/v1/requests',{headers:{authorization:'Bearer '+credential.token}})).status()).toBe(401);
 // Notification authoring/test-send has its own B4 full browser scenario below.
 // Do not duplicate that expensive canvas workflow inside this account/credential/policy journey.
 await page.goto('/profiles');
 await page.getByRole('button',{name:'Create policy',exact:true}).click();
 await page.getByLabel('Policy name',{exact:true}).fill('Configured browser approval');
 await page.getByLabel('Integration',{exact:true}).selectOption({label:'Configured through browser'});
 await page.getByLabel('Assigned approver',{exact:true}).selectOption({label:'approver'});
 await page.getByLabel('Allowed action kind',{exact:true}).fill('test.configured');
 await page.getByRole('button',{name:'Create draft',exact:true}).click();
 await expect(page.getByText('Draft saved. It is not live until it passes Testing and is explicitly activated.')).toBeVisible();
 await page.getByRole('button',{name:'Test policy',exact:true}).click();
 // Lifecycle transition is still a non-activating Review -> Confirm.
 await expect(page.getByRole('button',{name:'Confirm testing',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm testing',exact:true}).click();
 await expect(page.getByText('Policy moved to Testing. Use isolated test before activation.')).toBeVisible();
 await page.getByRole('button',{name:'Preview & Test',exact:true}).click();
 await page.getByRole('button',{name:'Run isolated test',exact:true}).click();
 await expect(page.getByText(/Isolated test: Configured browser approval v1/)).toBeVisible();
 await page.getByRole('button',{name:'Activate policy',exact:true}).click();
 await expect(page.getByText('Confirm policy activation',{exact:true})).toBeVisible();
 await expect(page.getByText('Version 1 · TESTING',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm activation',exact:true}).click();
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
 await expect(page.getByText('Approval routing recorded. Changes to assigned reviewers do not execute the requested action.')).toBeVisible();
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
 await expect(page.getByText('Approval routing recorded. Changes to assigned reviewers do not execute the requested action.')).toBeVisible();
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
 await expect(page.getByText('Delegation change confirmed by the server.',{exact:false})).toBeVisible();
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

 // Explicit current-list reconciliation after a possibly committed
 // delegation POST is required before a separate revocation review.
 await page.getByRole('button',{name:'Refresh delegations',exact:true}).click();
 await expect(page.getByText('Current delegation records refreshed.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Review revoke',exact:true}).click();
 await expect(page.getByText('Revoke a delegation',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm delegation change',exact:true}).click();
 await expect(page.getByText('Delegation change confirmed by the server.',{exact:false})).toBeVisible();
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
 await expect(owner.getByText('Delegation change confirmed by the server.',{exact:false})).toBeVisible();

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
 await rp.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
 await rp.getByLabel('Request type',{exact:true}).selectOption(f.profile_id);
 await rp.getByLabel('Request title',{exact:true}).fill('G5 collaboration browser request');
 await rp.getByLabel('Target',{exact:true}).fill('isolated-target-for-info');
 await rp.getByRole('button',{name:'Review request',exact:true}).click();
 await expect(rp.getByRole('button',{name:'Confirm create request',exact:true})).toBeVisible();
 await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
 await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
 const id=rp.url().split('/').pop()!;
 const headers={authorization:'Bearer '+f.token};
 const original=await(await request.get('/api/v1/requests/'+id,{headers})).json();

 await ap.goto('/requests/'+id);
 await expect(ap.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
 await ap.getByLabel('Message purpose',{exact:true}).selectOption('REQUEST_INFO');
 await ap.getByLabel('Message (up to 2000 characters; no credentials)',{exact:true}).fill('Can you confirm the change reference?');
 await ap.getByRole('button',{name:'Review message',exact:true}).click();
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
 await rp.getByRole('button',{name:'Review message',exact:true}).click();
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
 // Current product requires read-only reviewed content before a human submits
 // a role-scoped collaboration message; the review itself has no POST.
 await page.getByRole('button',{name:'Review message',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm message',exact:true})).toBeVisible();
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
 await rp.getByLabel('Request type',{exact:true}).selectOption(policy.id);
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
 await rp.getByRole('button',{name:'Review request',exact:true}).click();
 await expect(rp.getByRole('button',{name:'Confirm create request',exact:true})).toBeVisible();
 await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
 await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
 const id=rp.url().split('/').pop()!;
 const actual=await(await adminContext.request.get('/api/v1/requests/'+id)).json();
 expect(actual.source.tenant_id).toBe('finance');
 expect(actual.source.environment).toBe('production');
 expect(actual.source.severity).toBe('high');
 expect(actual.source.risk_level).toBe('critical');
 expect(actual.profile_id).toBe(policy.id);

 const policiesBeforeSave=await(await adminContext.request.get('/api/v1/profiles',{headers})).json();
 const policyForUpdate=policiesBeforeSave.find((row:{id:string})=>row.id===policy.id);
 expect(policyForUpdate?.version_id).toBeTruthy();
 expect(Number.isFinite(policyForUpdate?.updated_at)).toBe(true);
 const updated=await adminContext.request.put('/api/v1/profiles/'+policy.id,{
   headers,data:{
     ...policyInput,name:'Browser selector draft v2',
     expected_version_id:policyForUpdate.version_id,
     expected_updated_at:policyForUpdate.updated_at,
   },
 });
 expect(updated.status()).toBe(200);expect((await updated.json()).version).toBe(2);
 await ap.goto('/profiles');
 const policyRow=ap.getByRole('row').filter({hasText:'Browser selector draft v2'});
 await policyRow.getByRole('button',{name:'Open',exact:true}).click();
 await expect(ap.getByLabel('Policy name',{exact:true})).toHaveValue('Browser selector draft v2');
 await ap.getByRole('button',{name:'Disable active',exact:true}).click();
 await expect(ap.getByText('Confirm active policy disable',{exact:true})).toBeVisible();
 await expect(ap.getByText('Version 2 · DRAFT',{exact:true})).toBeVisible();
 await ap.getByRole('button',{name:'Confirm disable',exact:true}).click();
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
 await page.getByRole('button',{name:'Credential tools',exact:true}).click();
 await page.getByLabel('Credential purpose',{exact:true}).selectOption('executor');
 await expect(page.getByRole('checkbox',{name:'request:create',exact:true})).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:'request:read',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'grant:consume',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'result:write',exact:true})).toBeChecked();
 await expect(page.getByText('Mixed integration credential',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click();
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
 // A typed but unapplied filter never silently exports the prior query.
 await expect(page.getByText('Filter edits not yet applied.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeDisabled();
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
 await expect(page.getByText('Applied search',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Inspect request evidence',exact:true}).first().click();
 await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toBeVisible();
 await expect(page.getByText(item.action_hash,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close selected request evidence',exact:true}).click();
 await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toHaveCount(0);
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
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click();
 const before=await(await context.request.get('/api/v1/integrations/configuration-export')).json();
 await page.getByRole('button',{name:'Preview safe export',exact:true}).click();
 await page.getByRole('button',{name:'Preview import conflicts',exact:true}).click();
 await expect(page.getByText('Manual preparation required — no changes applied',{exact:true})).toBeVisible();
 await expect(page.getByText('Automatic import and activation are unavailable.',{exact:false})).toBeVisible();
 await expect(page.getByText('No credentials, recipients or notification message bodies were exported.',{exact:false})).toBeVisible();
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
  const summary=page.getByRole('region',{name:'My work at a glance'});
  await expect(summary.getByRole('button',{name:/Needs my decision/}).locator('strong')).toHaveText(String(expected));
  await expect(page.getByText('These are lower-bound counts',{exact:false})).toHaveCount(0);
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
   return url.pathname==='/api/v1/requests' && url.searchParams.get('view')==='approval_overdue';
  });
  await page.getByRole('region',{name:'My work at a glance'}).getByRole('button',{name:/Overdue/}).click();
  const response=await filtered;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/approvals\?view=overdue$/);
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('approval_overdue');
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

test('U8.01 role-guided Home routes requester approver and administrator to the intended safe task',async({browser})=>{
 for(const role of ['requester','approver','admin'] as const){
  const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
  try{
   await login(page,role);await page.goto('/home');
   await expect(page.getByRole('heading',{name:'What would you like to do?',exact:true})).toBeVisible();
   await expect(page.getByRole('button').filter({hasText:'Create approval request'})).toBeVisible();
   await expect(page.getByRole('button').filter({hasText:'Review assigned work'})).toBeVisible();
   await expect(page.getByRole('button').filter({hasText:'Track my requests'})).toBeVisible();
   if(role==='requester'){
    await page.getByRole('button').filter({hasText:'Create approval request'}).click();
    await expect(page).toHaveURL(/\/requests\/new$/);await expect(page.getByText('Step 1 · Choose a request type',{exact:true})).toBeVisible();
   }else if(role==='approver'){
    await page.getByRole('button').filter({hasText:'Review assigned work'}).click();
    await expect(page).toHaveURL(/\/approvals$/);await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('needs');
   }else{
    const setup=page.getByRole('button',{name:/Administrator\? Open workflow setup/});await expect(setup).toBeVisible();await setup.click();
    await expect(page).toHaveURL(/\/admin\/setup$/);await expect(page.getByRole('heading',{name:'Configure once, reuse on every request'})).toBeVisible();
   }
  }finally{await context.close();}
 }
});

test('U8.05 administrator first-run guide resolves real setup routes and never skips draft/test activation gates',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/admin/setup');
  await page.getByRole('link',{name:/Open user management/}).click();
  await expect(page).toHaveURL(/\/system\?view=accounts$/);
  await expect(page.getByRole('heading',{name:'User Management',exact:true,level:2})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await expect(page.getByText('Find administration tasks',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Back to administration tasks',exact:true}).click();
  await expect(page.getByText('Find administration tasks',{exact:true})).toBeVisible();
  await page.goto('/profiles');
  const guide=page.locator('section.grant-admin-setup');
  await expect(guide.getByRole('heading',{name:'Set up your first approval workflow',exact:true})).toBeVisible();
  await expect(guide).toContainText('not a verified connection');await expect(guide).toContainText('bind request type, routing and notifications');await expect(guide).toContainText('activation requires separate confirmation');
  await guide.getByRole('link',{name:/Open integrations/}).click();await expect(page).toHaveURL(/\/integrations$/);
  await page.goto('/profiles');await expect(page.locator('section.grant-admin-setup')).toBeVisible();
  await page.locator('section.grant-admin-setup').getByRole('link',{name:/Manage approver groups/}).click();await expect(page).toHaveURL(/\/approvers$/);
  await page.goto('/profiles');const current=page.locator('section.grant-admin-setup');
  const create=current.getByRole('button',{name:/Create draft policy/});await expect(create).toBeEnabled();await create.click();
  await expect(page.getByRole('heading',{name:'New policy',exact:true})).toBeVisible();
  await expect(page.getByText('Create a draft. Saving alone never makes a policy live.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Activate policy',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Test policy',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

test('AUR-2.6 direct User Management landing preserves mobile shell context',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/admin/setup');
  await page.getByRole('link',{name:/Open user management/}).click();
  await expect(page).toHaveURL(/\/system\?view=accounts$/);
  await expect(page.getByRole('heading',{name:'User Management',exact:true,level:2})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await expect(page.getByText('Find administration tasks',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }finally{await context.close();}
});

test('AUR request inbox card headers stay readable on 390px mobile',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  for(const route of ['/requests','/approvals']){
   await page.goto(route);
   const card=page.locator('.dr-card').first();
   const heading=card.locator('.dr-card__heading');
   const description=card.locator('.dr-card__description');
   const actions=card.locator('.dr-card__actions');
   await expect(heading).toBeVisible();
   await expect(description).toBeVisible();
   await expect(actions).toBeVisible();
   const geometry=await page.evaluate(()=>{
    const card=document.querySelector('.dr-card')!;
    const heading=card.querySelector('.dr-card__heading')!.getBoundingClientRect();
    const description=card.querySelector('.dr-card__description')!.getBoundingClientRect();
    const actions=card.querySelector('.dr-card__actions')!.getBoundingClientRect();
    return {
     headingWidth:heading.width,
     descriptionWidth:description.width,
     headingBottom:heading.bottom,
     actionsTop:actions.top,
     overflow:document.documentElement.scrollWidth>innerWidth,
    };
   });
   expect(geometry.headingWidth).toBeGreaterThan(250);
   expect(geometry.descriptionWidth).toBeGreaterThan(250);
   expect(geometry.actionsTop).toBeGreaterThanOrEqual(geometry.headingBottom);
   expect(geometry.overflow).toBeFalsy();
  }
 }finally{await context.close();}
});

// B1 responsive/keyboard SOURCE qualification on loopback disposable fixture.
// Two viewport sizes are tested; this is not two independent real people.
test('B1 approver Inbox task-first mobile 320/375 and keyboard queue controls',async({browser})=>{
 const f=fixture();
 const requester=await browser.newContext();
 const sender=await requester.newPage();
 await login(sender,'requester');
 const session=await(await requester.request.get('/api/v1/auth/session')).json();
 const title='B1 responsive '+crypto.randomUUID().slice(0,8);
 const create=await requester.request.post('/api/v1/requests',{
  headers:{'x-csrf-token':session.csrf},
  data:{external_id:crypto.randomUUID(),profile_id:f.profile_id,title,
    action:{kind:'test.operation',target:'mobile-review-target',parameters:{}}},
 });
 expect(create.status()).toBe(202);
 for(const width of [320,375]){
  const context=await browser.newContext({viewport:{width,height:812}});
  const page=await context.newPage();
  try{
   await login(page,'approver');
   // RC50 quick navigation must not squeeze the real page H1 offscreen,
   // and a member cannot search pages requiring administrator capability.
   await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Search product navigation'}).click();
   const quickSearch=page.getByRole('search',{name:'Product navigation search'});
   await expect(quickSearch).toBeVisible();
   await quickSearch.getByRole('searchbox',{name:'Search pages'}).fill('Audit');
   await expect(quickSearch.getByText('No matching pages',{exact:true})).toBeVisible();
   await page.keyboard.press('Escape');
   await expect(quickSearch).toHaveCount(0);
   await page.goto('/approvals');
   await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
   await expect(page.locator('.grant-inbox-desktop-list')).toBeHidden();
   const row=page.getByRole('list',{name:'Current request worklist mobile list'})
    .getByRole('listitem').filter({
     has:page.getByRole('button',{name:title,exact:true}),
    });
   await expect(row.getByText('test.operation',{exact:true})).toBeVisible();
   await expect(row.getByText('mobile-review-target',{exact:true})).toBeVisible();
   await expect(row.getByText('0 / 1 approved',{exact:true})).toBeVisible();
   // Internal worklist scrolling is acceptable; page shell overflow is not.
   const dimension=await page.evaluate(()=>({
    viewport:window.innerWidth,document:document.documentElement.scrollWidth,
   }));
   expect(dimension.document,JSON.stringify({width,...dimension}))
     .toBeLessThanOrEqual(dimension.viewport);
   const held=page.getByRole('button',{name:'On hold',exact:true});
   await held.focus();
   await page.keyboard.press('Enter');
   await expect(held).toHaveAttribute('aria-pressed','true');
   await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('held');
  }finally{await context.close();}
 }
 await requester.close();
});

// B4 synthetic installed browser UI guard only; isolated administrator
// fixture and temporary database, no customer mailbox or real SMTP.
test('B4 branding remains unchanged during Review and changes only after Confirm',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/notifications');
  await page.getByRole('button',{name:'Branding',exact:true}).click();
  const beforeResponse=await context.request.get('/api/v1/notification-branding');
  expect(beforeResponse.status()).toBe(200);
  const before=await beforeResponse.json();
  await expect(page.getByLabel('Brand name',{exact:true})).toHaveValue(before.brand_name);
  const newBrand='Isolated Grant '+crypto.randomUUID().slice(0,8);
  const newSender='Test Security Review';
  await page.getByLabel('Brand name',{exact:true}).fill(newBrand);
  await page.getByLabel('Sender display name',{exact:true}).fill(newSender);
  await page.getByRole('button',{name:'Review branding',exact:true}).click();
  await expect(page.getByText('Review notification branding',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm branding change',exact:true})).toBeVisible();
  const duringReview=await context.request.get('/api/v1/notification-branding');
  expect((await duringReview.json()).brand_name).toBe(before.brand_name);
  await page.getByRole('button',{name:'Confirm branding change',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh saved branding',exact:true})).toBeVisible();
  await expect.poll(async()=>{
   const response=await context.request.get('/api/v1/notification-branding');
   return (await response.json()).brand_name;
  }).toBe(newBrand);
  await page.getByRole('button',{name:'Refresh saved branding',exact:true}).click();
  await expect(page.getByLabel('Brand name',{exact:true})).toHaveValue(newBrand);
  await expect(page.getByLabel('Sender display name',{exact:true})).toHaveValue(newSender);
  await expect(page.getByRole('button',{name:'Confirm branding change',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

// Independent B4 task-first UI regression on the disposable loopback app.
// Review-only must not issue a create or update POST/PUT.
test('B4 full notification template set create and update require exact Review then Confirm',async({browser})=>{
 test.setTimeout(120000);
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/notifications');
  const title='Isolated template '+crypto.randomUUID().slice(0,8);
  await page.getByRole('button',{name:'Create email template',exact:true}).click();
  await page.getByLabel('Template set name',{exact:true}).fill(title);
  const editorBlocks=page.getByRole('navigation',{name:'Email blocks'});
  await editorBlocks.getByRole('button',{name:'Subject',exact:true}).click();
  await page.getByLabel('Event subject',{exact:true}).fill('[Fixture] {{request_title}}');
  await page.getByRole('button',{name:'Review draft save',exact:true}).click();
  await expect(page.getByText('Review notification template set',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm template set creation',exact:true})).toBeVisible();
  const before=await context.request.get('/api/v1/notification-template-sets');
  expect((await before.json()).some((item:any)=>item.name===title)).toBe(false);
  await page.getByRole('button',{name:'Confirm template set creation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh saved template set',exact:true})).toBeVisible();
  // The view can enter its reconciliation state before the actual POST is
  // durably reflected in a subsequent GET. Poll the AUTHORITY, not a timer.
  await expect.poll(async()=>{
   const response=await context.request.get('/api/v1/notification-template-sets');
   expect(response.status()).toBe(200);
   const found=(await response.json()).find((item:any)=>item.name===title);
   return found?.templates?.requested?.subject;
  }).toBe('[Fixture] {{request_title}}');
  const after=await context.request.get('/api/v1/notification-template-sets');
  const created=(await after.json()).find((item:any)=>item.name===title);
  expect(created).toBeTruthy();
  expect(created.templates.requested.subject).toBe('[Fixture] {{request_title}}');
  await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();
  await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Subject',exact:true}).click();
  await expect(page.getByLabel('Event subject',{exact:true}))
    .toHaveValue('[Fixture] {{request_title}}');
  await page.getByLabel('Event subject',{exact:true}).fill('[Fixture updated] {{request_title}}');
  await page.getByRole('button',{name:'Review draft save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm template set update',exact:true})).toBeVisible();
  const beforeUpdate=await context.request.get('/api/v1/notification-template-sets');
  const unchanged=(await beforeUpdate.json()).find((item:any)=>item.id===created.id);
  expect(unchanged.templates.requested.subject).toBe('[Fixture] {{request_title}}');
  await page.getByRole('button',{name:'Confirm template set update',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh saved template set',exact:true})).toBeVisible();
  await expect.poll(async()=>{
   const response=await context.request.get('/api/v1/notification-template-sets');
   expect(response.status()).toBe(200);
   const found=(await response.json()).find((item:any)=>item.id===created.id);
   return found?.templates?.requested?.subject;
  }).toBe('[Fixture updated] {{request_title}}');
  const afterUpdate=await context.request.get('/api/v1/notification-template-sets');
  const updated=(await afterUpdate.json()).find((item:any)=>item.id===created.id);
  expect(updated.templates.requested.subject).toBe('[Fixture updated] {{request_title}}');
  await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm template set update',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

// U6.06 operator-driven disposable product E2E. This exercises the exact
// saved template -> reviewed preview -> one-shot Confirm test-send path through
// the mounted Grant UI and durable attempt-status API. Delivery terminates only
// at the isolated local SMTP fixture; the separate real-Gmail receipt evidence
// remains an external transport proof, not a claim that this fixture is Gmail.
test('U6.06 saved revision test email reviews exact state and sends once',async({browser,request})=>{
 test.setTimeout(120000);
 const f=fixture();
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/notifications');
  const title='U6.06 isolated '+crypto.randomUUID().slice(0,8);
  await page.getByRole('button',{name:'Create email template',exact:true}).click();
  await page.getByLabel('Template set name',{exact:true}).fill(title);
  await page.getByRole('button',{name:'Review draft save',exact:true}).click();
  await page.getByRole('button',{name:'Confirm template set creation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh saved template set',exact:true})).toBeVisible();
  const sets=await(await context.request.get('/api/v1/notification-template-sets')).json();
  const created=sets.find((item:any)=>item.name===title);
  expect(created).toBeTruthy();
  await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();

  const section=page.locator('details').filter({has:page.locator('summary',{hasText:'Saved revision preview and test email'})});
  await section.locator(':scope > summary').click();
  const review=page.getByRole('button',{name:'Review: Send test to me',exact:true});
  await expect(review).toBeEnabled();
  const before=await(await request.get(f.receiver)).json();
  const mailBefore=before.mail.length;
  await review.click();
  await expect(page.getByText('Confirm test email to my account',{exact:true})).toBeVisible();
  await expect(page.getByText(created.id,{exact:true})).toBeVisible();

  const sendResponse=page.waitForResponse(response=>
    response.request().method()==='POST'
      &&response.url().includes('/api/v1/notification-template-sets/'+created.id+'/test-send'));
  await page.getByRole('button',{name:'Confirm send test email',exact:true}).click();
  const sent=await sendResponse;
  expect(sent.status()).toBe(200);
  const result=await sent.json();
  expect(result.state).toBe('ACCEPTED');
  expect(result.transport_accepted).toBe(true);
  expect(result.receipt_confirmed).toBe(false);
  expect(result.execution_allowed).toBe(false);

  const status=await context.request.get(
    '/api/v1/notification-template-sets/'+created.id+'/test-send-attempts/'+result.attempt_id,
  );
  expect(status.status()).toBe(200);
  const durable=await status.json();
  expect(durable.state).toBe('ACCEPTED');
  expect(durable.transport_accepted).toBe(true);
  expect(durable.receipt_confirmed).toBe(false);
  expect(durable.execution_allowed).toBe(false);
  expect(durable.event_id).toBe(result.event_id);

  await expect.poll(async()=>(
    await(await request.get(f.receiver)).json()
  ).mail.length).toBe(mailBefore+1);
  const after=await(await request.get(f.receiver)).json();
  const mime=decodeFixtureMime(after.mail.at(-1));
  expect(mime).toContain('0000');
  expect(mime).not.toContain('/api/v1/decision-intents/');
  await expect(page.getByText('Test email outcome requires reconciliation',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reconcile test-email attempt',exact:true}).click();
  await expect(page.getByText('Transport acceptance is confirmed for the reviewed one-shot attempt.',{exact:false})).toBeVisible();
  expect((await(await request.get(f.receiver)).json()).mail).toHaveLength(mailBefore+1);
 }finally{await context.close();}
});

// B5 synthetic administrator UI. The browser delays A's real backend GET
// without forging a response; a later B selection must win and an unsearched
// draft must not export a stale applied result.
test('B5 audit explorer keeps exact B query while delayed old A response arrives',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 let markASeen!:()=>void;
 const aSeen=new Promise<void>(resolve=>{markASeen=resolve;});
 let releaseA!:()=>void;
 const aMayContinue=new Promise<void>(resolve=>{releaseA=resolve;});
 const idA='b5-synthetic-old-filter-A';
 const idB='b5-synthetic-current-filter-B';
 try{
  await login(page,'admin');
  await page.goto('/audit');
  await expect(page.getByText('Applied search',{exact:false})).toBeVisible();
  await page.route('**/api/v1/admin/audit/search?*',async route=>{
   const target=new URL(route.request().url()).searchParams.get('request_id');
   if(target===idA){
    markASeen();
    await aMayContinue;
   }
   await route.continue();
  });
  await page.getByLabel('Request ID',{exact:true}).fill(idA);
  await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Search evidence',exact:true}).click();
  await aSeen;
  await page.getByLabel('Request ID',{exact:true}).fill(idB);
  await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Search evidence',exact:true}).click();
  await expect(page.getByText('Request ID: '+idB,{exact:false})).toBeVisible();
  await expect(page.getByText('No matching audit events.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeEnabled();
  const lateResponse=page.waitForResponse(r=>{
   const url=new URL(r.url());
   return url.pathname==='/api/v1/admin/audit/search'
     &&url.searchParams.get('request_id')===idA;
  });
  releaseA();
  await lateResponse;
  await expect(page.getByText('Request ID: '+idB,{exact:false})).toBeVisible();
  await expect(page.getByText('No matching audit events.',{exact:true})).toBeVisible();
  await expect(page.getByText('Request ID: '+idA,{exact:false})).toHaveCount(0);
 }finally{
  releaseA();
  await context.close();
 }
});

// B4 synthetic delivery-health browser read, no SMTP resend POST. A slow
// legitimate saved A response is delayed only by the browser test harness.
test('B4 delivery health binds newest FAILED filter ahead of old PENDING GET',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 let markOld!:()=>void;
 const oldReadSeen=new Promise<void>(resolve=>{markOld=resolve});
 let releaseOld!:()=>void;
 const oldCanContinue=new Promise<void>(resolve=>{releaseOld=resolve});
 try{
  await login(page,'admin');
  await page.goto('/notifications');
  await page.getByRole('button',{name:'Delivery Health',exact:true}).click();
  await expect(page.getByText('Applied delivery filters',{exact:false})).toBeVisible();
  await page.route('**/api/v1/notification-deliveries?*',async route=>{
   if(new URL(route.request().url()).searchParams.get('state')==='PENDING'){
     markOld();
     await oldCanContinue;
   }
   await route.continue();
  });
  await page.getByLabel('Delivery state',{exact:true}).selectOption('PENDING');
  await expect(page.getByText('Filter edits not yet applied.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await oldReadSeen;
  await page.getByLabel('Delivery state',{exact:true}).selectOption('FAILED');
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  const applied=page.getByRole('region',{name:'Applied delivery health search'});
  await expect(applied).toContainText('FAILED');
  await expect(applied).not.toContainText('Filter edits not yet applied.');
  const oldResponse=page.waitForResponse(response=>{
   const url=new URL(response.url());
   return url.pathname==='/api/v1/notification-deliveries'
     &&url.searchParams.get('state')==='PENDING';
  });
  releaseOld();
  await oldResponse;
  await expect(applied).toContainText('FAILED');
  await expect(applied).not.toContainText('PENDING');
  await expect(page.getByText('Receipt is not independently confirmed by this delivery ledger.')).toBeVisible();
 }finally{
  releaseOld();
  await context.close();
 }
});

// G7 synthetic operator workflow on the real mounted admin surface.
// The task-first table only opens the exact role-scoped request queue;
// it never approves, resends email or starts an external execution.
test('G7 Operations exceptions open exact role-scoped reconciliation queue',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/operations');
  await expect(page.getByRole('heading',{name:'Operational work and exceptions',exact:true})).toBeVisible();
  const table=page.getByRole('table',{name:'Approval and execution exceptions'});
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(6); // five exception classes plus headers
  await expect(table.getByText('not independently verified',{exact:false}).first()).toBeVisible();
  const source=table.getByRole('button',{name:'Open Execution unknown queue',exact:true});
  await expect(source).toBeEnabled();
  await source.focus();
  await expect(source).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/operations\/queue\/execution_unknown$/);
  await expect(page.getByLabel('Work view',{exact:true})).toHaveValue('ops_execution_unknown');
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

// B3 actual Foundation Administration consumer, synthetic local SMTP only.
// Review is read-only. Confirm sends exactly one existing admin-only test
// notification to the fixture administrator, not a real mailbox/approval.
test('B3 Administration mail-test requires exact Review then one Confirm',async({browser})=>{
 const f=fixture();
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  await page.goto('/system');
  await page.getByTestId('grant.smtp.test').getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.getByText('Mail delivery test',{exact:true}).first()).toBeVisible();
  const before=await(await context.request.get(f.receiver)).json();
  const previous=before.mail.length;
  await page.getByRole('button',{name:'Review mail test to me',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm mail test to me',exact:true})).toBeVisible();
  const unchanged=await(await context.request.get(f.receiver)).json();
  expect(unchanged.mail).toHaveLength(previous);
  await page.getByRole('button',{name:'Confirm mail test to me',exact:true}).click();
  await expect(page.getByText('SMTP transport accepted one administrator test email',{exact:false})).toBeVisible();
  await expect.poll(async()=>(
    await(await context.request.get(f.receiver)).json()
  ).mail.length).toBe(previous+1);
  await expect(page.getByRole('button',{name:'Review mail test to me',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Confirm mail test to me',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

// P0 Grant Group Directory truth, backed by disposable administrator-scoped
// group/account GETs only. No real users, privileges, or policy changes.
test('P0 Approver group directory distinguishes saved IDs from enabled account coverage',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'admin');
  const accountsResponse=await context.request.get('/api/v1/admin/users');
  expect(accountsResponse.status()).toBe(200);
  const accounts=await accountsResponse.json();
  const member=accounts.find((account:{id:string;status:string})=>
    account.status==='enabled'&&Boolean(account.id));
  expect(member).toBeTruthy();
  const name='Fixture approver group '+crypto.randomUUID().slice(0,8);
  // Synthetic admin creates only a disposable group through the current
  // actual Review -> Confirm UI. No direct API POST or CSRF bypass.
  await page.goto('/approvers');
  await page.getByRole('button',{name:'Create approver group',exact:true}).click();
  await page.getByLabel('Group name',{exact:true}).fill(name);
  await page.locator('label.grant-checkbox').filter({
   hasText:member.displayName,
  }).locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Review group creation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm save group',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Confirm save group',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:name});
  await expect(row).toBeVisible();
  await expect(row.getByText('1 / 1 currently enabled accounts',{exact:false})).toBeVisible();
  await expect(page.getByText('Saved membership is not proof of current decision eligibility',{exact:false})).toBeVisible();
  // Keycloak-inspired faceted discovery: all controls use only currently
  // loaded admin-scoped GET rows; changing view must never edit a group.
  const facet=page.getByLabel('Filter saved groups',{exact:true});
  await expect(facet).toHaveValue('all');
  const mutations:string[]=[];
  page.on('request',r=>{
   if(r.method()!=='GET'&&r.url().includes('/api/v1/approver-groups')) mutations.push(r.url());
  });
  await facet.selectOption('disabled');
  await expect(row).toHaveCount(0);
  await facet.selectOption('attention');
  await expect(row).toHaveCount(0);
  await facet.selectOption('unverified');
  await expect(row).toHaveCount(0);
  await facet.selectOption('enabled');
  await expect(row).toBeVisible();
  await page.getByLabel('Search approver groups',{exact:true}).fill(name);
  await expect(row).toBeVisible();
  await facet.selectOption('disabled');
  await expect(row).toHaveCount(0);
  await facet.selectOption('all');
  await expect(row).toBeVisible();
  await page.setViewportSize({width:375,height:812});
  await expect(facet).toBeVisible();
  await expect(facet).toHaveValue('all');
  await facet.selectOption('enabled');
  await expect(row).toBeHidden();
  const mobileRow=page.getByRole('list',{name:'Approver groups mobile list'})
   .getByRole('listitem').filter({hasText:name});
  await expect(mobileRow).toBeVisible();
  await expect(mobileRow.getByText('1 / 1 currently enabled accounts',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.setViewportSize({width:1280,height:800});
  expect(mutations).toEqual([]);
  // A successfully issued group creation still requires explicit original
  // group-list reconciliation before the next security-sensitive edit.
  await expect(row.getByRole('button',{name:'Review group',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Refresh saved groups',exact:true}).click();
  await expect(row.getByRole('button',{name:'Review group',exact:true})).toBeEnabled();
  await row.getByRole('button',{name:'Review group',exact:true}).click();
  await expect(page.getByText('Edit approver group',{exact:false})).toBeVisible();
  await expect(page.getByLabel('Group name',{exact:true})).toHaveValue(name);
  await expect(page.getByText('Saved group membership: 1 member(s)',{exact:false})).toBeVisible();
 }finally{await context.close();}
});

// Official Entra/ServiceNow published selected-task detail pattern adapted
// only to current Grant role-scoped response rows. No decision on preview.
test('P0 Entra-style selected approval context stays tied to exact Inbox view',async({browser,request})=>{
 const f=fixture(),headers={authorization:'Bearer '+f.token};
 const title='Preview queue task '+crypto.randomUUID().slice(0,8);
 const response=await request.post('/api/v1/requests',{headers,data:{
  external_id:crypto.randomUUID(),profile_id:f.profile_id,title,
  action:{kind:'test.operation',target:'inbox-preview-fixture',parameters:{}},
 }});
 expect(response.status()).toBe(202);
 const saved=await response.json();
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 try{
  await login(page,'approver');
  await page.goto('/approvals');
  const matching=page.getByRole('row').filter({hasText:title});
  await expect(matching).toBeVisible();
  await expect(page.getByRole('region',{name:'Selected request context'})).toHaveCount(0);
  const mutations:string[]=[];
  page.on('request',r=>{
   if(r.method()!=='GET'&&r.url().includes('/api/v1/requests/')){
    mutations.push(r.url());
   }
  });
  await matching.getByRole('button',{name:'Preview request',exact:true}).click();
  const preview=page.getByRole('region',{name:'Selected request context'});
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(title);
  await expect(preview).toContainText('inbox-preview-fixture');
  await expect(preview).toContainText('Human decision deadline');
  await expect(preview).toContainText('External execution');
  await expect(matching.getByRole('button',{name:'Preview request'})).toHaveAttribute('aria-pressed','true');
  expect(mutations).toEqual([]);
  await page.getByLabel('Search requests',{exact:true}).fill('preview-no-match-xxxxxxxxxx');
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:title});
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:'Preview request',exact:true}).click();
  await expect(preview).toBeVisible();
  await preview.getByRole('button',{name:'Open full request',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/requests/'+saved.id+'$'));
  await expect(page.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  expect(mutations).toEqual([]);
 }finally{await context.close();}
});

// P0-2D: real installed browser navigation on disposable fixtures only.
// A new approval request is pending by server truth; the detail must present
// the same server-authored deadline and never synthesize "overdue" from clock.
test('P0-2D role-scoped RequestDetail deadline truth and separate human confirm', async ({browser}) => {
  const requester = await browser.newContext({viewport: {width: 1280, height: 800}});
  const approver = await browser.newContext({viewport: {width: 1280, height: 800}});
  try {
    const rp = await requester.newPage();
    const ap = await approver.newPage();
    await login(rp, 'requester');
    await rp.locator('#dr-main-content').getByRole('button', {name: 'New request', exact: true}).click();
    await rp.getByLabel('Request type', {exact: true}).selectOption(fixture().profile_id);
    await rp.getByLabel('Request title', {exact: true}).fill('P0-2D deadline review parity');
    await rp.getByLabel('Target', {exact: true}).fill('isolated-review-deadline');
    await rp.getByRole('button', {name: 'Review request', exact: true}).click();
    await rp.getByRole('button', {name: 'Confirm create request', exact: true}).click();
    await expect(rp.getByText('Exact action requiring approval', {exact: true})).toBeVisible();
    const detailUrl = rp.url();
    await login(ap, 'approver');
    await ap.goto(detailUrl);
    const serverDeadline = ap.getByLabel('Decision deadline and authoritative approval status');
    await expect(serverDeadline).toBeVisible();
    await expect(serverDeadline).not.toContainText('Decision deadline unavailable');
    await expect(serverDeadline).not.toContainText('Escalation due');
    await expect(ap.getByText('Approval deadline', {exact: true})).toBeVisible();
    await expect(ap.getByText('isolated-review-deadline', {exact: true}).first()).toBeVisible();
    await ap.getByRole('button', {name: 'Approve', exact: true}).click();
    await expect(ap.getByRole('button', {name: 'Confirm approved', exact: true})).toBeVisible();
    await expect(ap.getByText('AWAITING', {exact: true}).first()).toBeVisible();
    await expect(ap.getByRole('button', {name: 'Execute', exact: true})).toHaveCount(0);
  } finally {
    await requester.close();
    await approver.close();
  }
});

// P0-2E: actual mounted RequestDetail, no mock grant/approval API.
// Distinct disposable requester and approver sessions, not real-user E2E.
test('P0-2E approved grant scope differs from requested action and external execution', async ({browser}) => {
  const requester = await browser.newContext({viewport:{width:1280,height:800}});
  const approver = await browser.newContext({viewport:{width:375,height:812}});
  try {
    const rp=await requester.newPage();
    const ap=await approver.newPage();
    const errors:string[]=[];
    rp.on('pageerror',(error)=>errors.push(error.message));
    ap.on('pageerror',(error)=>errors.push(error.message));
    await login(rp,'requester');
    await rp.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
    await rp.getByLabel('Request type',{exact:true}).selectOption(fixture().profile_id);
    await rp.getByLabel('Request title',{exact:true}).fill('P0-2E grant scope preview');
    await rp.getByLabel('Target',{exact:true}).fill('isolated-grant-scope-target');
    await rp.getByRole('button',{name:'Review request',exact:true}).click();
    await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
    // The reviewed POST and route navigation complete asynchronously.
    await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
    const detailUrl=rp.url();
    const initialScope=rp.getByRole('region',{name:'Execution grant scope and validity'});
    await expect(initialScope).toContainText('No current execution grant recorded');
    await expect(initialScope).not.toContainText('Grant expires');
    await login(ap,'approver');
    await ap.goto(detailUrl);
    const scope=ap.getByRole('region',{name:'Execution grant scope and validity'});
    await expect(scope).toContainText('No current execution grant recorded');
    await expect(ap.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
    await ap.getByRole('button',{name:'Approve',exact:true}).click();
    // Selecting a response is never equivalent to a recorded human decision.
    await expect(scope).toContainText('No current execution grant recorded');
    await expect(ap.getByRole('button',{name:'Confirm approved',exact:true})).toBeVisible();
    await ap.getByRole('button',{name:'Confirm approved',exact:true}).click();
    await expect(scope).toContainText('Granted for this immutable action');
    await expect(scope).toContainText('Authorized operation');
    await expect(scope).toContainText('Authorized target');
    await expect(scope).toContainText('isolated-grant-scope-target');
    await expect(scope).toContainText('Grant expires (server recorded)');
    await expect(scope).toContainText('Connected systems execute separately');
    await expect(scope).not.toContainText('Verified execution');
    await expect(ap.getByRole('button',{name:'Execute',exact:true})).toHaveCount(0);
    await expect(ap.getByText('NOT STARTED',{exact:true}).first()).toBeVisible();
    expect(errors).toEqual([]);
    expect(await ap.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  } finally {
    await requester.close();
    await approver.close();
  }
});

// P0-2B: actual original issued-email URL and code from isolated SMTP, not
// a mocked client adapter, borrowed human session, or an invented token.
test('P0-2B issued email link opens no-login PIN, explicit Confirm, then rejects replay', async ({browser,request}) => {
 const f=fixture();
 const requester=await browser.newContext({viewport:{width:1280,height:800}});
 const mailboxReader=await browser.newContext({viewport:{width:375,height:812}});
 const replayReader=await browser.newContext({viewport:{width:320,height:720}});
 try {
  const rp=await requester.newPage();
  const page=await mailboxReader.newPage();
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await login(rp,'requester');
  await rp.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
  await rp.getByLabel('Request type',{exact:true}).selectOption(f.profile_id);
  const title='P0-2B issued-link human decision '+crypto.randomUUID().slice(0,8);
  const target='isolated-mail-approval-target';
  await rp.getByLabel('Request title',{exact:true}).fill(title);
  await rp.getByLabel('Target',{exact:true}).fill(target);
  await rp.getByRole('button',{name:'Review request',exact:true}).click();
  await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
  await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
  const id=rp.url().split('/').pop()!;
  await expect.poll(async()=>{
    const delivered=await(await request.get(f.receiver)).json();
    return delivered.mail.some((message:string)=>
      message.includes(title)&&message.includes('Four-digit confirmation PIN:'));
  }).toBeTruthy();
  const delivered=await(await request.get(f.receiver)).json();
  const message=(delivered.mail as string[]).find(m=>
    m.includes(title)&&m.includes('Four-digit confirmation PIN:'))!;
  // The *actual SMTP message* may quote-printable-fold a long issued URL
  // with =CRLF. Decode the transport encoding before extracting its exact
  // opaque token; a shortened token must never be "fixed" or invented.
  const mailText=decodeFixtureMime(message);
  const link=mailText.match(/Approve:\s*(http:\/\/127\.0\.0\.1:\d+\/api\/v1\/decision-intents\/[a-zA-Z0-9_-]+)/)?.[1];
  const pin=mailText.match(/Four-digit confirmation PIN:\s*(\d{4})/)?.[1];
  expect(link).toBeTruthy();
  expect(link!.split('/').pop()).toMatch(/^[a-zA-Z0-9_-]{32,100}$/);
  expect(pin).toMatch(/^\d{4}$/);
  const headers={authorization:'Bearer '+f.token};
  const serverRow=async()=> (await(await request.get('/api/v1/requests/'+id,{headers})).json());
  expect((await serverRow()).state).toBe('AWAITING');
  expect((await serverRow()).execution_state).toBe('NOT_STARTED');

  const rawApi=await request.get(link!,{headers:{Accept:'application/json'}});
  if(rawApi.status()!==200){
    const response=await rawApi.json().catch(()=>({}));
    throw new Error('ISSUED_LINK_PREFLIGHT_HTTP_'+rawApi.status()+
      '_'+String(response?.error?.code ?? 'UNKNOWN'));
  }
  expect(rawApi.status()).toBe(200);
  const preview=await rawApi.json();
  expect(preview.details_visible).toBe(false);
  expect(preview.pin_required).toBe(true);
  expect(JSON.stringify(preview)).not.toContain(target);
  const head=await request.head(link!,{headers:{Accept:'text/html'}});
  expect(head.status()).toBe(204);
  expect((await serverRow()).state).toBe('AWAITING');

  const mutating:string[]=[];
  page.on('request',req=>{
    if(req.method()!=='GET'&&req.method()!=='HEAD'&&req.url().includes('/api/v1/decision-intents/')){
      mutating.push(req.url());
    }
  });
  const navigation=await page.goto(link!);
  expect(navigation?.status()).toBe(200);
  expect(navigation?.headers()['content-type']).toContain('text/html');
  expect(navigation?.headers()['cache-control']).toBe('no-store');
  expect(navigation?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading',{name:'Approve request',exact:true})).toBeVisible();
  await expect(page.getByLabel('Four-digit code from the email')).toBeVisible();
  await expect(page.getByRole('button',{name:'Verify code'})).toBeDisabled();
  await expect(page.getByText(target)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Confirm Approve'})).toHaveCount(0);
  expect(mutating).toEqual([]);
  expect((await serverRow()).state).toBe('AWAITING');

  await page.getByLabel('Four-digit code from the email').fill(pin!);
  await page.getByRole('button',{name:'Verify code'}).click();
  await expect(page.getByLabel('Verified request summary')).toContainText(title);
  await expect(page.getByLabel('Verified request summary')).toContainText(target);
  await expect(page.getByRole('heading',{name:'Review request',exact:true})).toBeFocused();
  await expect(page.getByRole('button',{name:'Confirm Approve'})).toBeVisible();
  expect((await serverRow()).state).toBe('AWAITING');
  expect((await serverRow()).execution_state).toBe('NOT_STARTED');
  expect(mutating.filter(url=>url.endsWith('/verify'))).toHaveLength(1);
  expect(mutating.filter(url=>url.endsWith('/confirm'))).toHaveLength(0);

  await page.getByRole('button',{name:'Confirm Approve'}).click();
  await expect(page.getByText('Your decision was recorded.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Decision recorded',exact:true})).toBeFocused();
  await expect.poll(async()=> (await serverRow()).state).toBe('APPROVED');
  expect((await serverRow()).execution_state).toBe('NOT_STARTED');
  expect(mutating.filter(url=>url.endsWith('/confirm'))).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);

  const repeat=await replayReader.newPage();
  await repeat.goto(link!);
  await expect(repeat.getByText('This approval link is not available.',{exact:false})).toBeVisible();
  await expect(repeat.getByLabel('Four-digit code from the email')).toHaveCount(0);
  await expect(repeat.getByRole('button',{name:'Confirm Approve'})).toHaveCount(0);
  expect((await serverRow()).state).toBe('APPROVED');
 }finally{
  await requester.close();
  await mailboxReader.close();
  await replayReader.close();
 }
});

// P0-2B: second, separately-created human email request proves the policy's
// same-mailbox OTP and denial-reason gates on the real mounted Web surface.
test('P0-2B issued Deny link requires same-mailbox OTP and explicit reason/Confirm',async({browser,request})=>{
 const f=fixture();
 const requester=await browser.newContext({viewport:{width:1280,height:800}});
 const reader=await browser.newContext({viewport:{width:320,height:720}});
 try{
  const rp=await requester.newPage(),page=await reader.newPage();
  await login(rp,'requester');
  await rp.locator('#dr-main-content').getByRole('button',{name:'New request',exact:true}).click();
  await rp.getByLabel('Request type',{exact:true}).selectOption(f.otp_profile_id);
  const title='P0-2B OTP Deny requirement '+crypto.randomUUID().slice(0,8);
  await rp.getByLabel('Request title',{exact:true}).fill(title);
  await rp.getByLabel('Target',{exact:true}).fill('fixture-otp-only-target');
  await rp.getByRole('button',{name:'Review request',exact:true}).click();
  await rp.getByRole('button',{name:'Confirm create request',exact:true}).click();
  await expect(rp.getByText('Exact action requiring approval',{exact:true})).toBeVisible();
  const id=rp.url().split('/').pop()!;
  await expect.poll(async()=>{
   const received=await(await request.get(f.receiver)).json();
   return received.mail.some((message:string)=>
    message.includes(title)&&message.includes('Four-digit confirmation PIN:'));
  }).toBeTruthy();
  const received=await(await request.get(f.receiver)).json();
  const initial=decodeFixtureMime((received.mail as string[]).find(
   message=>message.includes(title)&&message.includes('Four-digit confirmation PIN:'))!);
  const link=initial.match(/Deny:\s*(http:\/\/127\.0\.0\.1:\d+\/api\/v1\/decision-intents\/[a-zA-Z0-9_-]+)/)?.[1];
  const pin=initial.match(/Four-digit confirmation PIN:\s*(\d{4})/)?.[1];
  expect(link?.split('/').pop()).toMatch(/^[a-zA-Z0-9_-]{32,100}$/);
  expect(pin).toMatch(/^\d{4}$/);

  const headers={authorization:'Bearer '+f.token};
  const row=async()=> (await(await request.get('/api/v1/requests/'+id,{headers})).json());
  await page.goto(link!);
  await expect(page.getByRole('heading',{name:'Deny request',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Request one-time code'})).toHaveCount(0);
  await page.getByLabel('Four-digit code from the email').fill(pin!);
  await page.getByRole('button',{name:'Verify code'}).click();
  await expect(page.getByRole('heading',{name:'Review request',exact:true})).toBeFocused();
  await expect(page.getByRole('button',{name:'Request one-time code'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm Deny'})).toHaveCount(0);
  expect((await row()).state).toBe('AWAITING');
  await page.getByRole('button',{name:'Request one-time code'}).click();
  await expect(page.getByRole('button',{name:'Code requested'})).toBeDisabled();
  await expect.poll(async()=>{
   const delivered=await(await request.get(f.receiver)).json();
   return delivered.mail.some((m:string)=>m.includes('Your additional decision verification code is:'));
  }).toBeTruthy();
  const newest=await(await request.get(f.receiver)).json();
  const challenge=decodeFixtureMime((newest.mail as string[]).find((m:string)=>
   m.includes('Your additional decision verification code is:'))!);
  const code=challenge.match(/Your additional decision verification code is:\s*(\d{6})/)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel('Six-digit email code').fill(code!);
  await page.getByRole('button',{name:'Verify email code'}).click();
  await expect(page.getByLabel('Reason for denial (required)')).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm Deny'})).toBeDisabled();
  expect((await row()).state).toBe('AWAITING');
  await page.getByLabel('Reason for denial (required)').fill('Authorized reviewer declined the isolated test');
  await expect(page.getByRole('button',{name:'Confirm Deny'})).toBeEnabled();
  await page.getByRole('button',{name:'Confirm Deny'}).click();
  await expect(page.getByRole('heading',{name:'Decision recorded',exact:true})).toBeFocused();
  await expect(page.getByText('Your decision was recorded.',{exact:false})).toBeVisible();
  await expect.poll(async()=> (await row()).state).toBe('DENIED');
  expect((await row()).execution_state).toBe('NOT_STARTED');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }finally{
  await requester.close();await reader.close();
 }
});


// B4 source-level mobile usability: replacing a seven-column policy table with
// a task-first card view does not change the saved row or approval authority.
// Uses the existing disposable administrator, never a real external user.
test('B4 policy workspace mobile 320/375 uses readable cards without horizontal policy scan',async({browser})=>{
 for(const width of [320,375]){
  const context=await browser.newContext({viewport:{width,height:812}});
  const page=await context.newPage();
  try{
   await login(page,'admin');
   await page.goto('/profiles');
   await expect(page.getByRole('heading',{name:'Approval policies',exact:true,level:2})).toBeVisible();
   const list=page.getByRole('list',{name:'Approval policies mobile list'});
   await expect(list).toBeVisible();
   const policy=list.getByRole('listitem').filter({hasText:'Test operation approval'});
   await expect(policy).toBeVisible();
   await expect(policy.getByText('test.operation',{exact:true})).toBeVisible();
   await expect(policy.getByText('ACTIVE',{exact:true})).toBeVisible();
   await expect(page.locator('table.grant-policy-table')).toBeHidden();
   const size=await page.evaluate(()=>({
    viewport:innerWidth,doc:document.documentElement.scrollWidth,
   }));
   expect(size.doc).toBeLessThanOrEqual(size.viewport);
   const open=policy.getByRole('button',{name:'Open',exact:true});
   await open.focus();
   await page.keyboard.press('Enter');
   await expect(page.getByRole('heading',{name:'Test operation approval',exact:true,level:2})).toBeVisible();
   await expect(page.getByRole('button',{name:/Back to policies/})).toBeVisible();
  }finally{await context.close();}
 }
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 try{
  const page=await context.newPage();
  await login(page,'admin');
  await page.goto('/profiles');
  await expect(page.locator('table.grant-policy-table')).toBeVisible();
  await expect(page.getByRole('list',{name:'Approval policies mobile list'})).toBeHidden();
 }finally{await context.close();}
});
