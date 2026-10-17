import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';

test('U3.01 U3.03 palette renders actual status/recipient hierarchy and saves independently of publication',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Keep this explanatory content.');
 await page.getByRole('button',{name:'Use Dark mail palette',exact:true}).click();
 const canvas=page.getByLabel('Selectable email canvas');
 await expect(canvas.getByText('Approval requested',{exact:true})).toBeVisible();
 await expect(canvas.locator('[data-email-block="message"] div').first()).toHaveCSS('color','rgb(249, 250, 251)');
 const protectedOrder=await canvas.locator('[data-email-block]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-email-block')));
 expect(protectedOrder.indexOf('actions')).toBeLessThan(protectedOrder.indexOf('verification'));
 await page.screenshot({path:'../.dev/u3-dark-palette-desktop.png',fullPage:true});
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Subject',exact:true}).click();
 await page.getByLabel('Event preheader',{exact:true}).fill('A readable inbox summary');
 await expect(page.getByLabel('Inbox preheader preview')).toHaveText('A readable inbox summary');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].design!.shared_layout_revision).toBe(5);expect(state.rows[0].design!.palette!.content_background).toBe('#111827');
 expect(state.rows[0].published_revision).toBe(1);expect(state.rows[0].templates.requested.body).toBe('Keep this explanatory content.');
 await page.getByRole('button',{name:'Refresh saved template set'}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await expect(page.getByRole('button',{name:'Use Dark mail palette',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(canvas.locator('[data-email-block="message"] div').first()).toHaveCSS('color','rgb(249, 250, 251)');
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});

test('U3.03 custom contrast failures make old render stale, curated recovery works, and palette reset preserves copy at 390px',async({page})=>{
 await page.setViewportSize({width:390,height:844});const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Message',exact:true}).click();
 await page.getByLabel('Event body').fill('Preserve this through palette reset.');
 await page.getByRole('button',{name:'Use Dark mail palette',exact:true}).click();
 await page.getByText('Custom mail colors',{exact:true}).click();await page.getByLabel('Mail body text color',{exact:true}).fill('#111827');
 await expect(page.getByRole('region',{name:'Mail color palette'})).toContainText('These mail colors are not readable enough.');
 await expect(page.getByRole('region',{name:'Live unsaved email preview'})).toContainText('Previous result shown — not valid for review.');
 await page.getByRole('button',{name:'Use Warm mail palette',exact:true}).click();
 await expect(page.getByLabel('Selectable email canvas').locator('[data-email-block="message"] div').first()).toHaveCSS('color','rgb(41, 37, 36)');
 await page.getByRole('button',{name:'Reset mail colors',exact:true}).click();
 await expect(page.getByRole('button',{name:'Use Light mail palette',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByLabel('Event body')).toHaveValue('Preserve this through palette reset.');
 await expect(page.getByRole('region',{name:'Mail color palette'})).not.toContainText('These mail colors are not readable enough.');
 await page.screenshot({path:'../.dev/u3-palette-mobile-390.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});


test('U3.03 palette edits never downgrade a newer optional-content layout',async({page})=>{
 const state=await notificationsFixture(page);state.rows[0].design={...state.rows[0].design!,shared_layout_revision:7,blocks:['brand','heading','message','content_1','request_context','actions','verification','footer'],optional_content:{content_1:'Keep optional context'}} as any;await page.reload();await openSyntheticEditor(page);
 await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:'Message',exact:true}).click();await page.getByRole('button',{name:'Use Dark mail palette',exact:true}).click();
 await expect(page.getByLabel('Selectable email canvas')).toContainText('Keep optional context');await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].design!.shared_layout_revision).toBe(7);expect((state.rows[0].design as any).optional_content).toEqual({content_1:'Keep optional context'});expect(state.errors).toEqual([]);
});
