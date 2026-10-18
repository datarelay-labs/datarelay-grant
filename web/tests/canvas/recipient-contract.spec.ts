import {test,expect,type Page} from '@playwright/test';
import {createEmailDesign} from '../../src/email_design';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';

function drafts(page:Page){
 const values:any[]=[];
 page.on('request',request=>{
  if(request.url().endsWith('/notification-template-drafts/preview')&&request.method()==='POST'){
   const value=request.postDataJSON().template;if(value.name!=='Style example')values.push(value);
  }
 });
 return ()=>values.at(-1);
}
const blocks=(page:Page)=>page.getByRole('navigation',{name:'Email blocks'});

test('U3.02 S M L and bounded spacing survive save/reopen without mobile clipping',async({page})=>{
 test.setTimeout(120000);const current=drafts(page),state=await notificationsFixture(page);await openSyntheticEditor(page);
 await blocks(page).getByRole('button',{name:/^Approval buttons/}).click();
 const sizes=page.getByRole('group',{name:'Button size',exact:true});
 for(const [size,font,padY] of [['S',14,10],['M',16,12],['L',20,16]] as const){
  await sizes.getByRole('button').filter({hasText:size}).click();
  await expect.poll(()=>current()?.design.button_size).toBe(size);
  expect(current().design.styles.button_font_size).toBe(font);expect(current().design.styles.button_padding_y).toBe(padY);
  expect(24+2*padY).toBe({S:44,M:48,L:56}[size]);
 }
 await page.getByText('Advanced button appearance',{exact:true}).click();
 await page.getByLabel('Horizontal padding (px)',{exact:true}).fill('28');
 await page.getByLabel('Vertical padding (px)',{exact:true}).fill('15');
 await page.getByLabel('Button gap (px)',{exact:true}).fill('14');
 await page.getByLabel('Corner radius (px)',{exact:true}).fill('10');
 await expect.poll(()=>current()?.design.styles.button_radius).toBe(10);
 for(const width of [320,375,390]){
  await page.setViewportSize({width,height:844});
  await page.getByLabel('Preview width').selectOption(String(width));
  const canvas=page.getByLabel('Selectable email canvas');
  await expect(canvas.getByText('Approve',{exact:true}).first()).toBeVisible();
  await expect(canvas.getByText('Hold',{exact:true}).first()).toBeVisible();
  await expect(canvas.getByText('Deny',{exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 }
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].design!.button_size).toBe('L');expect(state.rows[0].design!.styles.button_padding_x).toBe(28);
 await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();
 await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await blocks(page).getByRole('button',{name:/^Approval buttons/}).click();
 await expect(page.getByLabel('Horizontal padding (px)',{exact:true})).toHaveValue('28');expect(state.errors).toEqual([]);
});

test('U3.04 U3.05 U3.06 keep canonical actions, distinct details and policy-correct verification across event eligibility',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await blocks(page).getByRole('button',{name:/^Approval buttons/}).click();await page.getByText('Button descriptions',{exact:true}).click();
 await page.getByLabel('Approve description',{exact:true}).fill('Scheduled window');
 const canvas=page.getByLabel('Selectable email canvas');
 await expect(canvas).toContainText('Approve · Scheduled window');await expect(canvas).toContainText('Hold');await expect(canvas).toContainText('Deny');await expect(canvas).toContainText('View Details');
 await page.getByText('Sample data',{exact:true}).click();
 await page.getByLabel('Sample verification mode').selectOption('EMAIL_PIN');await expect(canvas).toContainText('No account login is required');await expect(canvas).toContainText('Confirm');
 await page.getByLabel('Sample verification mode').selectOption('EMAIL_PIN_PLUS_OTP');await expect(canvas).toContainText('additional email OTP');await expect(canvas).toContainText('not an independent MFA factor');
 await page.getByLabel('Sample verification mode').selectOption('EMAIL_PIN_PLUS_MFA');await expect(canvas).toContainText('Sign in');await expect(canvas).toContainText('fresh MFA');
 await page.getByLabel('Event',{exact:true}).selectOption('reminder');await expect(canvas).toContainText('Approve · Scheduled window');
 for(const event of ['approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown']){
  await page.getByLabel('Event',{exact:true}).selectOption(event);
  await expect(canvas.getByText(/Approve · Scheduled window/)).toHaveCount(0);await expect(canvas.getByText('Hold',{exact:true})).toHaveCount(0);await expect(canvas.getByText('Deny',{exact:true})).toHaveCount(0);
  await expect(canvas).toContainText('View Details');
 }
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U3.07 and U6.01 safe rich wording plus custom footer keep the mandatory protected notice',async({page})=>{
 const current=drafts(page),state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Literal <script>alert(1)</script> and important');
 const body=page.getByLabel('Event body');await body.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(39,48));await page.getByRole('button',{name:'Bold',exact:true}).click();
 await blocks(page).getByRole('button',{name:'Footer',exact:true}).click();await page.getByLabel('Additional footer wording').fill('Operations review footer');
 await expect.poll(()=>current()?.design.footer).toBe('Operations review footer');
 const canvas=page.getByLabel('Selectable email canvas');await expect(canvas).toContainText('<script>alert(1)</script>');await expect(canvas.locator('script')).toHaveCount(0);
 await expect(canvas).toContainText('Operations review footer');await expect(canvas).toContainText('View Details requires the existing account read access');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);expect(state.rows[0].design!.footer).toBe('Operations review footer');
});

test('U5.08 explicit legacy canvas upgrade preserves all nine event wording and locale and saves only a draft',async({page})=>{
 const state=await notificationsFixture(page);
 const original=structuredClone(state.rows[0].templates);
 state.rows[0].design={...createEmailDesign(),shared_layout_revision:2,locale:'ko',event_preheaders:undefined,palette:undefined} as any;
 await page.reload();
 await expect(page.getByLabel('Email template inventory')).toContainText('Synthetic approval');
 await page.getByRole('button',{name:'Edit draft',exact:true}).first().click();
 await expect(page.getByText('Enable canvas layout',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Enable canvas editing',exact:true}).click();
 await expect(page.getByLabel('Language',{exact:true})).toHaveValue('ko');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].templates).toEqual(original);expect(state.rows[0].design!.locale).toBe('ko');expect(state.rows[0].design!.shared_layout_revision).toBe(5);expect(state.rows[0].published_revision).toBe(1);
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});
