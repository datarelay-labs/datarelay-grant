import {test,expect} from '@playwright/test';

test('a failed authoritative GET consumes a lifecycle confirmation and cannot leave an actionable old review', async ({page}) => {
 const errors:string[]=[],writes:string[]=[],reads:string[]=[];
 let failNextPolicyRead=false,failedReads=0;
 page.on('pageerror',error=>errors.push(error.message));
 const draft={
  id:'draft-for-recovery',version_id:'draft-for-recovery-v1',version:1,name:'Recovery Draft',
  lifecycle:'DRAFT',enabled:false,active_version:null,active_version_id:null,
  integration_id:'integration-1',approver_id:'approver-1',approval_mode:'SINGLE',
  approver_group_id:null,approvals_required:null,action_kind:'service.restart',email_template_id:null,
  deadline_seconds:86400,reminder_seconds:3600,max_reminders:3,grant_seconds:900,
  tenant_selector:'',environment:'',severity:'',risk_level:'',
  denial_reason_required:false,verification_mode:'INHERIT',decision_link_ttl_seconds:null,
  created_at:1792500000,updated_at:1792500001,
 };
 await page.route('**/api/v1/**',async route=>{
  const q=route.request(),p=new URL(q.url()).pathname;
  if(q.method()!=='GET'){writes.push(q.method()+' '+p);return route.abort();}
  reads.push(p);
  if(p==='/api/v1/profiles'){
   if(failNextPolicyRead){failNextPolicyRead=false;failedReads++;return route.abort('failed');}
   return route.fulfill({json:[draft]});
  }
  if(p==='/api/v1/integrations')return route.fulfill({json:[{id:'integration-1',name:'Test only'}]});
  if(p==='/api/v1/admin/users')return route.fulfill({json:[{id:'approver-1',displayName:'Test reviewer',status:'enabled'}]});
  if(p==='/api/v1/notification-template-sets'||p==='/api/v1/approver-groups')return route.fulfill({json:[]});
  throw Error('Unexpected policy GET '+p);
 });
 await page.goto('/tests/canvas/policy-transition.html');
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 await page.getByRole('button',{name:'Open',exact:true}).first().click();
 const stage=page.getByRole('button',{name:'Test policy',exact:true});
 await expect(stage).toBeEnabled();
 await stage.click();
 const confirm=page.getByRole('button',{name:'Confirm testing',exact:true});
 await expect(confirm).toBeEnabled();
 failNextPolicyRead=true;
 await confirm.click();
 await expect.poll(()=>failedReads).toBe(1);
 await expect(page.getByText('Unable to complete',{exact:true})).toBeVisible();
 await expect(confirm).toHaveCount(0);
 await expect(stage).toBeEnabled();
 expect(writes).toEqual([]);
 expect(errors).toEqual([]);
 expect(reads.filter(p=>p==='/api/v1/profiles')).toHaveLength(2);
});
