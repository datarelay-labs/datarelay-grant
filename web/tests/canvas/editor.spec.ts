import {test,expect,type Page,type Route} from '@playwright/test';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
function render(payload:unknown):Promise<any>{return new Promise((resolve,reject)=>{
 const child=execFile('uv',['run','--frozen','python','tests/render_email_canvas_sample.py'],{cwd:root,maxBuffer:1024*1024,timeout:15000},(error,stdout,stderr)=>error?reject(Error(stderr)):resolve(JSON.parse(stdout)));
 child.stdin!.end(JSON.stringify(payload));
});}
async function installPreview(page:Page,override?:(route:Route,payload:any,result:any)=>Promise<void>){
 const effects:string[]=[];
 await page.route('**/api/v1/**',async route=>{
  if(!route.request().url().endsWith('/notification-template-drafts/preview')){effects.push(route.request().url());await route.abort();return;}
  const payload=route.request().postDataJSON(),result=await render(payload);
  if(override)await override(route,payload,result);else await route.fulfill({json:result});
 });
 await page.goto('/tests/canvas/index.html');
 await expect(page.locator('[data-email-block="message"]')).toBeVisible();
 return effects;
}
const draft=async(page:Page)=>JSON.parse((await page.getByLabel('Current draft JSON').textContent())!);
const outline=(page:Page)=>page.getByRole('navigation',{name:'Email blocks'});

test('selects actual email blocks, edits copy and button style without navigation or effects',async({page})=>{
 const effects=await installPreview(page);
 await page.locator('[data-email-block="message"]').click();
 await page.getByLabel('Event body').fill('Our custom change explanation.');
 await page.locator('[data-email-block="actions"]').first().click();
 await page.getByRole('group',{name:'Button size',exact:true}).getByRole('button').filter({hasText:'L'}).click();
 await expect.poll(async()=>(await draft(page)).design.button_size).toBe('L');
 await page.getByLabel('Language',{exact:true}).selectOption('ko');
 await page.getByText('Style presets · Standard',{exact:true}).click();
 await page.getByRole('button',{name:'Use Compact preset'}).click();
 const value=await draft(page);expect(value.templates.requested.body).toBe('Our custom change explanation.');expect(value.design.locale).toBe('ko');
 await page.getByRole('button',{name:'Reset button appearance'}).click();
 expect((await draft(page)).design.locale).toBe('ko');expect((await draft(page)).templates.requested.body).toBe(value.templates.requested.body);
 expect(effects).toEqual([]);expect(page.url()).toContain('/tests/canvas/index.html');
 await page.screenshot({path:'../.dev/email-canvas-desktop.png',fullPage:true});
});

test('friendly variable inserts into subject selection; undo/redo and per-event headings stay independent',async({page})=>{
 await installPreview(page);
 await outline(page).getByRole('button',{name:'Subject',exact:true}).click();
 const subject=page.getByLabel('Event subject');await subject.fill('Hello world');
 await subject.evaluate((element:HTMLInputElement)=>element.setSelectionRange(6,11));
 await page.getByText('Insert variable',{exact:true}).click();
 await page.getByRole('button').filter({hasText:'Request title'}).click();
 expect((await draft(page)).templates.requested.subject).toBe('Hello {{request_title}}');
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await draft(page)).templates.requested.subject).toBe('Hello world');
 await page.getByRole('button',{name:'Redo',exact:true}).click();expect((await draft(page)).templates.requested.subject).toBe('Hello {{request_title}}');
 await outline(page).getByRole('button',{name:'Heading',exact:true}).click();await page.getByLabel('Event heading').fill('Requested heading');
 await page.getByLabel('Event',{exact:true}).selectOption('reminder');await page.getByLabel('Event heading').fill('Reminder heading');
 expect((await draft(page)).design.event_headings).toEqual({requested:'Requested heading',reminder:'Reminder heading'});
});

test('retains last good preview and rejects a late response after a newer edit',async({page})=>{
 let release:()=>void=()=>{},received:()=>void=()=>{};
 const requestArrived=new Promise<void>(resolve=>{received=resolve;});
 const delayed=new Promise<void>(resolve=>{release=resolve;});
 await installPreview(page,async(route,payload,result)=>{
  if(payload.template.templates.requested.body==='Old slow draft'){received();await delayed;}
  await route.fulfill({json:result});
 });
 const body=page.getByLabel('Event body');await body.fill('Old slow draft');await requestArrived;
 await expect(page.getByText('Updating preview — previous result shown.',{exact:true})).toBeVisible();
 await expect(page.locator('[data-email-block="message"]')).toContainText('Please review');
 await body.fill('Newest draft');await expect(page.locator('[data-email-block="message"]')).toContainText('Newest draft');
 release();await expect.poll(async()=>(await page.getByLabel('Preview currency').textContent())).toBe('CURRENT');
 await expect(page.locator('[data-email-block="message"]')).not.toContainText('Old slow draft');
});

test('canvas projection drops active tags, URLs and navigation attributes',async({page})=>{
 const external:string[]=[];page.on('request',request=>{if(request.url().includes('invalid-asset'))external.push(request.url());});
 await installPreview(page,async(route,_payload,result)=>{
  result.rendered.html=result.rendered.html.replace(/<body[^>]*>/i,match=>match+'<script>window.CANVAS_BAD=1</script><img src="https://example.invalid/invalid-asset"><a href="https://example.invalid/evil" onclick="window.CANVAS_BAD=1">Untrusted link</a>');
  await route.fulfill({json:result});
 });
 const canvas=page.getByLabel('Selectable email canvas');
 await expect(canvas.locator('a,img,script,iframe,form,input,svg')).toHaveCount(0);
 await expect(canvas.locator('[href],[src],[onclick]')).toHaveCount(0);
 expect(await page.evaluate(()=>('CANVAS_BAD' in window))).toBe(false);expect(external).toEqual([]);
});

test('390px canvas supports keyboard block selection and unclipped properties',async({page})=>{
 await page.setViewportSize({width:390,height:844});await installPreview(page);
 const heading=outline(page).getByRole('button',{name:'Heading',exact:true});await heading.focus();await page.keyboard.press('Enter');
 await expect(page.getByLabel('Event heading')).toBeVisible();await page.getByLabel('Event heading').fill('새로운 승인 요청 제목');
 await page.getByRole('button',{name:'Close settings'}).click();await expect(page.getByLabel('Event heading')).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'../.dev/email-canvas-mobile.png',fullPage:true});
});
