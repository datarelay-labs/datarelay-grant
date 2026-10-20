import {test,expect} from '@playwright/test';

test('Audit evidence cancellation clears loading, discards late result, and new selection remains usable',async({page})=>{
  const denied:string[]=[],errors:string[]=[],checks:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  let arm=false,release!:()=>void,arrived!:()=>void,delivered!:()=>void;
  let started=Promise.resolve(),finished=Promise.resolve();
  const item=(i:number)=>({id:'audit-'+String(i),at:1792500000-i,action:i%2?'request.created':'request.decision_recorded',actor:'synthetic-admin',request_id:i%2?'request-A':'request-B',details:{}});
  const chain=(id:string)=>({request:{id,profile_id:'policy',profile_version_id:null,action_hash:'hash',state:'APPROVED',decision:'APPROVED',execution_state:'NOT_STARTED',execution_id:null},total_events:1,events_truncated:false,events:[item(1)],decisions:[],comments:[],comments_total:0,comments_truncated:false,deliveries:[],current_is_execution_verified:false});
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),u=new URL(req.url()),p=u.pathname;
    if(req.method()!=='GET'){denied.push(req.method()+' '+p);return route.abort();}
    if(p==='/api/v1/admin/audit/search'){
      const offset=Number(u.searchParams.get('offset')||0),count=101;
      return route.fulfill({json:{total:count,limit:50,offset,has_more:offset+Math.min(50,count-offset)<count,
        items:Array.from({length:Math.min(50,count-offset)},(_,j)=>item(offset+j))}});
    }
    if(p.startsWith('/api/v1/admin/audit/chain/')){
      const id=decodeURIComponent(p.split('/').at(-1)!);
      if(arm){
        arm=false;
        const response=chain(id);
        arrived();await new Promise<void>(r=>release=r);
        await route.fulfill({json:response});delivered();
        return;
      }
      return route.fulfill({json:chain(id)});
    }
    throw Error('Unexpected read '+p);
  });
  const spinner=page.getByText('Loading the exact selected request evidence…',{exact:true});
  for(const change of ['search','clear','page']){
    await page.goto('/tests/canvas/audit-selection.html');
    const inspect=page.locator('.grant-audit-desktop-list').getByRole('button',{name:'Inspect request evidence',exact:true}).first();
    await expect(inspect).toBeEnabled();
    arm=true;started=new Promise<void>(r=>arrived=r);finished=new Promise<void>(r=>delivered=r);
    await inspect.click();await started;
    await expect(spinner).toBeVisible();
    if(change==='search'){
      await page.getByLabel('Event action',{exact:true}).fill('request.created');
      await page.getByRole('button',{name:'Search evidence',exact:true}).click();
    }else if(change==='clear')await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    else await page.getByRole('button',{name:'Next page',exact:true}).click();
    await expect(page.getByRole('button',{name:'Export JSON',exact:true})).toBeEnabled();
    expect.soft(await spinner.count(),change+' must cancel pending chain immediately').toBe(0);
    release();await finished;await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
    expect.soft(await spinner.count(),change+' stale response must not revive spinner').toBe(0);
    await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toHaveCount(0);
    checks.push(change);
  }
  // A fresh, explicitly selected request must still render its own valid chain.
  await page.goto('/tests/canvas/audit-selection.html');
  const fresh=page.locator('.grant-audit-desktop-list').getByRole('button',{name:'Inspect request evidence',exact:true}).first();
  await fresh.click();
  await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close selected request evidence',exact:true}).click();
  await expect(spinner).toHaveCount(0);
  await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toHaveCount(0);
  checks.push('fresh selected chain and close');
  expect(errors).toEqual([]);expect(denied).toEqual([]);
  console.log('AUDIT_COMPONENT_RECONCILIATION',JSON.stringify({checks,pageErrors:errors.length,writes:denied.length}));
});


test('a late older chain cannot clear a newer explicit evidence selection spinner',async({page})=>{
  const errors:string[]=[],writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  let oldArrived!:()=>void,newArrived!:()=>void,releaseOld!:()=>void,releaseNew!:()=>void;
  const oldSeen=new Promise<void>(r=>oldArrived=r),newSeen=new Promise<void>(r=>newArrived=r);
  const item=(id:string,i:number)=>({id:'audit-'+id,at:1792500000-i,action:'request.created',actor:'admin',request_id:id,details:{}});
  const response=(id:string)=>({request:{id,profile_id:'policy',profile_version_id:null,action_hash:'hash',state:'HELD',decision:null,execution_state:'NOT_STARTED',execution_id:null},total_events:1,events_truncated:false,events:[item(id,1)],decisions:[],comments:[],comments_total:0,comments_truncated:false,deliveries:[],current_is_execution_verified:false});
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    if(request.method()!=='GET'){writes.push(request.method()+' '+pathname);return route.abort();}
    if(pathname==='/api/v1/admin/audit/search')return route.fulfill({json:{
      total:2,limit:50,offset:0,has_more:false,items:[item('request-A',0),item('request-B',1)],
    }});
    if(pathname.startsWith('/api/v1/admin/audit/chain/')){
      const id=decodeURIComponent(pathname.split('/').at(-1)!);
      if(id==='request-A'){oldArrived();await new Promise<void>(r=>releaseOld=r);}
      else if(id==='request-B'){newArrived();await new Promise<void>(r=>releaseNew=r);}
      else throw Error('Unexpected chain '+id);
      return route.fulfill({json:response(id)});
    }
    throw Error('Unexpected GET '+pathname);
  });
  await page.goto('/tests/canvas/audit-selection.html');
  const buttons=page.locator('.grant-audit-desktop-list').getByRole('button',{name:'Inspect request evidence',exact:true});
  await expect(buttons).toHaveCount(2);
  await buttons.nth(0).click();await oldSeen;
  const spinner=page.getByText('Loading the exact selected request evidence…',{exact:true});
  await expect(spinner).toBeVisible();
  await buttons.nth(1).click();await newSeen;
  releaseOld();
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  await expect(spinner).toBeVisible();
  await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toHaveCount(0);
  releaseNew();
  await expect(page.getByText('Request-to-result evidence chain',{exact:true})).toBeVisible();
  await expect(page.locator('.grant-facts').getByText('request-B',{exact:true})).toBeVisible();
  await expect(spinner).toHaveCount(0);
  expect(errors).toEqual([]);expect(writes).toEqual([]);
  console.log('AUDIT_NEWER_EVIDENCE_WINS',JSON.stringify({newId:'request-B',errors:errors.length,writes:writes.length}));
});
