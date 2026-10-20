import {test,expect} from '@playwright/test';

test('Operations refresh invalidates old truth and optional destination errors preserve the new summary',async({page})=>{
 const writes:string[]=[],errors:string[]=[];let failPrimary=false,failOptional=false,hold=false,release!:()=>void;
 page.on('pageerror',e=>errors.push(e.message));
 let sequence=1;
 const counts={total:12,pending:3,overdue:2,held:1,approved:4,denied:1,expired:1,cancelled:1,approved_unused:1,execution_unknown:0,execution_failed:0,email_failed:1,webhook_failed:0,delivery_failed:1};
 const makeSummary=()=>({as_of:1792500000+sequence,counts:{...counts,pending:sequence},recovery_paused:false,approval_latency_seconds:null,approval_latency_median_seconds:null,approval_latency_sample_count:0,integrations:[],semantics:{},decision_email_security:{active_issuances:1}});
 await page.route('**/api/v1/**',async route=>{
  const q=route.request(),p=new URL(q.url()).pathname;
  if(q.method()!=='GET'){writes.push(q.method()+' '+p);return route.abort();}
  if(p==='/api/v1/admin/operations'){
   if(hold)await new Promise<void>(r=>release=r);
   if(failPrimary)return route.abort('failed');
   return route.fulfill({json:makeSummary()});
  }
  if(p==='/api/v1/admin/notification-destinations')return failOptional?route.abort('failed'):route.fulfill({json:[]});
  throw Error('Unexpected read: '+p);
 });
 await page.goto('/tests/canvas/operations.html');
 const count=page.getByRole('region',{name:'Approval work',exact:true}).getByRole('button',{name:/^Pending approvals/}).locator('strong');
 const refresh=page.getByRole('button',{name:'Refresh',exact:true});
 await expect(count).toHaveText('1');await expect(refresh).toBeEnabled();
 hold=true;failPrimary=true;await refresh.click();await expect.poll(()=>typeof release).toBe('function');
 await expect(count).toHaveText('—');await expect(page.getByText('Snapshot as of',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Delivery readiness unavailable',{exact:true})).toBeVisible();
 release();hold=false;await expect(page.getByText('Unable to complete',{exact:true})).toBeVisible();
 await expect(count).toHaveText('—');await expect(page.getByText('Email approval verification',{exact:true})).toHaveCount(0);
 failPrimary=false;sequence=2;await refresh.click();await expect(count).toHaveText('2');await expect(refresh).toBeEnabled();
 await expect(page.getByText('Unable to complete',{exact:true})).toHaveCount(0);await expect(page.getByText('Delivery readiness unavailable',{exact:true})).toHaveCount(0);
 // Losing only optional delivery metadata must not hide the newly loaded core summary.
 failOptional=true;sequence=3;await refresh.click();await expect(count).toHaveText('3');await expect(refresh).toBeEnabled();
 await expect(page.getByText('Delivery readiness unavailable',{exact:true})).toBeVisible();await expect(page.getByText('Unable to complete',{exact:true})).toHaveCount(0);
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
