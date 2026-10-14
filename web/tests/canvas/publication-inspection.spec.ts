import {syntheticEmailSample} from '../../src/email_preview_model';
import {test,expect,type Page} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,renderSyntheticEmail,saveSyntheticDraft} from './notification-fixture';

async function publicationFixture(page:Page,publishedRevision=1){
 const state=await notificationsFixture(page);state.rows[0].published_revision=publishedRevision;
 const publication={posts:[] as any[],reviews:0,conflictNext:false,proof:'a'.repeat(64),commits:0};
 const history=Array.from({length:publishedRevision},(_,index)=>({revision:index+1,created_by:'synthetic-author-id',created_at:index+1,reason:index===0?'Initial synthetic design':'Second synthetic design',snapshot_hash:String(index+1).repeat(64)}));
 await page.route('**/api/v1/notification-template-sets/synthetic-template/**',async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method(),row=state.rows[0];
  const render=async(body:string)=>{const draft={...row,templates:structuredClone(row.templates)};draft.templates.requested.body=body;return (await renderSyntheticEmail({template:draft,event:'requested',verification_mode:'EMAIL_PIN',sample:{...syntheticEmailSample('normal','requested'),request_title:'Sample history',target:'sample-target'}})).rendered;};
  if(path.endsWith('/versions')&&method==='GET'){await route.fulfill({json:history});return;}
  if(path.endsWith('/versions/1/preview')&&method==='GET'){
   await route.fulfill({json:{template_id:row.id,...history[0],event:'requested',read_only:true,execution_allowed:false,rendered:await render('Original historical wording')}});return;
  }
  if(path.endsWith('/publication-review')&&method==='POST'){
   publication.reviews++;await route.fulfill({json:{template_id:row.id,expected_updated_at:row.updated_at,review_hash:publication.proof,source_revision:route.request().postDataJSON()?.source_revision??null,published_revision:row.published_revision,future_requests_only:true,execution_allowed:false,
    active_policies:[{id:'policy-version-1',profile_id:'policy-1',name:'Production changes',version:3}],
    events:Object.keys(row.templates).map(event=>({event,subject:row.templates[event as keyof typeof row.templates].subject,html_bytes:1000})),
    comparison:{event:'requested',before:await render('Original historical wording'),after:await render('Current candidate wording'),changed_events:['reminder'],event_changes:{reminder:['preheader']},shared_fields:['palette.page_background']}}});return;
  }
  if(path.endsWith('/publish')&&method==='POST'){
   const payload=route.request().postDataJSON();expect(payload.expected_updated_at).toBe(row.updated_at);expect(payload.review_hash).toBe(publication.proof);publication.posts.push(payload);
   if(publication.conflictNext){publication.conflictNext=false;publication.proof='b'.repeat(64);await route.fulfill({status:409,json:{error:{code:'PUBLICATION_CHANGED_REVIEW_REQUIRED'}}});return;}
   publication.commits++;
   state.rows[0]={...row,published_revision:(row.published_revision??0)+1,updated_at:row.updated_at+1};await route.fulfill({json:state.rows[0]});return;
  }
  await route.fallback();
 });
 if(publishedRevision!==1){await page.reload();await expect(page.getByLabel('Email template inventory')).toContainText('Synthetic approval');}
 await openSyntheticEditor(page);return {state,publication};
}


test('U5.01 save keeps publication pointer unchanged and reopens the acknowledged draft revision',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const status=page.getByLabel('Email draft publication status');
 await expect(status).toContainText('Published v1');await expect(status).toContainText('Draft v1');
 await page.getByLabel('Event body').fill('Saved draft only — never published.');await expect(status).toContainText('Unsaved changes');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].published_revision).toBe(1);await expect(status).toContainText('Published v1');await expect(status).toContainText('Draft v2');
 await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await expect(page.getByLabel('Event body')).toHaveValue('Saved draft only — never published.');await expect(status).toContainText('Published v1');await expect(status).toContainText('Draft v2');
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});


test('U5.01 saving an edited draft advances only draft revision and survives reopen without publication',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 await expect(page.getByLabel('Email draft publication status')).toContainText('Published v1');
 await expect(page.getByLabel('Email draft publication status')).toContainText('Draft v1');
 await page.getByLabel('Event body').fill('Saved draft only — publication pointer must stay v1.');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 expect(state.rows[0].published_revision).toBe(1);await expect(page.getByLabel('Email draft publication status')).toContainText('Published v1');
 await page.getByRole('button',{name:'Refresh saved template set',exact:true}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 await expect(page.getByLabel('Event body')).toHaveValue('Saved draft only — publication pointer must stay v1.');
 await expect(page.getByLabel('Email draft publication status')).toContainText('Published v1');await expect(page.getByLabel('Email draft publication status')).toContainText('Draft v2');
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});

