import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';

test('U1.07 Back offers Keep editing and explicit Discard without saving',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const body=page.getByLabel('Event body');await body.fill('Unsaved wording that must survive.');
 await page.getByRole('button',{name:'Back to email templates'}).click();
 await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeVisible();
 await page.screenshot({path:'../.dev/u1-07-dirty-exit.png',fullPage:true});
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(body).toHaveValue('Unsaved wording that must survive.');expect(state.writes).toEqual([]);
 await page.getByRole('button',{name:'Back to email templates'}).click();
 await page.getByRole('button',{name:'Discard unsaved changes',exact:true}).click();
 await expect(page.getByLabel('Email template inventory')).toBeVisible();await openSyntheticEditor(page);
 await expect(body).toHaveValue('Please review {{target}}.');expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U1.07 section exit and page unload protect the active dirty draft; Escape keeps edits',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Do not silently lose this change.');
 expect(await page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(true);
 await page.getByRole('navigation',{name:'Notification sections'}).getByRole('button',{name:'Branding',exact:true}).click();
 await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByLabel('Event body')).toHaveValue('Do not silently lose this change.');
 await page.getByRole('navigation',{name:'Notification sections'}).getByRole('button',{name:'Branding',exact:true}).click();
 await page.getByRole('button',{name:'Discard unsaved changes',exact:true}).click();
 await expect(page.getByLabel('Canvas-first email editor')).not.toBeVisible();
 expect(await page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(false);
 expect(state.writes).toEqual([]);
});

test('U1.07 failed save retains local copy through explicit reconciliation and never repeats a write',async({page})=>{
 const state=await notificationsFixture(page);state.failSave=true;await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Retain this after failed save.');await saveSyntheticDraft(page);
 await expect.poll(()=>state.writes).toEqual(['PUT']);await expect(page.getByRole('button',{name:'Refresh saved template set'})).toBeEnabled();
 await expect(page.getByLabel('Event body')).toHaveValue('Retain this after failed save.');
 await expect(page.getByLabel('Email draft publication status')).not.toContainText('Saved draft');
 await page.getByRole('button',{name:'Back to email templates'}).click();await expect(page.getByLabel('Canvas-first email editor')).toBeVisible();
 await page.getByRole('button',{name:'Refresh saved template set'}).click();
 await expect(page.getByLabel('Event body')).toHaveValue('Retain this after failed save.');
 await expect(page.getByLabel('Email draft publication status')).toContainText('Unsaved changes');
 expect(state.rows[0].templates.requested.body).toBe('Please review {{target}}.');expect(state.writes).toEqual(['PUT']);
});

test('U1.07 committed-but-lost response reconciles exact saved state and reopens without false dirty warning',async({page})=>{
 const state=await notificationsFixture(page);state.failSave=true;state.commitThenFail=true;await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Saved despite the lost response.');await saveSyntheticDraft(page);
 await expect(page.getByRole('button',{name:'Refresh saved template set'})).toBeEnabled();
 await page.getByRole('button',{name:'Refresh saved template set'}).click();
 await expect(page.getByLabel('Email draft publication status')).toContainText('Saved draft');
 await page.getByRole('button',{name:'Back to email templates'}).click();
 await expect(page.getByLabel('Email template inventory')).toBeVisible();await openSyntheticEditor(page);
 await expect(page.getByLabel('Event body')).toHaveValue('Saved despite the lost response.');
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});


test('U1.07 new unsaved template is protected at 390px before its first save',async({page})=>{
 await page.setViewportSize({width:390,height:844});const state=await notificationsFixture(page);
 await page.getByRole('button',{name:'Create email template',exact:true}).click();
 await page.getByLabel('Template set name').fill('Unsaved new template');
 await page.getByRole('button',{name:'Back to email templates'}).click();
 await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(page.getByLabel('Template set name')).toHaveValue('Unsaved new template');
 expect(state.writes).toEqual([]);
});
