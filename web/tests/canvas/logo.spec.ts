import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAKCAIAAAAhCwk/AAAAGUlEQVR4nGPkkjNioAZgooopowaNGkQlAAAfNQBuSXWTRwAAAABJRU5ErkJggg==','base64');
const outline=(page:any)=>page.getByRole('navigation',{name:'Email blocks'});

test('U6.02 U6.03 bounded logo upload renders inertly, preserves layout 7, saves/reopens, and removal keeps immutable asset',async({page})=>{
 test.setTimeout(120000);const state=await notificationsFixture(page);await openSyntheticEditor(page);const nav=outline(page);
 await nav.getByRole('button',{name:'Add content block',exact:true}).click();await page.getByLabel('Content block wording',{exact:true}).fill('Keep optional explanation.');
 await nav.getByRole('button',{name:'Brand',exact:true}).click();
 await page.getByLabel('Logo image upload',{exact:true}).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});
 await expect(page.getByRole('region',{name:'Email logo controls'})).toContainText('Logo normalized and stored as an immutable local asset.');
 await expect.poll(()=>state.assets.size).toBe(1);const id=[...state.assets.keys()][0]!;
 await expect(page.getByRole('region',{name:'Email logo controls'})).toContainText(id.slice(0,12));
 const canvas=page.getByLabel('Selectable email canvas');await expect(canvas.locator('img')).toHaveCount(1);
 await expect(canvas.locator('img')).toHaveAttribute('src',/^data:image\/png;base64,/);await expect(canvas).toContainText('DataRelay Grant');
 await page.getByLabel('Rendered logo width (px)',{exact:true}).fill('200');
 await expect.poll(()=>state.rows[0].design?.shared_layout_revision).toBe(5); // only saved row remains unchanged before Save.
 const format=page.getByRole('group',{name:'Preview format'});await format.getByRole('button',{name:'Layout preview',exact:true}).click();
 const frame=page.getByTitle('Inert approval email preview');await expect(frame).toHaveAttribute('sandbox','');
 await expect.poll(async()=>await frame.getAttribute('srcdoc')).toContain('img-src data:');await expect.poll(async()=>await frame.getAttribute('srcdoc')).toContain('data:image/png;base64,');
 await page.getByRole('group',{name:'Layout preview simulation'}).getByRole('button',{name:'Images off',exact:true}).click();
 await expect.poll(async()=>await frame.getAttribute('srcdoc')).not.toContain('<img');await expect.poll(async()=>await frame.getAttribute('srcdoc')).toContain('DataRelay Grant');
 await page.getByRole('group',{name:'Preview format'}).getByRole('button',{name:'Edit canvas',exact:true}).click();
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].design!.shared_layout_revision).toBe(7);expect(state.rows[0].design!.logo_asset_id).toBe(id);expect(state.rows[0].design!.logo_width).toBe(200);
 expect((state.rows[0].design as any).optional_content).toEqual({content_1:'Keep optional explanation.'});expect(state.rows[0].published_revision).toBe(1);
 await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await nav.getByRole('button',{name:'Brand',exact:true}).click();await expect(page.getByRole('region',{name:'Email logo controls'})).toContainText(id.slice(0,12));await expect(page.getByLabel('Rendered logo width (px)',{exact:true})).toHaveValue('200');
 await expect(canvas.locator('img')).toHaveCount(1);await page.getByRole('button',{name:'Remove logo from draft',exact:true}).click();await expect(canvas.locator('img')).toHaveCount(0);
 expect(state.assets.has(id)).toBe(true);expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});
