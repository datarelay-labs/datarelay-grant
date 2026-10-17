import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor} from './notification-fixture';

test('U1.07 Grant shell navigation requires explicit discard and keeps dirty state on cancel',async({page})=>{
 const state=await notificationsFixture(page);await page.goto('/tests/canvas/navigation.html');await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Unsaved across shell navigation');
 await page.getByRole('navigation',{name:'Synthetic Grant shell'}).getByRole('button',{name:'Other page',exact:true}).click();
 await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(page.getByLabel('Event body')).toHaveValue('Unsaved across shell navigation');expect(new URL(page.url()).pathname).toBe('/tests/canvas/navigation.html');
 await page.getByRole('navigation',{name:'Synthetic Grant shell'}).getByRole('button',{name:'Other page',exact:true}).click();
 await page.getByRole('button',{name:'Discard unsaved changes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();expect(new URL(page.url()).pathname).toBe('/tests/canvas/other');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U1.07 browser Back restores its history position on Keep and traverses once on Discard',async({page})=>{
 const state=await notificationsFixture(page);await page.goto('/tests/canvas/navigation.html');
 const shell=page.getByRole('navigation',{name:'Synthetic Grant shell'});
 await shell.getByRole('button',{name:'Other page',exact:true}).click();await shell.getByRole('button',{name:'Notifications page',exact:true}).click();
 await openSyntheticEditor(page);await page.getByLabel('Event body').fill('History must retain this draft.');
 await page.evaluate(()=>history.back());await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/tests/canvas/navigation.html');
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(page.getByLabel('Event body')).toHaveValue('History must retain this draft.');
 await page.evaluate(()=>history.back());await page.getByRole('button',{name:'Discard unsaved changes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();await expect.poll(()=>new URL(page.url()).pathname).toBe('/tests/canvas/other');
 await page.evaluate(()=>history.forward());await expect(page.getByLabel('Email template inventory')).toBeVisible();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
