import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Source-pinned F31 original Control login, real Chromium layout/readability.
 * This runs against an isolated Grant browser fixture, not owner-persona UAT.
 */
test('F31 Control-original login fits desktop and 375/320px mobile without hiding Sign In', async ({ browser }) => {
  for (const width of [1440, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    try {
      await page.goto('/login');
      await expect(page.locator('[data-testid="gdc-login-centered"]')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Welcome to DataRelay', exact: true })).toBeVisible();
      await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
      const button = page.getByRole('button', { name: 'Sign In', exact: true });
      await expect(button).toBeVisible();
      const [geometry, dimensions] = await Promise.all([
        button.boundingBox(),
        page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        })),
      ]);
      expect(geometry, 'Expected actual Sign In bounding rectangle').not.toBeNull();
      expect(geometry!.x).toBeGreaterThanOrEqual(0);
      expect(geometry!.y + geometry!.height).toBeLessThanOrEqual(844);
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
      await button.click();
      await expect(page.getByRole('alert')).toContainText('Enter your username and password.');
    } finally {
      await context.close();
    }
  }
});


function currentFixture(): { password: string } {
  return JSON.parse(fs.readFileSync(
    process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'), 'utf8',
  )) as { password: string };
}

function totpCode(secret: string, atMs = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const char of secret.replaceAll('=', '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Invalid disposable fixture TOTP secret');
    accumulator = (accumulator << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).padStart(6, '0');
}

async function grantSignIn(page: Page, username: string): Promise<void> {
  // Preserve Grant's real post-login workspace path: /login is a signed-out
  // entry only and intentionally has no authenticated product route.
  await page.goto('/home');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(currentFixture().password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test('F31 Control login completes Grant-native MFA TOTP and recovery without approval-email PIN reuse', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  try {
    await grantSignIn(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    await page.goto('/security');
    await page.getByRole('button', { name: 'Set up MFA', exact: true }).click();
    const uriCode = page.locator('code.dr-auth-secret').filter({ hasText: 'otpauth://totp/' });
    await expect(uriCode).toBeVisible();
    const uri = await uriCode.textContent();
    const secret = new URL(uri ?? '').searchParams.get('secret');
    expect(secret).toBeTruthy();
    await page.getByLabel('Confirm authentication code', { exact: true }).fill(totpCode(secret!));
    await page.getByRole('button', { name: 'Confirm MFA', exact: true }).click();
    const recoveryList = page.getByRole('list', { name: 'Recovery codes', exact: true });
    await expect(recoveryList).toBeVisible();
    const codes = await recoveryList.locator('code').allTextContents();
    expect(codes).toHaveLength(8);
    expect(codes.every(code => /^[a-f0-9]{24}$/.test(code))).toBeTruthy();
    await page.getByRole('button', { name: 'I stored the codes', exact: true }).click();

    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
    await grantSignIn(page, 'admin');
    await expect(page.getByLabel('Authenticator code', { exact: true })).toBeVisible();
    await page.getByLabel('Authenticator code', { exact: true })
      .fill(totpCode(secret!, Date.now() + 30_000));
    await page.getByRole('button', { name: 'Verify code', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();

    await grantSignIn(page, 'admin');
    await expect(page.getByRole('button', { name: 'Use a recovery code', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use a previously issued Grant recovery code' })).toBeVisible();
    await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(codes[0]!);
    await page.getByRole('button', { name: 'Verify recovery code', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
    await grantSignIn(page, 'admin');
    await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(codes[0]!);
    await page.getByRole('button', { name: 'Verify recovery code', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).not.toBeVisible();
  } finally {
    await context.close();
  }
});
