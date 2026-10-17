import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Supporting isolated-product regression, NOT legitimate owner-persona
 * Full User E2E or independent real-mailbox acceptance.
 * Only the repository's disposable loopback fixture supplies accounts,
 * mail transport and callback target. No production action is invoked.
 */
function fixture(): { password: string; receiver: string } {
  return JSON.parse(fs.readFileSync(
    process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'),
    'utf8',
  )) as { password: string; receiver: string };
}

async function signIn(page: Page, username: string) {
  await page.goto('/home');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(fixture().password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}

test('first-run admin setup publishes a reusable approval request for another account', async ({ browser }) => {
  test.setTimeout(180_000);
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const requesterContext = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const approverContext = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const unrelatedContext = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const admin = await adminContext.newPage();
  const requester = await requesterContext.newPage();
  const approver = await approverContext.newPage();
  const unrelated = await unrelatedContext.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  const groupName = 'First run group ' + suffix;
  const integrationName = 'First run receiver ' + suffix;
  const templateName = 'First run messages ' + suffix;
  const policyName = 'First run request type ' + suffix;
  const requestTitle = 'First run approval ' + suffix;
  try {
    await signIn(admin, 'admin');
    await admin.getByRole('button', { name: /Administrator\? Open workflow setup/ }).click();
    await expect(admin.getByRole('heading', {
      name: 'Configure once, reuse on every request',
    })).toBeVisible();
    await expect(admin.getByText('Saved drafts alone cannot pass policy testing.', { exact: false })).toBeVisible();

    // The first user-management destination must be discoverable, not guessed.
    await admin.getByRole('link', { name: /Open user management/ }).click();
    await expect(admin.getByRole('heading', { name: 'User Management', level: 2 })).toBeVisible();
    await admin.goBack();
    await expect(admin.getByRole('heading', {
      name: 'Configure once, reuse on every request',
    })).toBeVisible();

    // Create one reusable group through the actual review/confirm workflow.
    await admin.getByRole('button', { name: /Manage approver groups/ }).click();
    await admin.getByRole('button', { name: 'Create approver group', exact: true }).click();
    await admin.getByLabel('Group name', { exact: true }).fill(groupName);
    await admin.locator('label.grant-checkbox').filter({ hasText: 'approver' })
      .locator('input[type="checkbox"]').check();
    await admin.getByRole('button', { name: 'Review group creation', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Confirm save group', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Confirm save group', exact: true }).click();
    await expect(admin.getByRole('row').filter({ hasText: groupName })).toBeVisible();

    await admin.goto('/admin/setup');
    await admin.getByRole('button', { name: /Open integrations/ }).click();
    const integrationTasks = admin.getByRole('navigation', { name: 'Integration tasks' });
    await integrationTasks.getByRole('button', { name: 'Add connection', exact: true }).click();
    await admin.getByLabel('Integration name', { exact: true }).fill(integrationName);
    await admin.getByLabel('Decision verification minimum', { exact: true }).selectOption('EMAIL_PIN');
    await admin.getByLabel('Registered callback URL', { exact: true }).fill(fixture().receiver);
    await admin.getByRole('button', { name: 'Review connection registration', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Confirm create connection' })).toBeVisible();
    await admin.getByRole('button', { name: 'Confirm create connection' }).click();
    await expect(admin.getByText('Registration acknowledged by the server.', { exact: false })).toBeVisible();
    await admin.getByRole('button', { name: 'Refresh saved connections', exact: true }).click();

    // Create a saved nine-event template; Review alone must not save.
    await admin.goto('/admin/setup');
    await admin.getByRole('button', { name: /Manage notification templates/ }).click();
    await admin.getByRole('button', { name: 'Create email template', exact: true }).click();
    await admin.getByLabel('Template set name', { exact: true }).fill(templateName);
    await admin.getByRole('navigation', { name: 'Email blocks' })
      .getByRole('button', { name: 'Subject', exact: true }).click();
    await admin.getByLabel('Event subject', { exact: true })
      .fill('[First run] {{request_title}}');
    await admin.getByRole('button', { name: 'Review draft save', exact: true }).click();
    await expect(admin.getByRole('button', {
      name: 'Confirm template set creation', exact: true,
    })).toBeVisible();
    await admin.getByRole('button', { name: 'Confirm template set creation', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Refresh saved template set' })).toBeVisible();
    await admin.getByRole('button', { name: 'Refresh saved template set' }).click();
    const publish = admin.getByRole('button', { name: 'Review & publish', exact: true });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(admin.getByRole('region', { name: 'Review publication changes' })).toBeVisible();
    await admin.getByLabel('Publication reason', { exact: true }).fill('First-run publication for future requests');
    await admin.getByRole('button', { name: 'Confirm publication', exact: true }).click();
    await expect(admin.getByText('Published v1 for future requests only.', { exact: false })).toBeVisible();

    // No Draft is executable; it must be tested then explicitly activated.
    await admin.goto('/admin/setup');
    await admin.getByRole('button', { name: /Open approval policies/ }).click();
    await admin.getByRole('button', { name: 'Create policy', exact: true }).click();
    await admin.getByLabel('Policy name', { exact: true }).fill(policyName);
    await admin.getByLabel('Integration', { exact: true }).selectOption({ label: integrationName });
    await admin.getByLabel('Assigned approver', { exact: true }).selectOption({ label: 'approver' });
    await admin.getByLabel('Allowed action kind', { exact: true }).fill('test.first-run');
    await admin.getByLabel('Notification template set', { exact: true })
      .selectOption({ label: templateName });
    await admin.getByRole('button', { name: 'Create draft', exact: true }).click();
    await expect(admin.getByText('Draft saved. It is not live until it passes Testing and is explicitly activated.')).toBeVisible();
    await admin.getByRole('button', { name: 'Test policy', exact: true }).click();
    await admin.getByRole('button', { name: 'Confirm testing', exact: true }).click();
    await expect(admin.getByText('Policy moved to Testing. Use isolated test before activation.')).toBeVisible();
    await admin.getByRole('button', { name: 'Preview & Test', exact: true }).click();
    await admin.getByRole('button', { name: 'Run isolated test', exact: true }).click();
    await expect(admin.getByText('Isolated test: ' + policyName + ' v1', { exact: false })).toBeVisible();
    await admin.getByRole('button', { name: 'Activate policy', exact: true }).click();
    await expect(admin.getByText('Confirm policy activation', { exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Confirm activation', exact: true }).click();
    await expect(admin.getByText('Policy activated. Existing requests retain their original version snapshot.')).toBeVisible();

    // New, independent member session consumes the published request type.
    await signIn(requester, 'requester');
    await requester.getByRole('button').filter({ hasText: 'Create approval request' }).click();
    const policyChoice = requester.getByLabel('Request type', { exact: true });
    await expect(policyChoice.locator('option').filter({ hasText: policyName })).toHaveCount(1);
    await policyChoice.selectOption({ label: policyName + ' · test.first-run' });
    await requester.getByLabel('Request title', { exact: true }).fill(requestTitle);
    await requester.getByLabel('Target', { exact: true }).fill('non-executing-target-' + suffix);
    await requester.getByLabel('Reason', { exact: true }).fill('Disposable owner workflow integration smoke');
    await requester.getByRole('button', { name: 'Review request', exact: true }).click();
    await expect(requester.getByRole('button', { name: 'Confirm create request', exact: true })).toBeVisible();
    await requester.getByRole('button', { name: 'Confirm create request', exact: true }).click();
    await expect(requester.getByText('Exact action requiring approval', { exact: true })).toBeVisible();
    const detailURL = requester.url();

    await signIn(unrelated, 'stranger');
    await unrelated.goto(detailURL);
    await expect(unrelated.getByText('REQUEST NOT FOUND', { exact: true })).toBeVisible();

    await signIn(approver, 'approver');
    await approver.getByRole('button').filter({ hasText: 'Review assigned work' }).click();
    const assignedWork = approver.getByRole('row').filter({ hasText: requestTitle })
      .getByRole('button', { name: requestTitle, exact: true });
    await expect(assignedWork).toBeVisible();
    await assignedWork.click();
    await expect(approver).toHaveURL(detailURL);
    await expect(approver.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await approver.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(approver.getByRole('button', { name: 'Confirm approved', exact: true })).toBeVisible();
    await approver.getByRole('button', { name: 'Confirm approved', exact: true }).click();
    await expect(approver.getByText('Recorded. Delivery and execution are tracked separately.')).toBeVisible();
    await requester.reload();
    await expect(requester.getByRole('region', { name: 'Current request workflow' })
      .getByText('APPROVED', { exact: true })).toBeVisible();
    const requestId = detailURL.split('/').pop();
    const durableResponse = await requesterContext.request.get('/api/v1/requests/' + requestId);
    expect(durableResponse.status()).toBe(200);
    const durable = await durableResponse.json();
    expect(durable.state).toBe('APPROVED');
    expect(durable.execution_state).toBe('NOT_STARTED');
  } finally {
    await Promise.all([adminContext.close(), requesterContext.close(), approverContext.close(), unrelatedContext.close()]);
  }
});

test('unpublished custom email template gives actionable correction without activating its policy', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  const templateName = 'Saved but unpublished ' + suffix;
  const policyName = 'Unpublished policy ' + suffix;
  try {
    await signIn(page, 'admin');
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Create email template', exact: true }).click();
    await page.getByLabel('Template set name', { exact: true }).fill(templateName);
    await page.getByRole('button', { name: 'Review draft save', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm template set creation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh saved template set' })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh saved template set' }).click();
    await expect(page.getByLabel('Email draft publication status')).toContainText('Not published');

    await page.goto('/profiles');
    await page.getByRole('button', { name: 'Create policy', exact: true }).click();
    await page.getByLabel('Policy name', { exact: true }).fill(policyName);
    await page.getByLabel('Integration', { exact: true })
      .selectOption({ label: 'Isolated DataRelay fixture' });
    await page.getByLabel('Assigned approver', { exact: true })
      .selectOption({ label: 'approver' });
    await page.getByLabel('Allowed action kind', { exact: true }).fill('test.unpublished');
    await page.getByLabel('Notification template set', { exact: true })
      .selectOption({ label: templateName });
    await expect(page.getByText('saving a draft is not publication.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Create draft', exact: true }).click();
    await page.getByRole('button', { name: 'Test policy', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm testing', exact: true }).click();
    await page.getByRole('button', { name: 'Preview & Test', exact: true }).click();
    await page.getByRole('button', { name: 'Run isolated test', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('saved but not published');
    await expect(page.getByRole('alert')).toContainText('Review & publish');
    await expect(page.getByRole('alert')).toContainText('Confirm publication');
    await expect(page.getByRole('alert')).toContainText('No policy activation occurred.');
    await expect(page.getByText('Version 1 · TESTING', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
