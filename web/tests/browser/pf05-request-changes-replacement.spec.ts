import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PF05 scoped disposable Chromium: a request for action changes must never
 * reauthorize the original action or silently inherit its approval.
 * Real inbox delivery, public HTTPS, and native Control/Stellar are NOT tested.
 */
const fixture = (): { password: string; profile_id: string; token: string } =>
  JSON.parse(fs.readFileSync(
    process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'), 'utf8',
  ));

async function login(page: Page, name: 'requester' | 'approver', password: string) {
  await page.goto('/home');
  await page.getByLabel('Username', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}

test('PF05 changes requested → cancel original → linked replacement → new approval, no inherited execution', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const f = fixture();
  const requesterContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const requester = await requesterContext.newPage();
  const approver = await approverContext.newPage();
  const headers = { authorization: 'Bearer ' + f.token };
  const read = async (id: string) => {
    const result = await request.get('/api/v1/requests/' + id, { headers });
    expect(result.status()).toBe(200);
    return result.json();
  };
  try {
    await login(requester, 'requester', f.password);
    await login(approver, 'approver', f.password);

    // Requester genuinely creates and reviews a harmless nonexecuting action.
    await requester.locator('#dr-main-content')
      .getByRole('button', { name: 'New request', exact: true }).click();
    await requester.getByLabel('Request type', { exact: true }).selectOption(f.profile_id);
    await requester.getByLabel('Request title', { exact: true })
      .fill('PF05 original target requiring correction');
    await requester.getByLabel('Target', { exact: true }).fill('isolated-original-target');
    await requester.getByLabel('Reason', { exact: true })
      .fill('Disposable change-request lifecycle verification');
    await requester.getByRole('button', { name: 'Review request', exact: true }).click();
    await expect(requester.getByRole('button', { name: 'Confirm create request' })).toBeVisible();
    await requester.getByRole('button', { name: 'Confirm create request' }).click();
    await expect(requester).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    await expect(requester.getByText('Exact action requiring approval', { exact: true })).toBeVisible();
    const oldId = requester.url().split('/').pop()!;
    const original = await read(oldId);
    expect(original.state).toBe('AWAITING');
    expect(original.execution_state).toBe('NOT_STARTED');

    // A distinct approver asks for changed action, not simply information.
    await approver.goto('/requests/' + oldId);
    await expect(approver.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await approver.getByLabel('Message purpose', { exact: true }).selectOption('REQUEST_CHANGES');
    await approver.getByLabel('Message (up to 2000 characters; no credentials)', { exact: true })
      .fill('Please correct the target and start a new approval.');
    await approver.getByRole('button', { name: 'Review message', exact: true }).click();
    expect((await read(oldId)).comments).toHaveLength(0);
    await approver.getByRole('button', { name: 'Confirm message', exact: true }).click();
    await expect(approver.getByText('Action changes requested', { exact: true })).toBeVisible();
    await expect(approver.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    const blocked = await read(oldId);
    expect(blocked.state).toBe('AWAITING');
    expect(blocked.collaboration_state).toBe('CHANGES_REQUESTED');
    expect(blocked.action_hash).toBe(original.action_hash);
    expect(blocked.execution_state).toBe('NOT_STARTED');
    expect(blocked.comments.map((comment: { kind: string }) => comment.kind))
      .toEqual(['REQUEST_CHANGES']);

    // The original requester must cancel instead of editing an immutable action.
    await requester.reload();
    await expect(requester.getByText('Action changes requested', { exact: true })).toBeVisible();
    await requester.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(requester.getByRole('button', { name: 'Confirm cancelled', exact: true })).toBeVisible();
    await requester.getByRole('button', { name: 'Confirm cancelled', exact: true }).click();
    await expect.poll(async () => (await read(oldId)).state).toBe('CANCELLED');
    expect((await read(oldId)).execution_state).toBe('NOT_STARTED');

    // Linked replacement is a fresh reviewed request with a different action hash.
    await requester.getByRole('button', { name: 'Create replacement request', exact: true }).click();
    await expect(requester.getByLabel('Target', { exact: true }))
      .toHaveValue('isolated-original-target');
    await requester.getByLabel('Request title', { exact: true })
      .fill('PF05 corrected replacement needs fresh approval');
    await requester.getByLabel('Target', { exact: true }).fill('isolated-corrected-target');
    await requester.getByRole('button', { name: 'Review request', exact: true }).click();
    await requester.getByRole('button', { name: 'Confirm create request', exact: true }).click();
    await expect(requester).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    await expect(requester.getByText('Exact action requiring approval', { exact: true })).toBeVisible();
    const replacementId = requester.url().split('/').pop()!;
    expect(replacementId).not.toBe(oldId);
    const replacement = await read(replacementId);
    expect(replacement.predecessor_id).toBe(oldId);
    expect(replacement.state).toBe('AWAITING');
    expect(replacement.action.target).toBe('isolated-corrected-target');
    expect(replacement.action_hash).not.toBe(original.action_hash);
    expect(replacement.execution_state).toBe('NOT_STARTED');

    // Approval of the new request must not reactivate or consume its predecessor.
    await approver.goto('/requests/' + replacementId);
    await expect(approver.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await approver.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(approver.getByRole('button', { name: 'Confirm approved', exact: true })).toBeVisible();
    await approver.getByRole('button', { name: 'Confirm approved', exact: true }).click();
    await expect.poll(async () => (await read(replacementId)).state).toBe('APPROVED');
    expect((await read(replacementId)).execution_state).toBe('NOT_STARTED');
    expect((await read(oldId)).state).toBe('CANCELLED');
    expect((await read(oldId)).execution_state).toBe('NOT_STARTED');
    console.log('PF05_REQUEST_CHANGES_LINKED_REPLACEMENT=PASS; ORIGINAL_CANCELLED; NEW_APPROVAL_INDEPENDENT; EXECUTION_NOT_STARTED');
  } finally {
    await Promise.all([requesterContext.close(), approverContext.close()]);
  }
});
