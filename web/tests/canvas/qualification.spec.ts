/** U7 qualification uses real Grant components and synthetic transport, not personas. */
import {test,expect,type Browser,type Locator,type Page} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor} from './notification-fixture';
async function tabTo(page:Page,target:Locator){
 for(let index=0;index<140;index++){
  if(await target.evaluate(element=>element===document.activeElement))return;
  await page.keyboard.press('Tab');
 }
 throw Error('Keyboard could not reach '+await target.textContent());
}

test('U7 keyboard task selects a preset, edits body and button size, saves and reopens with desktop/mobile evidence',async({page})=>{
 test.setTimeout(150000);const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const summary=page.locator('summary').filter({hasText:'Style presets'});
 await tabTo(page,summary);await page.keyboard.press('Enter');
 await tabTo(page,page.getByRole('button',{name:'Use Compact preset',exact:true}));await page.keyboard.press('Enter');
 await tabTo(page,summary);await page.keyboard.press('Enter');
 const body=page.getByLabel('Event body');await tabTo(page,body);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText('Keyboard-reviewed change window.');
 const actions=page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:/^Approval buttons/});
 await tabTo(page,actions);await page.keyboard.press('Enter');
 const large=page.getByRole('group',{name:'Button size',exact:true}).getByRole('button').filter({hasText:'L'});
 await tabTo(page,large);await page.keyboard.press('Enter');
 await expect(page.getByLabel('Selectable email canvas')).toContainText('Keyboard-reviewed change window.');
 await page.screenshot({path:'../.dev/u7-keyboard-desktop.png',fullPage:true});
 for(const width of [390,375,320]){
  await page.setViewportSize({width,height:844});
  await expect(page.getByRole('region',{name:'Selected block properties'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  const save=page.getByRole('button',{name:'Save draft',exact:true});await expect(save).toBeVisible();
  const box=await save.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+2);
  await page.screenshot({path:`../.dev/u7-keyboard-mobile-${width}.png`,fullPage:true});
 }
 await tabTo(page,page.getByRole('button',{name:'Save draft',exact:true}));await page.keyboard.press('Enter');
 await tabTo(page,page.getByRole('button',{name:'Confirm template set update',exact:true}));await page.keyboard.press('Enter');
 await expect.poll(()=>state.rows[0].draft_revision).toBe(2);expect(state.rows[0].design!.button_size).toBe('L');expect(state.rows[0].design!.preset).toBe('compact');
 expect(state.rows[0].templates.requested.body).toBe('Keyboard-reviewed change window.');expect(state.rows[0].published_revision).toBe(1);
 await tabTo(page,page.getByRole('button',{name:'Refresh saved template set',exact:true}));await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Refresh saved template set',exact:true})).not.toBeVisible();
 await tabTo(page,page.getByRole('button',{name:'Back to email templates'}));await page.keyboard.press('Enter');
 const edit=page.getByRole('button',{name:'Edit draft',exact:true});await tabTo(page,edit);await page.keyboard.press('Enter');
 await expect(page.getByLabel('Selectable email canvas')).toContainText('Keyboard-reviewed change window.');
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});


test('U7.03 exact validation recovery restores focus and clears after a corrected mounted render',async({page})=>{
 test.setTimeout(120000);const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:/^Approval buttons/}).click();
 const hold=page.getByLabel('Hold button color',{exact:true});await hold.fill('#ffffff');
 const alert=page.getByRole('alert').filter({hasText:'Hold button text is difficult to read'});await expect(alert).toBeVisible();
 const recover=alert.getByRole('button',{name:'Edit button colors',exact:true});await tabTo(page,recover);await page.keyboard.press('Enter');await expect(hold).toBeFocused();
 await hold.fill('#854d0e');await expect(alert).toHaveCount(0);await expect(page.getByLabel('Live unsaved email preview')).not.toHaveAttribute('aria-busy','true');
 await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.screenshot({path:'../.dev/u7-error-recovery-mobile-320.png',fullPage:true});
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U7.03 touch-sized narrow interaction opens and closes the actual mobile inspector without clipping',async({browser})=>{
 test.setTimeout(120000);
 const context=await (browser as Browser).newContext({baseURL:'http://127.0.0.1:18979',hasTouch:true,isMobile:true,viewport:{width:375,height:844}});
 const page=await context.newPage();const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const nav=page.getByRole('navigation',{name:'Email blocks'});await nav.getByRole('button',{name:/^Approval buttons/}).tap();
 const panel=page.getByRole('region',{name:'Selected block properties'});await expect(panel).toBeVisible();
 const close=page.getByRole('button',{name:'Close settings',exact:true});const box=await close.boundingBox();expect(box).not.toBeNull();expect(box!.height).toBeGreaterThanOrEqual(44);
 await page.getByRole('group',{name:'Button size',exact:true}).getByRole('button').filter({hasText:'L'}).tap();await expect(page.getByRole('button',{name:/^Approval buttons/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await page.screenshot({path:'../.dev/u7-touch-mobile-375.png',fullPage:true});
 await close.tap();await expect(panel).not.toBeVisible();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);await context.close();
});
