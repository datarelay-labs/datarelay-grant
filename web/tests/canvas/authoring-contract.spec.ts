/** Missing U2 interaction coverage against the real Notifications composition.
 * Route transport is synthetic; the original Python renderer/defaults are real.
 */
import {test,expect,type Page} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor,saveSyntheticDraft} from './notification-fixture';
const eventIds=['requested','reminder','approved','denied','expired','cancelled','execution_succeeded','execution_failed','execution_unknown'] as const;
const selectBlock=async(page:Page,name:string)=>{await page.getByRole('navigation',{name:'Email blocks'}).getByRole('button',{name:new RegExp('^'+name+'(?:\\s*Protected)?$')}).click();};
const properties=(page:Page)=>page.getByRole('region',{name:'Selected block properties'});

function draftObserver(page:Page){
 const drafts:any[]=[];
 page.on('request',request=>{if(request.url().endsWith('/notification-template-drafts/preview')&&request.method()==='POST'){const draft=request.postDataJSON().template;if(draft.name!=='Style example')drafts.push(draft);}});
 return ()=>drafts.at(-1);
}

test('U2.02 and U2.06 presets and scoped appearance reset preserve every edited content field',async({page})=>{
 test.setTimeout(90000);const current=draftObserver(page),state=await notificationsFixture(page);await openSyntheticEditor(page);
 await page.getByLabel('Event body').fill('Preserved 한국어 **explanation**.');
 await selectBlock(page,'Subject');await page.getByLabel('Event subject').fill('Preserved subject');
 await selectBlock(page,'Heading');await page.getByLabel('Event heading').fill('Preserved heading');
 await selectBlock(page,'Footer');await page.getByLabel('Additional footer wording').fill('Preserved footer');
 await page.getByLabel('Language',{exact:true}).selectOption('ko');
 await selectBlock(page,'Approval buttons');await page.getByText('Button descriptions',{exact:true}).click();await page.getByLabel('Approve description').fill('Scheduled change');
 await expect.poll(()=>current()?.design.button_suffixes.approve).toBe('Scheduled change');const before=structuredClone(current());
 for(const [label,preset,size] of [['Standard','standard','M'],['Compact','compact','S'],['High visibility','high_visibility','L']]){
  const summary=page.locator('summary').filter({hasText:'Style presets'});await summary.click();
  await page.getByRole('button',{name:'Use '+label+' preset',exact:true}).click();
  await expect.poll(()=>current()?.design.preset).toBe(preset);
  const after=current();expect(after.design.button_size).toBe(size);expect(after.templates).toEqual(before.templates);
  for(const key of ['event_headings','heading','footer','locale','button_suffixes','blocks'])expect(after.design[key]).toEqual(before.design[key]);
  const thumbnail=page.locator('iframe[title="'+label+' sample thumbnail"]');await expect(thumbnail).toBeAttached();
  expect(await thumbnail.getAttribute('srcdoc')).toContain('grant-mail-block-actions');
  // The disclosure remains open after selection; close it for the next iteration.
  await summary.click();
 }
 await page.getByRole('button',{name:'Reset button appearance',exact:true}).click();
 await expect.poll(()=>current()?.design.button_size).toBe('M');expect(current().templates).toEqual(before.templates);expect(current().design.locale).toBe('ko');
 expect(current().design.footer).toBe('Preserved footer');expect(current().design.button_suffixes.approve).toBe('Scheduled change');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);expect(state.rows[0].published_revision).toBe(1);expect(state.rows[0].templates).toEqual(before.templates);expect(state.writes).toEqual(['PUT']);
});

test('U2.03 U2.04 U2.08 all nine event subject/body/headings survive save/reopen and locale never translates custom wording',async({page})=>{
 test.setTimeout(90000);const state=await notificationsFixture(page);await openSyntheticEditor(page);
 for(const event of eventIds){
  await page.getByLabel('Event',{exact:true}).selectOption(event);
  await selectBlock(page,'Subject');await page.getByLabel('Event subject').fill('Subject '+event);
  await selectBlock(page,'Message');await page.getByLabel('Event body').fill('Custom 한국어 '+event);
  await expect(properties(page)).toContainText('This event');
  await selectBlock(page,'Heading');await page.getByLabel('Event heading').fill('Heading '+event);
 }
 await selectBlock(page,'Footer');await page.getByLabel('Additional footer wording').fill('Shared footer');await expect(properties(page)).toContainText('All events in this template set');
 await selectBlock(page,'Verification');await expect(properties(page)).toContainText('Controlled by approval policy');await expect(properties(page).locator('input,textarea,select')).toHaveCount(0);
 await page.getByLabel('Language',{exact:true}).selectOption('ko');await page.getByLabel('Language',{exact:true}).selectOption('en');
 await saveSyntheticDraft(page);await expect.poll(()=>state.rows[0].draft_revision).toBe(2);
 for(const event of eventIds){expect(state.rows[0].templates[event]).toEqual({subject:'Subject '+event,body:'Custom 한국어 '+event});expect(state.rows[0].design!.event_headings![event]).toBe('Heading '+event);}
 expect(state.rows[0].design!.locale).toBe('en');expect(state.rows[0].design!.footer).toBe('Shared footer');
 await page.getByRole('button',{name:'Refresh saved template set'}).click();await page.getByRole('button',{name:'Back to email templates'}).click();await openSyntheticEditor(page);
 for(const event of eventIds){await page.getByLabel('Event',{exact:true}).selectOption(event);await expect(page.getByLabel('Event body')).toHaveValue('Custom 한국어 '+event);}
 expect(state.writes).toEqual(['PUT']);expect(state.errors).toEqual([]);
});

