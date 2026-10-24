import {test,expect,type Page} from '@playwright/test';
const route='/tests/canvas/group-navigation.html';
const saved=[{id:'saved-group',name:'Saved approver group',
 member_ids:['reviewer-1','reviewer-2'],enabled:true,updated_at:1792551000}];
const accounts=[
 {id:'reviewer-1',displayName:'Reviewer One',detail:'one@example.invalid',role:'member',status:'enabled'},
 {id:'reviewer-2',displayName:'Reviewer Two',detail:'two@example.invalid',role:'member',status:'enabled'},
];
async function setup(page:Page){
 const state={reads:[] as string[],writes:[] as string[],errors:[] as string[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/api/v1/**',r=>{
  const req=r.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){state.writes.push(req.method()+' '+path);return r.abort();}
  state.reads.push(path);
  if(path==='/api/v1/approver-groups')return r.fulfill({json:saved});
  if(path==='/api/v1/admin/users')return r.fulfill({json:accounts});
  state.writes.push('UNEXPECTED_READ '+path);return r.abort();
 });
 await page.goto(route);
 await expect(page.getByRole('button',{name:'Create approver group',exact:true})).toBeEnabled();
 return state;
}
function nav(page:Page){return page.getByRole('navigation',{name:'Synthetic Grant admin shell'});}
function dialog(page:Page){return page.getByRole('alertdialog',{name:'Discard unsaved approver group changes?'});}
function unchanged(state:{writes:string[];errors:string[]}){expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);}
test('new unsaved group shell Home asks before discard and Keep preserves the exact name',async({page})=>{
 const state=await setup(page);
 await page.getByRole('button',{name:'Create approver group',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Group name',exact:true});
 await name.fill('Group draft only');
 await nav(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(name).toHaveValue('Group draft only');
 await nav(page).getByRole('button',{name:'Home destination'}).click();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 unchanged(state);
});
test('existing approver-group name and ordered membership edits require review on global navigation',async({page})=>{
 const state=await setup(page);
 await page.getByRole('row').filter({hasText:'Saved approver group'})
  .getByRole('button',{name:'Review group'}).click();
 const name=page.getByRole('textbox',{name:'Group name',exact:true});
 await name.fill('Existing name changed locally');
 await page.getByRole('button',{name:'Move earlier'}).last().click();
 await nav(page).getByRole('button',{name:'Home destination'}).click();
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(name).toHaveValue('Existing name changed locally');
 await expect(page.locator('ol li').first()).toContainText('Reviewer Two');
 await nav(page).getByRole('button',{name:'Home destination'}).click();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 unchanged(state);
});
test('browser Back protects dirty group editor and only leaves on explicit discard',async({page})=>{
 const state=await setup(page);
 await nav(page).getByRole('button',{name:'Home destination'}).click();
 await nav(page).getByRole('button',{name:'Approver groups destination'}).click();
 await page.getByRole('button',{name:'Create approver group',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Group name',exact:true});
 await name.fill('Never silently lose me on browser Back');
 await page.evaluate(()=>history.back());
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(name).toHaveValue('Never silently lose me on browser Back');
 await page.evaluate(()=>history.back());
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('heading',{name:'Other page'})).toBeVisible();
 unchanged(state);
});
test('in-page Back or Cancel never drops dirty group; untouched editor exits directly',async({page})=>{
 const state=await setup(page);
 await page.getByRole('button',{name:'Create approver group',exact:true}).click();
 await page.getByRole('button',{name:'← Back to approver groups'}).click();
 await expect(dialog(page)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create approver group',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create approver group',exact:true}).click();
 await page.getByRole('textbox',{name:'Group name',exact:true}).fill('Unsaved in-page');
 await page.getByRole('button',{name:'← Back to approver groups'}).click();
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole('button',{name:'Keep editing'}).click();
 await expect(page.getByRole('textbox',{name:'Group name',exact:true})).toHaveValue('Unsaved in-page');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByRole('button',{name:'Discard and leave'}).click();
 await expect(page.getByRole('button',{name:'Create approver group',exact:true})).toBeVisible();
 unchanged(state);
});
test('Escape restores focus and changed group draft cancels stale leave intent',async({page})=>{
 const state=await setup(page);
 await page.getByRole('button',{name:'Create approver group',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Group name',exact:true});
 const go=nav(page).getByRole('button',{name:'Home destination'});
 await name.fill('Version one');
 await go.click();
 await expect(dialog(page).getByRole('button',{name:'Keep editing'})).toBeFocused();
 await dialog(page).press('Escape');
 await expect(dialog(page)).toHaveCount(0);
 await expect(go).toBeFocused();
 await go.click();
 await expect(dialog(page)).toBeVisible();
 await name.fill('Version two');
 await expect(dialog(page)).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
 await expect(name).toHaveValue('Version two');
 unchanged(state);
});
