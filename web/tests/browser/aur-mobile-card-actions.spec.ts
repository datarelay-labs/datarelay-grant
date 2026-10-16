import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const fixture=()=>JSON.parse(fs.readFileSync(process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'),'utf8'));

async function login(page:Page){
  await page.goto('/home');
  await page.getByLabel('Username',{exact:true}).fill('admin');
  await page.getByLabel('Password',{exact:true}).fill(fixture().password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
}

test('AUR owner visual mobile configuration card actions stack below readable headings',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await login(page);
    for(const item of [
      {path:'/approvers',title:'Approver groups',action:'Create approver group'},
      {path:'/integrations',title:'Registered connections',action:'Add connection'},
      {path:'/notifications',title:'Email Templates',action:'Create email template'},
    ]){
      await page.goto(item.path);
      const card=page.locator('.dr-card').filter({
        has:page.locator('.dr-card__title',{hasText:item.title}),
      }).first();
      await expect(card).toBeVisible();
      const header=card.locator('.dr-card__header');
      const heading=card.locator('.dr-card__heading');
      const actions=card.locator('.dr-card__actions');
      const button=actions.getByRole('button',{name:item.action,exact:true});
      await expect(button).toBeVisible();
      const [headingBox,actionsBox,buttonBox,layout]=await Promise.all([
        heading.boundingBox(),actions.boundingBox(),button.boundingBox(),
        header.evaluate((node)=>{
          const style=getComputedStyle(node);
          return {flexDirection:style.flexDirection,alignItems:style.alignItems};
        }),
      ]);
      expect(layout.flexDirection).toBe('column');
      expect(layout.alignItems).toBe('stretch');
      expect(headingBox).not.toBeNull();
      expect(actionsBox).not.toBeNull();
      expect(buttonBox).not.toBeNull();
      expect(actionsBox!.y).toBeGreaterThanOrEqual(headingBox!.y+headingBox!.height-1);
      expect(actionsBox!.width).toBeGreaterThanOrEqual(headingBox!.width-1);
      expect(buttonBox!.width).toBeGreaterThanOrEqual(actionsBox!.width-1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    }
  }finally{
    await context.close();
  }
});
