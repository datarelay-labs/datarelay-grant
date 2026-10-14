import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';

const outline=(page:any)=>page.getByRole('navigation',{name:'Email blocks'});

test('U1.05 adds edits moves removes and reuses bounded content blocks, then saves and reopens exact order',async({page})=>{
 test.setTimeout(120000);const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const nav=outline(page),canvas=page.getByLabel('Selectable email canvas');
 await nav.getByRole('button',{name:'Add content block',exact:true}).click();
 await expect(page.getByRole('region',{name:'Selected block properties'})).toContainText('Content 1');
 await page.getByLabel('Content block wording',{exact:true}).fill('First {{target}}');
 await expect(canvas).toContainText('First collector-01');
 await nav.getByRole('button',{name:'Add content block',exact:true}).click();
 await page.getByLabel('Content block wording',{exact:true}).fill('Second explanation');
 await expect(canvas).toContainText('Second explanation');
 await page.getByRole('button',{name:'Move content earlier',exact:true}).click();
 await expect.poll(async()=>nav.locator('button[aria-controls="grant-email-properties"]').allTextContents()).toEqual([
  'Subject','Brand','Heading','Message','Content 2','Content 1','Request detailsProtected','Approval buttonsProtected','VerificationProtected','Footer',
 ]);
 await expect.poll(async()=>{
  const order=await canvas.locator('[data-email-block]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-email-block')));
  return [order.indexOf('content_2'),order.indexOf('content_1'),order.indexOf('request_context')];
 }).toEqual([3,4,5]);
 await nav.getByRole('button',{name:'Content 1',exact:true}).click();await page.getByRole('button',{name:'Remove content block',exact:true}).click();
 await expect(nav.getByRole('button',{name:'Content 1',exact:true})).toHaveCount(0);await expect(canvas).not.toContainText('First collector-01');
 await nav.getByRole('button',{name:'Add content block',exact:true}).click();await page.getByLabel('Content block wording',{exact:true}).fill('Re-added {{reason}}');
 await expect(canvas).toContainText('Re-added Synthetic preview only');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].design!.shared_layout_revision).toBe(7);
 expect(state.rows[0].design!.blocks).toEqual(['brand','heading','message','content_2','content_1','request_context','actions','verification','footer']);
 expect((state.rows[0].design as any).optional_content).toEqual({content_2:'Second explanation',content_1:'Re-added {{reason}}'});
 expect(state.rows[0].published_revision).toBe(1);
 await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await expect(nav.getByRole('button',{name:'Content 2',exact:true})).toBeVisible();await expect(nav.getByRole('button',{name:'Content 1',exact:true})).toBeVisible();
 const reopened=await nav.locator('button[aria-controls="grant-email-properties"]').allTextContents();expect(reopened.indexOf('Content 2')).toBeLessThan(reopened.indexOf('Content 1'));
 await expect(canvas).toContainText('Second explanation');await expect(canvas).toContainText('Re-added Synthetic preview only');
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});
