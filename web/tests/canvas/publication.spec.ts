import {test,expect} from '@playwright/test';
const output={subject:'Sample',body:'Sample text',html:'<!doctype html><html><head></head><body><p>Sample only</p></body></html>'};
test('publication requires current saved review, reason and explicit confirmation',async({page})=>{
 let writes=0;let row={id:'synthetic',name:'Synthetic publication',enabled:true,design:{},templates:{},created_at:1,updated_at:1,published_revision:1,draft_revision:2};
 await page.route('**/api/v1/**',async route=>{
  const url=route.request().url();
  if(url.endsWith('/publication-review')){await route.fulfill({json:{template_id:row.id,expected_updated_at:row.updated_at,review_hash:'a'.repeat(64),source_revision:null,published_revision:row.published_revision,future_requests_only:true,execution_allowed:false,active_policies:[{id:'p1',name:'Synthetic policy',version:1}],events:[],comparison:{event:'requested',before:output,after:output,changed_events:['requested'],shared_fields:['styles.button_radius']}}});return;}
  if(url.endsWith('/publish')){writes++;expect(route.request().postDataJSON()).toMatchObject({review_hash:'a'.repeat(64),expected_updated_at:1,reason:'Reviewed synthetic change'});row={...row,updated_at:2,published_revision:2};await route.fulfill({json:row});return;}
  if(url.endsWith('/notification-template-sets')){await route.fulfill({json:[row]});return;}
  await route.abort();
 });
 await page.goto('/tests/canvas/publication.html');
 await page.getByRole('button',{name:'Review & publish',exact:true}).click();
 await expect(page.getByRole('region',{name:'Review publication changes'})).toBeVisible();
 expect(writes).toBe(0);
 await expect(page.getByRole('button',{name:'Confirm publication'})).toBeDisabled();
 await page.getByLabel('Current preview').uncheck();
 await expect(page.getByRole('region',{name:'Review publication changes'})).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Review & publish',exact:true})).toBeDisabled();
 await page.getByLabel('Current preview').check();
 await page.getByRole('button',{name:'Review & publish',exact:true}).click();
 await page.getByLabel('Publication reason').fill('Reviewed synthetic change');
 await page.getByRole('button',{name:'Confirm publication'}).click();
 await expect(page.getByLabel('Observed publication revision')).toHaveText('2');
 expect(writes).toBe(1);
});
