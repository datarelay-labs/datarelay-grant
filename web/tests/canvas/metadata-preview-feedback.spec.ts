import {test,expect} from '@playwright/test';

test('v1 safe metadata import preview shows local critical error and clears on every input revision',async({page})=>{
 const errors:string[]=[],writes:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{
   writes.push(route.request().method()+' '+new URL(route.request().url()).pathname);
   return route.abort();
 });
 await page.goto('/tests/canvas/metadata-preview-feedback.html');
 const input=page.getByLabel('Safe metadata manifest (optional JSON)',{exact:true});
 const button=page.getByRole('button',{name:'Preview import conflicts',exact:true});
 const invalid=page.getByRole('alert').filter({hasText:'Invalid metadata manifest'});
 await expect(input).toBeVisible();
 await button.click();
 await expect(invalid).toContainText('Provide a bounded G8 metadata manifest before previewing conflicts.');
 await input.fill('{"bad":');
 await expect(invalid).toHaveCount(0);
 await button.click();
 await expect(invalid).toContainText('Manifest must be valid JSON metadata; no credentials or secrets.');
 await input.fill('{"schema_version":1}');
 await expect(invalid).toHaveCount(0);
 await input.fill('');
 await expect(invalid).toHaveCount(0);
 await button.click();
 await expect(invalid).toContainText('Provide a bounded G8 metadata manifest before previewing conflicts.');
 await input.fill('  ');
 await expect(invalid).toHaveCount(0);
 expect(errors).toEqual([]);expect(writes).toEqual([]);
 console.log('V1_LOCAL_VALIDATION_COMPONENT',JSON.stringify({pageErrors:errors.length,requests:writes.length,redToGreen:5}));
});