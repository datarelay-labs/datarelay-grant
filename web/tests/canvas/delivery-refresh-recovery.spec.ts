import {test,expect} from '@playwright/test';

// Exercises actual React handlers; the existing canvas harness has no real mail.
test('delivery refresh invalidates the old resend review even when the read fails',async({page})=>{
 const row={id:'synthetic-failed-delivery',request_id:'synthetic-request',event_type:'requested',state:'FAILED',attempts:1,last_error:'SYNTHETIC_TRANSPORT_FAILURE',created_at:1792500000,transport_accepted:false,receipt_confirmed:false};
 const writes:string[]=[],errors:string[]=[];let fail=false,deliveryReads=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const q=route.request(),pathname=new URL(q.url()).pathname;
  if(q.method()!=='GET'){writes.push(q.method()+' '+pathname);return route.abort();}
  if(pathname.endsWith('/notification-template-sets'))return route.fulfill({json:[]});
  if(pathname.endsWith('/notification-variables'))return route.fulfill({json:{variables:[]}});
  if(pathname.endsWith('/notification-branding'))return route.fulfill({json:{brand_name:'Grant',sender_display_name:'Sender',logo_asset:'/logo.svg'}});
  if(pathname.endsWith('/notification-deliveries')){
   deliveryReads++;if(fail)return route.abort('failed');
   return route.fulfill({json:{deliveries:[row],total:1,offset:0,limit:50,has_more:false}});
  }
  throw Error('Unexpected metadata read: '+pathname);
 });
 await page.goto('/tests/canvas/notifications.html');await page.getByRole('button',{name:'Delivery Health',exact:true}).click();
 const rows=page.locator('.grant-notification-desktop-list tbody tr');
 const review=page.locator('.grant-notification-desktop-list').getByRole('button',{name:'Review resend',exact:true});
 const confirm=page.getByRole('button',{name:'Confirm schedule resend',exact:true});
 await expect(review).toBeEnabled();await review.click();await expect(confirm).toBeEnabled();
 fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(page.getByText('Unable to load current delivery history',{exact:true})).toBeVisible();
 await expect(confirm).toHaveCount(0);await expect(rows).toHaveCount(0);await expect(review).toHaveCount(0);
 await expect(page.getByText('Delivery page unavailable',{exact:true})).toBeVisible();
 fail=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(review).toBeEnabled();
 await expect(page.getByText('Unable to load current delivery history',{exact:true})).toHaveCount(0);
 await expect(rows).toHaveCount(1);await expect(confirm).toHaveCount(0);
 await review.click();await expect(confirm).toBeEnabled();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(confirm).toHaveCount(0);
 expect(deliveryReads).toBe(3);expect(writes).toEqual([]);expect(errors).toEqual([]);
});
