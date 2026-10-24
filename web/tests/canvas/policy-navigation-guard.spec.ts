import {test,expect,type Page} from '@playwright/test';

const saved={
 id:'unsaved-nav',version_id:'unsaved-nav-v1',version:1,name:'Stored navigation policy',
 lifecycle:'DRAFT',enabled:false,active_version:null,active_version_id:null,
 integration_id:'integration-1',approver_id:'approver-1',approval_mode:'SINGLE',
 approver_group_id:null,approvals_required:null,action_kind:'service.restart',
 email_template_id:null,deadline_seconds:86400,reminder_seconds:3600,
 max_reminders:3,grant_seconds:900,tenant_selector:'',environment:'',
 severity:'',risk_level:'',denial_reason_required:false,
 verification_mode:'INHERIT',decision_link_ttl_seconds:null,
 created_at:1792500000,updated_at:1792500001,
};
const editor='/tests/canvas/policy-navigation.html';
async function setup(page:Page){
 const state={writes:[] as string[],errors:[] as string[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('**/api/v1/**',route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(request.method()!=='GET'){state.writes.push(request.method()+' '+path);return route.abort();}
  if(path==='/api/v1/profiles')return route.fulfill({json:[saved]});
  if(path==='/api/v1/integrations')return route.fulfill({json:[{id:'integration-1',name:'Test only',enabled:true}]});
  if(path==='/api/v1/admin/users')return route.fulfill({json:[{id:'approver-1',displayName:'Test reviewer',status:'enabled'}]});
  if(path==='/api/v1/notification-template-sets'||path==='/api/v1/approver-groups')return route.fulfill({json:[]});
  state.writes.push('UNKNOWN_GET '+path);return route.abort();
 });
 await page.goto(editor);
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 return state;
}
async function editSaved(page:Page){
 await page.getByRole('button',{name:'Open',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Policy name',exact:true}).fill('Unsaved navigation value');
 await expect(page.getByText('Unsaved policy changes',{exact:false})).toBeVisible();
}
async function expectNoMutations(state:{writes:string[];errors:string[]}){
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
}
test('dirty existing policy shell Home demands explicit discard, Keep editing retains draft',async({page})=>{
 const state=await setup(page);
 await editSaved(page);
 await page.getByRole('navigation',{name:'Synthetic Grant policy shell'})
   .getByRole('button',{name:'Home destination'}).click();
 await expect(page.getByRole('alertdialog',{name:'Discard unsaved policy changes?'})).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(editor);
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Policy name',exact:true})).toHaveValue('Unsaved navigation value');
 await page.getByRole('navigation',{name:'Synthetic Grant policy shell'})
   .getByRole('button',{name:'Home destination'}).click();
 await page.getByRole('button',{name:'Discard and leave',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/tests/canvas/other');
 await expectNoMutations(state);
});
test('new unsaved policy shell navigation requires discard; clean saved policy exits directly',async({page})=>{
 const state=await setup(page);
 const nav=page.getByRole('navigation',{name:'Synthetic Grant policy shell'});
 await page.getByRole('button',{name:'Open',exact:true}).first().click();
 await nav.getByRole('button',{name:'Home destination'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 await nav.getByRole('button',{name:'Approval policies destination'}).click();
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 await page.getByRole('button',{name:'Create policy',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Policy name',exact:true});
 await name.fill('Unsubmitted policy');
 await nav.getByRole('button',{name:'Home destination'}).click();
 await expect(page.getByRole('alertdialog',{name:'Discard unsaved policy changes?'})).toBeVisible();
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(name).toHaveValue('Unsubmitted policy');
 await nav.getByRole('button',{name:'Home destination'}).click();
 await page.getByRole('button',{name:'Discard and leave',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 await expectNoMutations(state);
});
test('browser Back with dirty policy returns to editor on Keep; leaves once after explicit discard',async({page})=>{
 const state=await setup(page);
 const nav=page.getByRole('navigation',{name:'Synthetic Grant policy shell'});
 await nav.getByRole('button',{name:'Home destination'}).click();
 await nav.getByRole('button',{name:'Approval policies destination'}).click();
 await expect(page.getByRole('heading',{name:'Approval policies',level:2})).toBeVisible();
 await editSaved(page);
 await page.evaluate(()=>history.back());
 await expect(page.getByRole('alertdialog',{name:'Discard unsaved policy changes?'})).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(editor);
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Policy name',exact:true})).toHaveValue('Unsaved navigation value');
 await page.evaluate(()=>history.back());
 await expect(page.getByRole('alertdialog',{name:'Discard unsaved policy changes?'})).toBeVisible();
 await page.getByRole('button',{name:'Discard and leave',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/tests/canvas/other');
 await expectNoMutations(state);
});

test('Escape restores draft; further editing invalidates staged shell-exit consent',async({page})=>{
 const state=await setup(page);
 await editSaved(page);
 const nav=page.getByRole('navigation',{name:'Synthetic Grant policy shell'});
 await nav.getByRole('button',{name:'Home destination'}).click();
 const review=page.getByRole('alertdialog',{name:'Discard unsaved policy changes?'});
 await expect(review).toBeVisible();
 await review.press('Escape');
 await expect(review).toHaveCount(0);
 const name=page.getByRole('textbox',{name:'Policy name',exact:true});
 await expect(name).toHaveValue('Unsaved navigation value');
 await nav.getByRole('button',{name:'Home destination'}).click();
 await expect(review).toBeVisible();
 await name.fill('Unsaved changed again');
 await expect(review).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).pathname).toBe(editor);
 await expect(name).toHaveValue('Unsaved changed again');
 await nav.getByRole('button',{name:'Home destination'}).click();
 await expect(review).toBeVisible();
 await review.getByRole('button',{name:'Keep editing'}).click();
 await expect(name).toHaveValue('Unsaved changed again');
 await expectNoMutations(state);
});
