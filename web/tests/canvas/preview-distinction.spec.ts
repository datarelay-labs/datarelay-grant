import {test,expect} from '@playwright/test';
import {notificationsFixture,openSyntheticEditor} from './notification-fixture';

test('U4.08 live unsaved preview and saved revision preview stay explicitly separate',async({page})=>{
 const state=await notificationsFixture(page);await openSyntheticEditor(page);
 const live=page.getByRole('region',{name:'Live unsaved email preview'});
 await expect(live).toBeVisible();await expect(live).toContainText('collector-01');
 const savedSummary=page.getByText('Saved revision preview and test email',{exact:true});const savedArea=savedSummary.locator('..');
 await expect(savedArea).not.toHaveAttribute('open','');await savedSummary.click();
 const savedPreview=page.getByRole('button',{name:'Preview rendered message',exact:true});await expect(savedPreview).toBeEnabled();await savedPreview.click();
 await expect(page.getByText('Request Sample approval request',{exact:true})).toBeVisible();
 await page.getByLabel('Event body').fill('Unsaved central draft only.');
 await expect(live).toContainText('Unsaved central draft only.');
 await expect(page.getByText('Unsaved changes. Save this template set before previewing or sending a test, so the result matches the saved version used for delivery.')).toBeVisible();
 await expect(savedPreview).toBeDisabled();await expect(page.getByRole('button',{name:'Review: Send test to me',exact:true})).toBeDisabled();
 await expect(page.getByText('Request Sample approval request',{exact:true})).toHaveCount(0);
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
