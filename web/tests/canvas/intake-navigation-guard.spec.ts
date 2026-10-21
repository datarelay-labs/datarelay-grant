import {test,expect,type Page} from '@playwright/test';
const origin='/tests/canvas/intake-navigation.html';

async function setup(page:Page,withActivePolicy=false){
 const state={writes:[] as string[],reads:[] as string[],errors:[] as string[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('**/api/v1/**',route=>{
  const r=route.request(),url=new URL(r.url()),p=url.pathname;
  if(r.method()!=='GET'){state.writes.push(r.method()+' '+p);return route.abort();}
  state.reads.push(p);
  if(p==='/api/v1/profiles')return route.fulfill({json:withActivePolicy?[{
   id:'active-policy-disposable',name:'Safe test operation',enabled:true,lifecycle:'ACTIVE',
   version:1,version_id:'v1',integration_id:'integration-1',action_kind:'test.operation',
   approver_id:'approver-1',approval_mode:'SINGLE',approvals_required:null,
   approver_group_id:null,grant_seconds:900,deadline_seconds:86400,
   reminder_seconds:3600,max_reminders:3,tenant_selector:'',environment:'',
   severity:'',risk_level:'',verification_mode:'EMAIL_PIN'
  }]:[]});
  state.writes.push('UNEXPECTED_GET '+p);return route.abort();
 });
 await page.goto(origin);
 await expect(page.getByRole('heading',{name:'Step 1 · Choose a request type'})).toBeVisible();
 return state;
}
test('requester dirty new form shell navigation protects local title/target until explicit discard',async({page})=>{
 const state=await setup(page);
 const title=page.getByRole('textbox',{name:'Request title',exact:true});
 const target=page.getByRole('textbox',{name:'Target',exact:true});
 await title.fill('Local unsubmitted request');
 await target.fill('isolated-draft');
 const nav=page.getByRole('navigation',{name:'Synthetic Grant requester shell'});
 await nav.getByRole('button',{name:'My requests destination'}).click();
 const alert=page.getByRole('alertdialog',{name:'Discard unsaved request?'});
 await expect(alert).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(origin);
 await alert.getByRole('button',{name:'Keep editing'}).click();
 await expect(title).toHaveValue('Local unsubmitted request');
 await expect(target).toHaveValue('isolated-draft');
 await nav.getByRole('button',{name:'My requests destination'}).click();
 await alert.getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'My requests destination page'})).toBeVisible();
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('untouched new request shell exits directly and discarded form returns clean',async({page})=>{
 const state=await setup(page);
 const nav=page.getByRole('navigation',{name:'Synthetic Grant requester shell'});
 await nav.getByRole('button',{name:'My requests destination'}).click();
 await expect(page.getByRole('heading',{name:'My requests destination page'})).toBeVisible();
 await nav.getByRole('button',{name:'New request destination'}).click();
 const name=page.getByRole('textbox',{name:'Request title',exact:true});
 await expect(name).toHaveValue('');
 await name.fill('new request in progress');
 await nav.getByRole('button',{name:'My requests destination'}).click();
 const dialog=page.getByRole('alertdialog',{name:'Discard unsaved request?'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Discard and leave'}).click();
 await nav.getByRole('button',{name:'New request destination'}).click();
 await expect(page.getByRole('textbox',{name:'Request title',exact:true})).toHaveValue('');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('browser Back rejects unsaved request, Keep restores draft then Discard navigates only once',async({page})=>{
 const state=await setup(page);
 const nav=page.getByRole('navigation',{name:'Synthetic Grant requester shell'});
 await nav.getByRole('button',{name:'My requests destination'}).click();
 await nav.getByRole('button',{name:'New request destination'}).click();
 const title=page.getByRole('textbox',{name:'Request title',exact:true});
 await title.fill('Keep me during browser Back');
 await page.evaluate(()=>history.back());
 const dialog=page.getByRole('alertdialog',{name:'Discard unsaved request?'});
 await expect(dialog).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(origin);
 await dialog.getByRole('button',{name:'Keep editing'}).click();
 await expect(title).toHaveValue('Keep me during browser Back');
 await page.evaluate(()=>history.back());
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'My requests destination page'})).toBeVisible();
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('Escape restores focus and new input invalidates stale requester discard intent',async({page})=>{
 const state=await setup(page);
 const name=page.getByRole('textbox',{name:'Request title',exact:true});
 await name.fill('draft first');
 const nav=page.getByRole('navigation',{name:'Synthetic Grant requester shell'});
 const outgoing=nav.getByRole('button',{name:'My requests destination'});
 await outgoing.click();
 const dialog=page.getByRole('alertdialog',{name:'Discard unsaved request?'});
 await expect(dialog.getByRole('button',{name:'Keep editing'})).toBeFocused();
 await dialog.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(outgoing).toBeFocused();
 await name.fill('draft second');
 await outgoing.click();
 await expect(dialog).toBeVisible();
 await name.fill('draft third');
 await expect(dialog).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).pathname).toBe(origin);
 await expect(name).toHaveValue('draft third');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('selecting an active policy without title and editing only advanced request ID both require explicit discard',async({page})=>{
 const state=await setup(page,true);
 const nav=page.getByRole('navigation',{name:'Synthetic Grant requester shell'});
 const policy=page.getByLabel('Request type',{exact:true});
 await policy.selectOption('active-policy-disposable');
 await expect(page.getByRole('region',{name:'Assigned approval plan'})).toContainText('Safe test operation');
 await nav.getByRole('button',{name:'My requests destination'}).click();
 const dialog=page.getByRole('alertdialog',{name:'Discard unsaved request?'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Keep editing'}).click();
 await expect(policy).toHaveValue('active-policy-disposable');
 await policy.selectOption('');
 await page.getByText('Advanced integration details',{exact:true}).click();
 const external=page.getByRole('textbox',{name:'External request ID',exact:true});
 await external.fill('test-only-advanced-correlation');
 await nav.getByRole('button',{name:'My requests destination'}).click();
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Keep editing'}).click();
 await expect(external).toHaveValue('test-only-advanced-correlation');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
