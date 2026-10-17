import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';

const png='iVBORw0KGgoAAAANSUhEUgAAABgAAAAKCAIAAAAhCwk/AAAAGUlEQVR4nGPkkjNioAZgooopowaNGkQlAAAfNQBuSXWTRwAAAABJRU5ErkJggg==';

test('U6.02 U6.03 uploads only bounded raster logo, renders it, preserves text fallback and saves immutable identity',async({page})=>{
 test.setTimeout(120000);const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const nav=page.getByRole('navigation',{name:'Email blocks'});await nav.getByRole('button',{name:'Brand',exact:true}).click();
 const upload=page.getByLabel('Logo image upload', {exact:true});
 await upload.setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg onload="alert(1)"></svg>')});
 await expect(page.getByRole('region',{name:'Selected block properties'})).toContainText('Only PNG or JPEG raster images are accepted');
 expect(state.assets.size).toBe(0);await expect(page.getByLabel(/logo.*url/i)).toHaveCount(0);
 await upload.setInputFiles({name:'brand.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect.poll(()=>state.assets.size).toBe(1);
 const id=[...state.assets.keys()][0]!;await expect(page.getByText(/Current immutable asset/)).toBeVisible();
 const canvas=page.getByLabel('Selectable email canvas');await expect(canvas.locator('img')).toHaveCount(1);await expect(canvas.locator('img')).toHaveAttribute('alt','DataRelay Grant');
 await page.getByLabel('Rendered logo width (px)',{exact:true}).fill('200');
 await page.getByRole('button',{name:'Layout preview',exact:true}).click();
 const frame=page.frameLocator('iframe[title="Inert approval email preview"]');await expect(frame.locator('img')).toHaveCount(1);await expect(frame.getByText('DataRelay Grant',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Images off',exact:true}).click();await expect(frame.getByText('[Image hidden]',{exact:true})).toBeVisible();await expect(frame.getByText('DataRelay Grant',{exact:true}).first()).toBeVisible();
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].design!.logo_asset_id).toBe(id);expect(state.rows[0].design!.logo_width).toBe(200);expect(state.rows[0].design!.shared_layout_revision).toBe(6);expect(state.rows[0].published_revision).toBe(1);
 await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);await nav.getByRole('button',{name:'Brand',exact:true}).click();
 await expect(page.getByText(/Current immutable asset/)).toContainText(id.slice(0,12));await expect(page.getByLabel('Rendered logo width (px)',{exact:true})).toHaveValue('200');await expect(page.getByLabel('Selectable email canvas').locator('img')).toHaveCount(1);
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});