test('U2.05 searches human variables and inserts at a heading selection; maximum-length refusal retains the subject',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);await selectBlock(page,'Heading');
 const heading=page.getByLabel('Event heading');await heading.fill('Change this target');await heading.evaluate((element:HTMLInputElement)=>element.setSelectionRange(7,11));
 await page.getByText('Insert variable',{exact:true}).click();await page.getByLabel('Find a variable').fill('Target');
 const choice=properties(page).getByRole('button').filter({hasText:'The affected resource.'});await expect(choice).toContainText('Example: collector-01');await choice.click();await expect(heading).toHaveValue('Change {{target}} target');
 expect(await heading.evaluate((element:HTMLInputElement)=>element.selectionStart)).toBe(17);
 await selectBlock(page,'Subject');const subject=page.getByLabel('Event subject');await subject.fill('X'.repeat(249));
 const disclosure=properties(page).locator('details').filter({hasText:'Insert variable'});if(await disclosure.getAttribute('open')===null)await disclosure.locator('summary').click();
 await page.getByLabel('Find a variable').fill('Request title');await properties(page).getByRole('button').filter({hasText:'The title of the requested change.'}).click();
 await expect(properties(page)).toContainText('This field is too long for the selected variable.');await expect(subject).toHaveValue('X'.repeat(249));expect(state.writes).toEqual([]);
});

test('U2.06 restore wording shows language and event; cancel is inert and confirm changes only that event',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);await page.getByLabel('Event body').fill('Keep requested copy');
 await page.getByLabel('Event',{exact:true}).selectOption('reminder');await page.getByLabel('Event body').fill('Keep reminder until confirmed');
 await page.getByLabel('Language',{exact:true}).selectOption('ko');await page.getByRole('button',{name:'Restore default wording',exact:true}).click();
 await expect(properties(page)).toContainText('reminder');await expect(properties(page)).toContainText('Korean');
 await page.getByRole('button',{name:'Keep wording',exact:true}).click();await expect(page.getByLabel('Event body')).toHaveValue('Keep reminder until confirmed');
 await page.getByRole('button',{name:'Restore default wording',exact:true}).click();await page.getByRole('button',{name:'Replace event wording',exact:true}).click();
 await expect(page.getByLabel('Event body')).not.toHaveValue('Keep reminder until confirmed');await expect(page.getByLabel('Event body')).not.toBeEmpty();
 await page.getByLabel('Event',{exact:true}).selectOption('requested');await expect(page.getByLabel('Event body')).toHaveValue('Keep requested copy');expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('U2.07 undo restores complete copy/style snapshots, branches discard redo and another template starts clean',async({page})=>{
 const current=draftObserver(page),state=await notificationsFixture(page);state.rows.push({...structuredClone(state.rows[0]),id:'second-template',name:'Second approval'});
 await page.reload();await openSyntheticEditor(page);await expect.poll(()=>current()?.name).toBe('Synthetic approval');const initial=structuredClone(current());
 await page.getByLabel('Event body').fill('Step one');await expect.poll(()=>current()?.templates.requested.body).toBe('Step one');const first=structuredClone(current());
 await selectBlock(page,'Approval buttons');await page.getByRole('group',{name:'Button size',exact:true}).getByRole('button').filter({hasText:'L'}).click();await expect.poll(()=>current()?.design.button_size).toBe('L');const second=structuredClone(current());
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>current()).toEqual(first);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>current()).toEqual(initial);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(()=>current()).toEqual(first);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(()=>current()).toEqual(second);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await selectBlock(page,'Message');await page.getByLabel('Event body').fill('New branch');await expect(page.getByRole('button',{name:'Redo',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Back to email templates'}).click();await page.getByRole('button',{name:'Discard unsaved changes',exact:true}).click();
 const secondTile=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:'Second approval',exact:true})});await secondTile.getByRole('button',{name:'Edit draft',exact:true}).click();
 await expect(page.getByLabel('Event body')).toHaveValue('Please review {{target}}.');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