test('U5.02 U5.03 review displays exact field/event/policy identities before one explicit synthetic publication',async({page})=>{
 const {state,publication}=await publicationFixture(page);
 const reviewButton=page.getByRole('button',{name:'Review & publish',exact:true});await expect(reviewButton).toBeEnabled();await reviewButton.click();
 const review=page.getByRole('region',{name:'Review publication changes'});
 await expect(review).toContainText('reminder: preheader');await expect(review).toContainText('palette.page_background');
 await review.locator('summary').filter({hasText:'Active policies using this template'}).click();
 await expect(review).toContainText('policy-version-1');await expect(review).toContainText('policy-1');
 await expect(review).toContainText('future requests');expect(publication.posts).toEqual([]);
 await expect(page.getByRole('button',{name:'Confirm publication',exact:true})).toBeDisabled();
 await page.getByLabel('Publication reason').fill('Synthetic review only');await page.getByRole('button',{name:'Confirm publication',exact:true}).click();
 await expect.poll(()=>publication.posts.length).toBe(1);await expect(page.getByLabel('Email draft publication status')).toContainText('Published v2');
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U5.06 historical preview is separate readonly output with true actor/time and no publication',async({page})=>{
 const {state,publication}=await publicationFixture(page);
 await page.getByRole('button',{name:'Version history',exact:true}).click();
 const history=page.getByRole('region',{name:'Published version history'});await expect(history).toContainText('synthetic-author-id');
 await history.getByRole('button',{name:'Preview published v1',exact:true}).click();
 const preview=page.getByRole('region',{name:'Historical email preview'});await expect(preview).toContainText('Read-only');await expect(preview).toContainText('synthetic-author-id');
 await preview.getByRole('button',{name:'Plain text',exact:true}).click();await expect(preview).toContainText('Original historical wording');
 await expect(page.getByLabel('Event body')).toHaveValue('Please review {{target}}.');expect(publication.posts).toEqual([]);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});


test('U5.04 definite server conflict preserves the draft and requires a fresh review instead of replay or indefinite latch',async({page})=>{
 const {state,publication}=await publicationFixture(page);publication.conflictNext=true;
 const reviewButton=page.getByRole('button',{name:'Review & publish',exact:true});await expect(reviewButton).toBeEnabled();await reviewButton.click();
 await page.getByLabel('Publication reason').fill('First rejected proof');await page.getByRole('button',{name:'Confirm publication',exact:true}).click();
 await expect(page.getByRole('region',{name:'Email publication and history'})).toContainText('This publication was rejected.');
 expect(publication.commits).toBe(0);expect(publication.posts).toHaveLength(1);await expect(page.getByLabel('Event body')).toHaveValue('Please review {{target}}.');
 await expect(reviewButton).toBeEnabled();await reviewButton.click();await page.getByLabel('Publication reason').fill('Fresh explicit review');await page.getByRole('button',{name:'Confirm publication',exact:true}).click();
 await expect.poll(()=>publication.commits).toBe(1);expect(publication.posts).toHaveLength(2);expect(publication.posts[0].review_hash).not.toBe(publication.posts[1].review_hash);
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});


test('U5.07 rollback reviews an older immutable version then publishes a new monotonic revision',async({page})=>{
 const {state,publication}=await publicationFixture(page,2);
 await expect(page.getByRole('button',{name:'Review & publish',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Version history',exact:true}).click();
 const history=page.getByRole('region',{name:'Published version history'});
 await expect(history).toContainText('v1');await expect(history).toContainText('v2');
 const rollback=history.getByRole('button',{name:'Review rollback from v1',exact:true});await expect(rollback).toBeEnabled();await rollback.click();
 const review=page.getByRole('region',{name:'Review publication changes'});await expect(review).toContainText('Review rollback as a new revision');
 expect(publication.posts).toEqual([]);await page.getByLabel('Publication reason').fill('Restore known good v1 as a new revision');
 await page.getByRole('button',{name:'Confirm publication',exact:true}).click();
 await expect.poll(()=>publication.posts.length).toBe(1);expect(publication.posts[0].source_revision).toBe(1);
 await expect(page.getByLabel('Email draft publication status')).toContainText('Published v3');
 expect(state.rows[0].published_revision).toBe(3);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
