import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor} from './notification-fixture';

const postPath=/\/api\/v1\/notification-template-sets\/synthetic-template\/test-send$/;
const statusPath=/\/api\/v1\/notification-template-sets\/synthetic-template\/test-send-attempts\/([^/]+)$/;

async function openReviewedTest(page:any){
 await openSyntheticEditor(page);
 await page.getByText('Saved revision preview and test email',{exact:true}).click();
 const review=page.getByRole('button',{name:'Review: Send test to me',exact:true});
 await expect(review).toBeEnabled();await review.click();
 const confirmation=page.getByText('Confirm test email to my account',{exact:true}).locator('..');
 await expect(confirmation).toContainText('signed-in administrator');
 await expect(confirmation).toContainText('Transport acceptance is not mailbox receipt');
 return confirmation;
}

test('U6.04 U6.05 reviewed proof makes one synthetic send, then durable ACCEPTED reconciliation unlocks a separately reviewed next test',async({page})=>{
 const state=await notificationsFixture(page);let posted:any=null,posts=0,statusReads=0;
 await page.route('**/api/v1/notification-template-sets/synthetic-template/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(postPath.test(path)&&route.request().method()==='POST'){
   posts++;posted=route.request().postDataJSON();
   expect(posted.expected_updated_at).toBe(1);expect(posted.preview_hash).toBe('c'.repeat(64));expect(posted.attempt_id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
   await route.fulfill({json:{attempt_id:posted.attempt_id,state:'ACCEPTED',transport_accepted:true,receipt_confirmed:false,execution_allowed:false,event_id:'synthetic-mail-1'}});return;
  }
  const match=path.match(statusPath);if(match){statusReads++;expect(match[1]).toBe(posted.attempt_id);await route.fulfill({json:{attempt_id:match[1],state:'ACCEPTED',transport_accepted:true,receipt_confirmed:false,execution_allowed:false,outcome_ambiguous:false}});return;}
  await route.fallback();
 });
 const confirmation=await openReviewedTest(page);const attempt=await confirmation.locator('code').last().textContent();
 await page.getByRole('button',{name:'Confirm send test email',exact:true}).click();
 await expect.poll(()=>posts).toBe(1);expect(posted.attempt_id).toBe(attempt);
 const warning=page.getByText('Test email outcome requires reconciliation',{exact:true}).locator('..');await expect(warning).toBeVisible();
 await expect(warning).toContainText('may have been sent');await page.getByRole('button',{name:'Reconcile test-email attempt',exact:true}).click();
 await expect.poll(()=>statusReads).toBe(1);await expect(warning).not.toBeVisible();
 await expect(page.getByText(/Transport acceptance is confirmed/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Review: Send test to me',exact:true})).toBeEnabled();
 expect(posts).toBe(1);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U6.05 ambiguous synthetic transport is never replayed; UNKNOWN reconciliation requires a fresh review and a fresh attempt id',async({page})=>{
 const state=await notificationsFixture(page);let attempt='',posts=0,statusReads=0;
 await page.route('**/api/v1/notification-template-sets/synthetic-template/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(postPath.test(path)&&route.request().method()==='POST'){
   posts++;attempt=route.request().postDataJSON().attempt_id;await route.abort('failed');return;
  }
  const match=path.match(statusPath);if(match){statusReads++;expect(match[1]).toBe(attempt);await route.fulfill({json:{attempt_id:attempt,state:'UNKNOWN',transport_accepted:false,receipt_confirmed:false,execution_allowed:false,outcome_ambiguous:true}});return;}
  await route.fallback();
 });
 const confirmation=await openReviewedTest(page);const firstAttempt=await confirmation.locator('code').last().textContent();
 await page.getByRole('button',{name:'Confirm send test email',exact:true}).click();await expect.poll(()=>posts).toBe(1);expect(attempt).toBe(firstAttempt);
 const warning=page.getByText('Test email outcome requires reconciliation',{exact:true}).locator('..');await expect(warning).toBeVisible();
 await page.getByRole('button',{name:'Reconcile test-email attempt',exact:true}).click();await expect.poll(()=>statusReads).toBe(1);await expect(warning).not.toBeVisible();
 await expect(page.getByText(/outcome is unknown and may have delivered/)).toBeVisible();expect(posts).toBe(1);
 await page.getByRole('button',{name:'Review: Send test to me',exact:true}).click();
 const next=page.getByText('Confirm test email to my account',{exact:true}).locator('..');const secondAttempt=await next.locator('code').last().textContent();
 expect(secondAttempt).not.toBe(firstAttempt);expect(posts).toBe(1);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U6.05 ATTEMPTED status remains latched until a later terminal read and does not create another POST',async({page})=>{
 const state=await notificationsFixture(page);let attempt='',posts=0,statusReads=0;
 await page.route('**/api/v1/notification-template-sets/synthetic-template/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(postPath.test(path)&&route.request().method()==='POST'){
   posts++;attempt=route.request().postDataJSON().attempt_id;await route.fulfill({json:{attempt_id:attempt,state:'ACCEPTED',transport_accepted:true,receipt_confirmed:false,execution_allowed:false,event_id:'synthetic-mail-2'}});return;
  }
  if(statusPath.test(path)){statusReads++;const stateValue=statusReads===1?'ATTEMPTED':'ACCEPTED';await route.fulfill({json:{attempt_id:attempt,state:stateValue,transport_accepted:stateValue==='ACCEPTED',receipt_confirmed:false,execution_allowed:false,outcome_ambiguous:false}});return;}
  await route.fallback();
 });
 await openReviewedTest(page);await page.getByRole('button',{name:'Confirm send test email',exact:true}).click();await expect.poll(()=>posts).toBe(1);
 const reconcile=page.getByRole('button',{name:'Reconcile test-email attempt',exact:true});await reconcile.click();await expect.poll(()=>statusReads).toBe(1);
 await expect(page.getByText(/still in progress/)).toBeVisible();await expect(reconcile).toBeVisible();expect(posts).toBe(1);
 await reconcile.click();await expect.poll(()=>statusReads).toBe(2);await expect(reconcile).not.toBeVisible();expect(posts).toBe(1);
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
