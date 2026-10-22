import {test,expect,type Page} from '@playwright/test';
const route='/tests/canvas/delegation-navigation.html';
async function setup(page:Page){
 const observed={writes:[] as string[],errors:[] as string[],reads:[] as string[]};
 page.on('pageerror',error=>observed.errors.push(error.message));
 await page.route('**/api/v1/**',r=>{
  const req=r.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){observed.writes.push(req.method()+' '+path);return r.abort();}
  observed.reads.push(path);
  if(path==='/api/v1/delegations')return r.fulfill({json:[]});
  if(path==='/api/v1/approvers/directory')return r.fulfill({json:[
   {id:'colleague-1',username:'Test Colleague',email:'colleague@example.invalid',role:'member',enabled:true}
  ]});
  observed.errors.push('UNEXPECTED_READ '+path);return r.abort();
 });
 await page.goto(route);
 await expect(page.getByText('Delegate my approvals',{exact:true})).toBeVisible();
 return observed;
}
const navigation=(page:Page)=>page.getByRole('navigation',{name:'Synthetic Grant member shell'});
const dialog=(page:Page)=>page.getByRole('alertdialog',{name:'Discard unsaved delegation changes?'});
test('PF05 dirty delegation schedule survives shell navigation until explicit review/discard',async({page})=>{
 const seen=await setup(page);
 const starts=page.getByLabel('Starts at',{exact:true});
 await starts.fill('2030-12-30T10:15');
 const original=await starts.inputValue();
 await navigation(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(starts).toHaveValue(original);
 await navigation(page).getByRole('button',{name:'Home destination'}).click();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});
test('PF05 browser Back and Escape do not silently discard selected substitute',async({page})=>{
 const seen=await setup(page);
 await navigation(page).getByRole('button',{name:'Home destination'}).click();
 await navigation(page).getByRole('button',{name:'Delegations destination'}).click();
 const substitute=page.getByLabel('Substitute approver',{exact:true});
 await substitute.selectOption('colleague-1');
 await page.evaluate(()=>history.back());
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await expect(dialog(page).getByRole('button',{name:'Keep editing'})).toBeFocused();
 await dialog(page).press('Escape');
 await expect(dialog(page)).toHaveCount(0);
 await expect(substitute).toHaveValue('colleague-1');
 await page.evaluate(()=>history.back());
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});
test('PF05 untouched delegation form allows normal navigation with no extra prompt',async({page})=>{
 const seen=await setup(page);
 await navigation(page).getByRole('button',{name:'Home destination'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 await expect(dialog(page)).toHaveCount(0);
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});
