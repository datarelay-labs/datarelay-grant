/** U7 qualification uses real Grant components and synthetic transport, not personas. */
import {test,expect,type Locator,type Page} from '@playwright/test';
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
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('region',{name:'Selected block properties'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.screenshot({path:'../.dev/u7-keyboard-mobile-390.png',fullPage:true});
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
