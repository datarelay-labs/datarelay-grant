import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const fixture = () => JSON.parse(
  fs.readFileSync(process.env.GRANT_E2E_FIXTURE_PATH ??
    path.resolve('../.e2e/fixture.json'), 'utf8'),
);

async function signInAsAdmin(page: Page) {
  await page.goto('/home');
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill(fixture().password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}

test('PF-04 administrator sees true ingress and recovery absence without any host action', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await signInAsAdmin(page);
    const proof = await context.request.get('/api/v1/admin/operational-readiness');
    expect(proof.status()).toBe(200);
    const state = await proof.json();
    expect(state).toMatchObject({
      schema_version: 1,
      scope: 'stored_grant_facts_only',
      allows_execution: false,
      management_ingress: {
        web_allowlist: 'not_configured',
        host_ssh_enforcement: 'not_verified',
        access_rule_change_authorized: false,
      },
      backup_recovery: {
        registered_evidence: 'unavailable',
        restore_drill: 'not_verified',
        restore_authorized: false,
      },
      retention: {
        policy: 'not_configured',
        approval_record_deletion_enabled: false,
      },
    });

    await page.goto('/system');
    await page.getByRole('button', { name: 'View Network', exact: true }).click();
    const detail = page.getByTestId('grant-admin-selected-detail');
    await expect(detail.getByText('Management ingress evidence', { exact: true })).toBeVisible();
    await expect(detail.getByText('Host SSH enforcement', { exact: true })).toBeVisible();
    await expect(detail.getByText('Not verified', { exact: true })).toBeVisible();
    await expect(detail.getByText('Web management CIDR allowlist', { exact: true })).toBeVisible();
    await expect(detail.getByText('Not authorized', { exact: true })).toBeVisible();
    await expect(detail.getByText('Configured network surface', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Back to administration tasks', exact: true }).click();
    await page.getByRole('button', { name: 'View Backup & Import', exact: true }).click();
    await expect(detail.getByText('Persisted recovery and retention evidence', { exact: true })).toBeVisible();
    await expect(detail.getByText('Independently verified restore drill', { exact: true })).toBeVisible();
    await expect(detail.getByText('Record deletion by Grant', { exact: true })).toBeVisible();
    await expect(detail.getByText('Disabled', { exact: true })).toBeVisible();
    const pause = state.backup_recovery.recovery_paused === null ? 'Unavailable'
      : state.backup_recovery.recovery_paused ? 'Active' : 'Not active';
    await expect(detail.locator('dt', { hasText: 'Recovery pause' })
      .locator('xpath=following-sibling::dd[1]')).toHaveText(pause);

    for (const name of [
      'Restore database', 'Confirm restore', 'Delete approval records',
      'Apply SSH rule', 'Apply Web ACL', 'Enable host retention',
    ]) {
      await expect(detail.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    expect((await context.request.get('/api/v1/admin/operational-readiness')).status()).toBe(200);
    expect(await (await context.request.get('/api/v1/admin/operational-readiness')).json()).toEqual(state);
  } finally {
    await context.close();
  }
});
