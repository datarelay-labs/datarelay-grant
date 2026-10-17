import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,renderSyntheticEmail} from './notification-fixture';

const endpoint='**/api/v1/notification-template-drafts/preview';

test('U4.04 contrast recovery focuses the actual Hold color input, then clears only after a corrected render',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:/^Approval buttons/}).click();
 await page.getByLabel('Hold button color',{exact:true}).fill('#ffffff');
 const live=page.getByRole('region',{name:'Live unsaved email preview'});
 await expect(live).toContainText('Hold button text is difficult to read.');
 await live.getByRole('button',{name:'Edit button colors',exact:true}).click();
 await expect(page.getByLabel('Hold button color',{exact:true})).toBeFocused();
 await page.getByLabel('Hold button color',{exact:true}).fill('#854d0e');
 await expect(live).not.toContainText('Hold button text is difficult to read.');
 await expect(live).toHaveAttribute('aria-busy','false');
 await expect(live).not.toContainText('Previous result shown — not valid for review.');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});


test('U4.02 a delayed previous request never replaces a newer render and the old canvas is clearly stale while pending',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const canvas=page.getByLabel('Selectable email canvas');await expect(canvas).toContainText('Please review collector-01.');
 let seen=false,completed=false;let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route(endpoint,async route=>{
  const payload=route.request().postDataJSON();
  if(payload.template.templates.requested.body!=='Earlier delayed body'){await route.fallback();return;}
  seen=true;await held;const result=await renderSyntheticEmail(payload);await route.fulfill({json:result});completed=true;
 });
 try{
  await page.getByLabel('Event body').fill('Earlier delayed body');await expect.poll(()=>seen).toBe(true);
  await expect(canvas).toContainText('Please review collector-01.');await expect(page.getByText('Updating preview — previous result shown.',{exact:true})).toBeVisible();
  await page.getByLabel('Event body').fill('Latest authoritative body');await expect(canvas).toContainText('Latest authoritative body');
  release();await expect.poll(()=>completed).toBe(true);await expect(canvas).toContainText('Latest authoritative body');
  await expect(canvas).not.toContainText('Earlier delayed body');
  await expect(page.getByRole('region',{name:'Live unsaved email preview'})).toHaveAttribute('aria-busy','false');
  expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
 }finally{release();}
});

test('U4.02 render failure keeps the last image explicitly invalid and retry recovers without a save',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 let failed=true;await page.route(endpoint,async route=>{
  const payload=route.request().postDataJSON();
  if(failed&&payload.template.templates.requested.body==='Recoverable body'){await route.fulfill({status:422,json:{error:{code:'INVALID_INPUT',category:'validation'}}});return;}
  await route.fallback();
 });
 await page.getByLabel('Event body').fill('Recoverable body');
 const live=page.getByRole('region',{name:'Live unsaved email preview'});
 await expect(live).toContainText('The current draft could not be rendered');
 await expect(page.getByLabel('Selectable email canvas')).toContainText('Please review collector-01.');
 await expect(live).toContainText('Previous result shown — not valid for review.');
 await expect(page.getByRole('button',{name:'Review & publish',exact:true})).toBeDisabled();
 failed=false;await page.getByRole('button',{name:'Refresh live preview',exact:true}).click();
 await expect(page.getByLabel('Selectable email canvas')).toContainText('Recoverable body');await expect(live).not.toContainText('The current draft could not be rendered');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U4.03 U4.05 U4.07 samples, event modes, widths and source/text views share one current synthetic output',async({page})=>{
 test.setTimeout(120000);const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const seen:any[]=[];page.on('response',async response=>{if(response.url().endsWith('/notification-template-drafts/preview')&&response.status()===200){
  const payload=response.request().postDataJSON();if(payload.template.name!=='Style example')seen.push({payload,result:await response.json()});
 }});
 await page.getByText('Sample data',{exact:true}).click();
 for(const sample of ['long_en','long_ko','missing_optional','normal']){
  await page.getByLabel('Sample scenario').selectOption(sample);
  await expect.poll(()=>seen.at(-1)?.payload.sample.target).toBe(sample==='long_en'?'sample-long-resource-name-'.repeat(10):sample==='long_ko'?'샘플-대상-서버-'.repeat(20):'collector-01');
  if(sample==='missing_optional')expect(seen.at(-1).payload.sample.reason).toBe('');
 }
 for(const mode of ['EMAIL_PIN_PLUS_OTP','EMAIL_PIN_PLUS_MFA','EMAIL_PIN']){
  await page.getByLabel('Sample verification mode').selectOption(mode);await expect.poll(()=>seen.at(-1)?.payload.verification_mode).toBe(mode);
  expect(seen.at(-1).result.rendered.html).toContain('0000');expect(seen.at(-1).result.validation.protected_actions).toBe(4);
 }
 for(const event of ['reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown','requested']){
  await page.getByLabel('Event',{exact:true}).selectOption(event);await expect.poll(()=>seen.at(-1)?.payload.event).toBe(event);
  expect(seen.at(-1).result.validation.protected_actions).toBe(['requested','reminder'].includes(event)?4:1);
 }
 for(const width of ['320','375','390','600']){
  await page.getByLabel('Preview width').selectOption(width);
  const box=await page.locator('.grant-email-canvas-size').boundingBox();expect(box!.width).toBeLessThanOrEqual(Number(width));
  await expect(page.getByLabel('Selectable email canvas')).toContainText('collector-01');
 }
 const current=seen.at(-1).result.rendered;
 const format=page.getByRole('group',{name:'Preview format'});
 await format.getByRole('button',{name:'Plain text',exact:true}).click();await expect(page.getByRole('region',{name:'Rendered email preview'}).locator('pre')).toHaveText(current.body);
 await format.getByRole('button',{name:'HTML source',exact:true}).click();await expect(page.getByRole('region',{name:'Rendered email preview'}).locator('pre')).toHaveText(current.html);
 const diagnostics=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Diagnostics$/})});
 expect(await diagnostics.getAttribute('open')).toBeNull();await diagnostics.locator('summary').click();await expect(diagnostics).toContainText(current.renderer_revision);
 await format.getByRole('button',{name:'Layout preview',exact:true}).click();const frame=page.getByTitle('Inert approval email preview');await expect(frame).toHaveAttribute('sandbox','');
 const simulations=page.getByRole('group',{name:'Layout preview simulation'});
 await simulations.getByRole('button',{name:'Images off',exact:true}).click();await expect(frame).toHaveAttribute('data-preview-simulation','images_off');expect(await frame.getAttribute('srcdoc')).not.toContain('<img');
 await simulations.getByRole('button',{name:'Dark-mode approximation',exact:true}).click();await expect(frame).toHaveAttribute('data-preview-simulation','dark_approximation');await expect(frame).toHaveCSS('filter','invert(0.88) hue-rotate(180deg)');
 await expect(page.getByRole('note')).toContainText('not Gmail, Outlook, Apple Mail or mobile-client acceptance');
 await simulations.getByRole('button',{name:'Normal',exact:true}).click();await expect(frame).toHaveAttribute('data-preview-simulation','normal');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
