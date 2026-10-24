import {test,expect,type Page} from '@playwright/test';

const original={
 id:'unsaved-draft',version_id:'unsaved-draft-v1',version:1,name:'Stored approval draft',
 lifecycle:'DRAFT',enabled:false,active_version:null,active_version_id:null,
 integration_id:'integration-1',approver_id:'approver-1',approval_mode:'SINGLE',
 approver_group_id:null,approvals_required:null,action_kind:'service.restart',
 email_template_id:null,deadline_seconds:86400,reminder_seconds:3600,
 max_reminders:3,grant_seconds:900,tenant_selector:'',environment:'',
 severity:'',risk_level:'',denial_reason_required:false,
 verification_mode:'INHERIT',decision_link_ttl_seconds:null,
 created_at:1792500000,updated_at:1792500001,
};
async function openPolicies(page:Page,writes:string[]) {
 await page.route('**/api/v1/**',route=>{
  const q=route.request(),p=new URL(q.url()).pathname;
  if(q.method()!=='GET'){writes.push(q.method()+' '+p);return route.abort();}
  if(p==='/api/v1/profiles')return route.fulfill({json:[original]});
  if(p==='/api/v1/integrations')return route.fulfill({json:[{id:'integration-1',name:'Test only',enabled:true}]});
  if(p==='/api/v1/admin/users')return route.fulfill({json:[{id:'approver-1',displayName:'Test reviewer',status:'enabled'}]});
  if(p==='/api/v1/notification-template-sets'||p==='/api/v1/approver-groups')return route.fulfill({json:[]});
  throw Error('Unexpected GET: '+p);
 });
 await page.goto('/tests/canvas/policy-transition.html');
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
}

test('existing edited policy Back asks before discarding; Keep editing retains draft',async({page})=>{
 const writes:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await openPolicies(page,writes);
 await page.getByRole('button',{name:'Open',exact:true}).first().click();
 const name=page.getByRole('textbox',{name:'Policy name',exact:true});
 await expect(name).toHaveValue('Stored approval draft');
 await name.fill('Local unsaved policy name');
 await expect(page.getByText('Unsaved policy changes',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:/Back to policies/}).click();
 const warning=page.getByText('Discard unsaved policy changes?',{exact:true});
 console.log('POLICY_UNSAVED_BACK_COMPONENT',JSON.stringify({type:'existing',warning:(await warning.count())>0,retained:(await name.count())>0,writes,errors}));
 await expect(warning).toBeVisible();
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(name).toHaveValue('Local unsaved policy name');
 await page.getByRole('button',{name:/Back to policies/}).click();
 await page.getByRole('button',{name:'Discard and return to policies',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});

test('new unfinished policy also requires explicit discard before Back',async({page})=>{
 const writes:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await openPolicies(page,writes);
 await page.getByRole('button',{name:'Create policy',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Policy name',exact:true});
 await name.fill('Unsubmitted newly created policy');
 await page.getByRole('button',{name:/Back to policies/}).click();
 const warning=page.getByText('Discard unsaved policy changes?',{exact:true});
 console.log('POLICY_UNSAVED_BACK_COMPONENT',JSON.stringify({type:'new',warning:(await warning.count())>0,retained:(await name.count())>0,writes,errors}));
 await expect(warning).toBeVisible();
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(name).toHaveValue('Unsubmitted newly created policy');
 await page.getByRole('button',{name:/Back to policies/}).click();
 await page.getByRole('button',{name:'Discard and return to policies',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});

test('untouched saved and new policy Back exits normally without discard prompt',async({page})=>{
 const writes:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await openPolicies(page,writes);
 await page.getByRole('button',{name:'Open',exact:true}).first().click();
 await page.getByRole('button',{name:/Back to policies/}).click();
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 await expect(page.getByText('Discard unsaved policy changes?',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Create policy',exact:true}).click();
 await page.getByRole('button',{name:/Back to policies/}).click();
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 await expect(page.getByText('Discard unsaved policy changes?',{exact:true})).toHaveCount(0);
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});
