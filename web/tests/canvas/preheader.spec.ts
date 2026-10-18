import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';

test('U2.03 preheader is event-scoped editable metadata and persists only in a saved draft',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Subject',exact:true}).click();
 await page.getByLabel('Event preheader',{exact:true}).fill('Review sample {{target}}');
 await expect(page.getByLabel('Inbox preheader preview')).toHaveText('Review sample collector-01');
 await expect(page.getByLabel('Selectable email canvas')).not.toContainText('Review sample collector-01');
 await page.getByLabel('Event',{exact:true}).selectOption('reminder');await expect(page.getByLabel('Event preheader',{exact:true})).toHaveValue('');
 await page.getByLabel('Event preheader',{exact:true}).fill('별도의 알림 요약');
 await page.getByLabel('Event',{exact:true}).selectOption('requested');await expect(page.getByLabel('Event preheader',{exact:true})).toHaveValue('Review sample {{target}}');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);expect(state.rows[0].published_revision).toBe(1);
 await page.getByRole('button',{name:'Refresh saved template set'}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Subject',exact:true}).click();
 await expect(page.getByLabel('Event preheader',{exact:true})).toHaveValue('Review sample {{target}}');expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});

test('U2.03 variable insertion targets the focused preheader without modifying the subject',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Subject',exact:true}).click();
 const subject=page.getByLabel('Event subject'),original=await subject.inputValue();
 const preheader=page.getByLabel('Event preheader',{exact:true});await preheader.fill('Review here');await preheader.evaluate((input:HTMLInputElement)=>input.setSelectionRange(7,11));
 await page.getByText('Insert variable',{exact:true}).click();await page.getByLabel('Find a variable').fill('Target');
 await page.getByRole('region',{name:'Selected block properties'}).getByRole('button').filter({hasText:'The affected resource.'}).click();
 await expect(preheader).toHaveValue('Review {{target}}');await expect(subject).toHaveValue(original);
 expect(await preheader.evaluate((input:HTMLInputElement)=>input.selectionStart)).toBe(17);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
