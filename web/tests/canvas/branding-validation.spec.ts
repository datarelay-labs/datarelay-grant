import {test,expect} from '@playwright/test';

// The real Notifications component owns feedback transitions. No backend effect
// is needed here; actual-server qualification is recorded separately in PF05.
test('branding validation is critical, local and recoverable without a save',async({page})=>{
 const writes:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 const saved={brand_name:'Grant original',sender_display_name:'Grant security',logo_asset:'/assets/datarelay-grant-icon.svg'};
 await page.route('**/api/v1/**',async route=>{
  const request=route.request(),pathname=new URL(request.url()).pathname;
  if(request.method()!=='GET'){writes.push(request.method()+' '+pathname);return route.abort();}
  if(pathname.endsWith('/notification-template-sets'))return route.fulfill({json:[]});
  if(pathname.endsWith('/notification-variables'))return route.fulfill({json:{variables:[]}});
  if(pathname.endsWith('/notification-branding'))return route.fulfill({json:saved});
  throw Error('Unexpected metadata read: '+pathname);
 });
 await page.goto('/tests/canvas/notifications.html');
 await page.getByRole('button',{name:'Branding',exact:true}).click();
 const brand=page.getByLabel('Brand name',{exact:true}),sender=page.getByLabel('Sender display name',{exact:true});
 const review=page.getByRole('button',{name:'Review branding',exact:true});
 const guidance=page.getByText('Choose different, non-empty single-line branding and sender names (up to 100 characters each). Refresh saved branding if another administrator changed it.',{exact:true});
 const confirm=page.getByRole('button',{name:'Confirm branding change',exact:true});
 await expect(brand).toHaveValue(saved.brand_name);await expect(review).toBeEnabled();
 // Unchanged input is a non-action, never a successful save.
 await review.click();await expect(guidance).toBeVisible();
 await expect(page.getByRole('alert').filter({has:guidance})).toBeVisible();
 await expect(confirm).toHaveCount(0);
 // Whitespace passes HTML required validation but is invalid domain input.
 await brand.fill('   ');await expect(guidance).toHaveCount(0);
 await review.click();await expect(guidance).toBeVisible();await expect(brand).toHaveValue('   ');
 await expect(confirm).toHaveCount(0);
 await brand.fill('Grant revised');await expect(guidance).toHaveCount(0);
 await sender.fill('   ');await review.click();await expect(guidance).toBeVisible();await expect(sender).toHaveValue('   ');
 await sender.fill('New security sender');await expect(guidance).toHaveCount(0);
 await review.click();await expect(confirm).toBeEnabled();await expect(guidance).toHaveCount(0);
 await page.getByRole('button',{name:'Back to edit',exact:true}).click();await expect(confirm).toHaveCount(0);
 await expect(brand).toHaveValue('Grant revised');await expect(sender).toHaveValue('New security sender');
 // The same obsolete feedback must not leak into another section or its return.
 await brand.fill('   ');await review.click();await expect(guidance).toBeVisible();
 await page.getByRole('button',{name:'Email Templates',exact:true}).click();await expect(guidance).toHaveCount(0);
 await page.getByRole('button',{name:'Branding',exact:true}).click();await expect(guidance).toHaveCount(0);
 await expect(brand).toHaveValue('   ');await expect(confirm).toHaveCount(0);
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});


test('unread saved branding requires an in-place read-only retry before review',async({page})=>{
 const writes:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const saved={brand_name:'Actually saved brand',sender_display_name:'Actually saved sender',logo_asset:'/assets/datarelay-grant-icon.svg'};
 let first=true,release!:()=>void;
 await page.route('**/api/v1/**',async route=>{
  const request=route.request(),pathname=new URL(request.url()).pathname;
  if(request.method()!=='GET'){writes.push(request.method()+' '+pathname);return route.abort();}
  if(pathname.endsWith('/notification-template-sets'))return route.fulfill({json:[]});
  if(pathname.endsWith('/notification-variables'))return route.fulfill({json:{variables:[]}});
  if(pathname.endsWith('/notification-branding')){
   if(first){first=false;return route.abort('failed');}
   await new Promise<void>(resolve=>{release=resolve;});
   return route.fulfill({json:saved});
  }
  throw Error('Unexpected metadata read: '+pathname);
 });
 await page.goto('/tests/canvas/notifications.html');
 await expect(page.getByText('Unable to complete',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Branding',exact:true}).click();
 await expect(page.getByText('Saved branding unavailable',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Brand name',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Review branding',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Confirm branding change',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Retry loading saved branding',exact:true}).click();
 await expect(page.getByText('Loading saved notification branding…',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Brand name',{exact:true})).toHaveCount(0);
 await expect.poll(()=>typeof release).toBe('function');release();
 const brand=page.getByLabel('Brand name',{exact:true});
 await expect(brand).toHaveValue(saved.brand_name);
 await expect(page.getByLabel('Sender display name',{exact:true})).toHaveValue(saved.sender_display_name);
 await expect(page.getByText('Unable to complete',{exact:true})).toHaveCount(0);
 await brand.fill('A newly reviewed brand');
 await page.getByRole('button',{name:'Review branding',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm branding change',exact:true})).toBeEnabled();
 await expect(page.getByText(saved.brand_name,{exact:true})).toBeVisible();
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
