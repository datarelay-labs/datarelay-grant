import {test,expect} from '@playwright/test';
import {notificationsFixture} from './notification-fixture';

test('U2.01 duplicate copies all wording and style then saves only a new unpublished independent draft',async({page})=>{
 const state=await notificationsFixture(page);const original=structuredClone(state.rows[0]);
 await page.getByRole('button',{name:'Duplicate into new draft',exact:true}).click();
 await expect(page.getByLabel('Template set name')).toHaveValue('Synthetic approval (copy)');
 await expect(page.getByLabel('Event body')).toHaveValue(original.templates.requested.body);
 await expect(page.getByLabel('Email draft publication status')).toContainText('Not published');
 expect(state.writes).toEqual([]);await page.getByLabel('Event body').fill('Independent copy wording.');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Confirm template set creation',exact:true}).click();
 await expect.poll(()=>state.rows.length).toBe(2);expect(state.writes).toEqual(['POST']);expect(state.rows[0]).toEqual(original);
 expect(state.rows[1].id).not.toBe(original.id);expect(state.rows[1].published_revision).toBeNull();expect(state.rows[1].design).toEqual(original.design);
 await page.getByRole('button',{name:'Refresh saved template set'}).click();await page.getByRole('button',{name:'Back to email templates'}).click();
 const tile=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:'Synthetic approval (copy)',exact:true})});
 await tile.getByRole('button',{name:'Edit draft',exact:true}).click();await expect(page.getByLabel('Event body')).toHaveValue('Independent copy wording.');expect(state.errors).toEqual([]);
});

test('U2.01 policy usage opens real readonly drill-down and saved update metadata',async({page})=>{
 const state=await notificationsFixture(page);
 await page.getByRole('button',{name:'View policy usage',exact:true}).click();
 const usage=page.getByRole('region',{name:'Active policy usage'});
 await expect(usage).toContainText('Production changes');await expect(usage).toContainText('policy-version-1');await expect(usage).toContainText('Version 3');
 await expect(page.getByLabel('Template last updated')).toBeVisible();
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
