import {test,expect} from '@playwright/test';

test('a new safe export GET invalidates previously downloadable metadata before pending/failure',async({page})=>{
 const errors:string[]=[],writes:string[]=[];let fail=false,hold=false,arrived!:()=>void,release!:()=>void;
 const captured=new Promise<void>(r=>arrived=r);
 page.on('pageerror',e=>errors.push(e.message));
 const bundle=(warning:string)=>({schema_version:1,secret_free:true,import_supported:false,executable_restore_bundle:false,
   integrations:[],policies:[],templates:[],warning});
 await page.route('**/api/v1/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname;
   if(req.method()!=='GET'){writes.push(req.method()+' '+p);return route.abort();}
   if(p!=='/api/v1/integrations/configuration-export')throw Error('Unexpected API GET '+p);
   if(hold){hold=false;arrived();await new Promise<void>(r=>release=r);}
   if(fail)return route.abort('failed');
   return route.fulfill({json:bundle('Current safe metadata manifest')});
 });
 await page.goto('/tests/canvas/metadata-preview-feedback.html');
 const refresh=page.getByRole('button',{name:'Preview safe export',exact:true});
 const save=page.getByRole('button',{name:'Save JSON manifest',exact:true});
 await refresh.click();
 await expect(save).toBeVisible();
 await expect(page.getByText('Current safe metadata manifest',{exact:true})).toBeVisible();
 fail=true;hold=true;
 await refresh.click();await captured;
 expect.soft(await save.count(),'pending GET must hide prior export').toBe(0);
 release();
 await expect(page.getByText('Unable to complete',{exact:true})).toBeVisible();
 expect.soft(await save.count(),'failed GET must not leave stale save action').toBe(0);
 expect.soft(await page.getByText('Current safe metadata manifest',{exact:true}).count(),'failed GET must not display old manifest').toBe(0);
 fail=false;
 await refresh.click();
 await expect(save).toBeVisible();
 await expect(page.getByText('Unable to complete',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Current safe metadata manifest',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);expect(writes).toEqual([]);
 console.log('V1_EXPORT_READ_FRESHNESS',JSON.stringify({checks:4,jsErrors:errors.length,mutations:writes.length}));
});
