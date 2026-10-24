import {test,expect,type Page} from '@playwright/test';
const route='/tests/canvas/integration-registration-navigation.html';
async function setup(page:Page){
 const seen={reads:[] as string[],writes:[] as string[],errors:[] as string[]};
 page.on('pageerror',e=>seen.errors.push(e.message));
 await page.route('**/api/v1/**',r=>{
  const req=r.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){seen.writes.push(req.method()+' '+path);return r.abort();}
  seen.reads.push(path);
  if(path==='/api/v1/integrations')return r.fulfill({json:[]});
  seen.errors.push('UNEXPECTED_READ '+path);return r.abort();
 });
 await page.goto(route);
 await expect(page.getByRole('navigation',{name:'Integration tasks'})).toBeVisible();
 return seen;
}
const shell=(page:Page)=>page.getByRole('navigation',{name:'Synthetic Grant admin shell'});
const dialog=(page:Page)=>page.getByRole('alertdialog',{name:'Discard unsaved integration changes?'});
async function create(page:Page){
 await page.getByRole('navigation',{name:'Integration tasks'})
  .getByRole('button',{name:'Add connection',exact:true}).click();
 await expect(page.getByLabel('Integration name',{exact:true})).toBeVisible();
}
test('new unsubmitted connection prompts before shell navigation; Keep/Escape preserve and Discard is explicit',async({page})=>{
 const seen=await setup(page);
 await create(page);
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 await shell(page).getByRole('button',{name:'Integrations destination'}).click();
 await create(page);
 const name=page.getByLabel('Integration name',{exact:true});
 await name.fill('UNSAVED CONSUMER LOCAL CONNECTION');
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(name).toHaveValue('UNSAVED CONSUMER LOCAL CONNECTION');
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page).getByRole('button',{name:'Keep editing'})).toBeFocused();
 await dialog(page).press('Escape');
 await expect(dialog(page)).toHaveCount(0);
 await expect(name).toHaveValue('UNSAVED CONSUMER LOCAL CONNECTION');
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});
test('hidden Add connection draft is protected against browser Back and reopens intact',async({page})=>{
 const seen=await setup(page);
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await shell(page).getByRole('button',{name:'Integrations destination'}).click();
 await create(page);
 const name=page.getByLabel('Integration name',{exact:true});
 await name.fill('INTEGRATION HIDDEN DRAFT');
 await page.getByLabel('Decision verification minimum',{exact:true}).selectOption('EMAIL_PIN_PLUS_OTP');
 await page.getByRole('navigation',{name:'Integration tasks'})
  .getByRole('button',{name:'Connections',exact:true}).click();
 await page.evaluate(()=>history.back());
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await dialog(page).press('Escape');
 await expect(dialog(page)).toHaveCount(0);
 await create(page);
 await expect(name).toHaveValue('INTEGRATION HIDDEN DRAFT');
 await expect(page.getByLabel('Decision verification minimum',{exact:true})).toHaveValue('EMAIL_PIN_PLUS_OTP');
 await page.evaluate(()=>history.back());
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});
test('reviewed connection is still an unsent draft: global navigation cannot commit or erase it',async({page})=>{
 const seen=await setup(page);
 await create(page);
 await page.getByLabel('Integration name',{exact:true}).fill('PREVIEW ONLY LOCAL');
 await page.getByLabel('Decision verification minimum',{exact:true}).selectOption('EMAIL_PIN');
 await page.getByLabel('Registered callback URL',{exact:true})
  .fill('https://receiver.example.invalid/approval-callback');
 await page.getByRole('button',{name:'Review connection registration',exact:true}).click();
 await expect(page.getByText('Review registered connection',{exact:true})).toBeVisible();
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(page.getByText('Review registered connection',{exact:true})).toBeVisible();
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});

test('one-shot connection creation locks shell navigation until server reconciliation; no duplicate POST',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve});
 let postStarted=false,postCount=0;
 let saved:Array<Record<string,unknown>>=[];
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async r=>{
  const req=r.request(),path=new URL(req.url()).pathname;
  if(req.method()==='GET'&&path==='/api/v1/integrations'){
   return r.fulfill({json:saved});
  }
  if(req.method()==='POST'&&path==='/api/v1/integrations'){
   postStarted=true;postCount++;
   await held;
   const input=req.postDataJSON() as Record<string,unknown>;
   const row={id:'local-registration-receipt',name:input.name,kind:input.kind,
    decision_verification_minimum:input.decision_verification_minimum,
    event_format:input.event_format,enabled:true,callback_origin:input.callback_url,
    tenant:'',headers:{},};
   saved=[row];
   return r.fulfill({status:201,json:row});
  }
  errors.push('UNEXPECTED '+req.method()+' '+path);
  return r.abort();
 });
 await page.goto(route);
 await expect(page.getByRole('navigation',{name:'Integration tasks'})).toBeVisible();
 await create(page);
 await page.getByLabel('Integration name',{exact:true}).fill('LOCAL VERIFIED REVIEW ONLY');
 await page.getByLabel('Decision verification minimum',{exact:true}).selectOption('EMAIL_PIN');
 await page.getByLabel('Registered callback URL',{exact:true})
   .fill('https://receiver.example.invalid/approval-callback');
 await page.getByRole('button',{name:'Review connection registration',exact:true}).click();
 await expect(page.getByText('Review registered connection',{exact:true})).toBeVisible();
 expect(postCount).toBe(0);
 await page.getByRole('button',{name:'Confirm create connection',exact:true}).click();
 try{
  await expect.poll(()=>postStarted).toBe(true);
  await shell(page).getByRole('button',{name:'Home destination'}).click();
  await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
  await expect(dialog(page)).toHaveCount(0);
  expect(postCount).toBe(1);
 }finally{release();}
 await expect(page.getByText('Registration acknowledged by the server.',{exact:false})).toBeVisible();
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await page.getByRole('button',{name:'Refresh saved connections'}).click();
 await expect(page.getByRole('button',{name:'Refresh saved connections'})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Integration tasks'})
   .getByRole('button',{name:'Connections',exact:true}).click();
 await expect(page.getByText('LOCAL VERIFIED REVIEW ONLY',{exact:true}).first()).toBeVisible();
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 expect(postCount).toBe(1);
 expect(saved).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('editing registration while a leave prompt is open cancels the stale destination',async({page})=>{
 const seen=await setup(page);
 await create(page);
 const name=page.getByLabel('Integration name',{exact:true});
 await name.fill('FIRST LOCAL VERSION');
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toBeVisible();
 await name.fill('SECOND LOCAL VERSION');
 await expect(dialog(page)).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await expect(name).toHaveValue('SECOND LOCAL VERSION');
 await shell(page).getByRole('button',{name:'Home destination'}).click();
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(name).toHaveValue('SECOND LOCAL VERSION');
 expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);
});
