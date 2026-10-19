import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Disposable SMTP and real localhost Chromium browser only.
 * No human mailbox, external SMTP sender, production address, or credential access.
 * Proves the exact three-button email-link fallback workflow on the mounted Grant UI.
 */
function fixture(): {
  password: string;
  profile_id: string;
  receiver: string;
  token: string;
} {
  return JSON.parse(fs.readFileSync(
    process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'), 'utf8',
  ));
}

async function login(page: Page, name: string) {
  await page.goto('/home');
  await page.getByLabel('Username', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill(fixture().password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}

function decodeFixtureMime(message: string): string {
  return message.replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_text, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

test('PF05 actual generated approval email exposes separate Approve Hold Deny links and Hold PIN remains a reviewed decision', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const f = fixture();
  const senderContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const independentLinkContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const sender = await senderContext.newPage();
  const reviewer = await independentLinkContext.newPage();
  const title = 'PF05 choice-link Hold ' + crypto.randomUUID().slice(0, 8);
  const target = 'isolated-pf05-non-executing-target';
  const state = async (id: string) => {
    const res = await request.get('/api/v1/requests/' + id, {
      headers: { authorization: 'Bearer ' + f.token },
    });
    expect(res.status()).toBe(200);
    return res.json();
  };
  try {
    await login(sender, 'requester');
    await sender.locator('#dr-main-content').getByRole('button', { name: 'New request', exact: true }).click();
    await sender.getByLabel('Request type', { exact: true }).selectOption(f.profile_id);
    await sender.getByLabel('Request title', { exact: true }).fill(title);
    await sender.getByLabel('Target', { exact: true }).fill(target);
    await sender.getByLabel('Reason', { exact: true }).fill('Inspect all three action links and use Hold without executing');
    await sender.getByRole('button', { name: 'Review request', exact: true }).click();
    await sender.getByRole('button', { name: 'Confirm create request', exact: true }).click();
    await expect(sender.getByText('Exact action requiring approval', { exact: true })).toBeVisible();
    const id = new URL(sender.url()).pathname.split('/').at(-1)!;
    expect(id).toMatch(/^[a-f0-9-]{36}$/);

    await expect.poll(async () => {
      const receipts = await (await request.get(f.receiver)).json();
      return (receipts.mail as string[]).some(message =>
        message.includes(title) && message.includes('Four-digit confirmation PIN:'));
    }, { timeout: 15_000 }).toBeTruthy();

    const receipts = await (await request.get(f.receiver)).json();
    const raw = (receipts.mail as string[]).find(message =>
      message.includes(title) && message.includes('Four-digit confirmation PIN:'));
    expect(raw).toBeTruthy();
    const message = decodeFixtureMime(raw!);
    const links = new Map<string, string>();
    for (const action of ['Approve', 'Hold', 'Deny']) {
      const regex = new RegExp(action + ':\\s*(http:\\/\\/127\\.0\\.0\\.1:\\d+\\/api\\/v1\\/decision-intents\\/[a-zA-Z0-9_-]+)');
      const url = message.match(regex)?.[1];
      expect(url, action + ' must have its own original issued fallback URL in real fixture mail').toBeTruthy();
      links.set(action, url!);
    }
    expect(new Set(links.values()).size).toBe(3);
    const pin = message.match(/Four-digit confirmation PIN:\s*(\d{4})/)?.[1];
    expect(pin).toMatch(/^\d{4}$/);
    expect((await state(id)).state).toBe('AWAITING');

    // Link preflights MUST be inert and may not reveal the request's action/target.
    for (const action of ['Approve', 'Hold', 'Deny']) {
      const previewResponse = await request.get(links.get(action)!, {
        headers: { Accept: 'application/json' },
      });
      expect(previewResponse.status()).toBe(200);
      const preview = await previewResponse.json();
      expect(preview.details_visible).toBe(false);
      expect(preview.pin_required).toBe(true);
      expect(JSON.stringify(preview)).not.toContain(target);
    }
    expect((await state(id)).state).toBe('AWAITING');

    const postPaths: string[] = [];
    reviewer.on('request', outgoing => {
      if (outgoing.method() === 'POST' && outgoing.url().includes('/decision-intents/')) {
        postPaths.push(new URL(outgoing.url()).pathname.replace(/\/decision-intents\/[^/]+/, '/decision-intents/[redacted]'));
      }
    });
    await reviewer.goto(links.get('Hold')!);
    await expect(reviewer.getByRole('heading', { name: 'Hold request', exact: true })).toBeVisible();
    await expect(reviewer.getByRole('button', { name: 'Confirm Hold', exact: true })).toHaveCount(0);
    await expect(reviewer.getByText(target, { exact: false })).toHaveCount(0);
    expect(postPaths).toHaveLength(0);

    await reviewer.getByLabel('Four-digit code from the email').fill(pin!);
    await reviewer.getByRole('button', { name: 'Verify code', exact: true }).click();
    await expect(reviewer.getByRole('heading', { name: 'Review request', exact: true })).toBeFocused();
    await expect(reviewer.getByLabel('Verified request summary')).toContainText(title);
    await expect(reviewer.getByLabel('Verified request summary')).toContainText(target);
    await expect(reviewer.getByText('Hold is provisional.', { exact: false })).toBeVisible();
    await expect(reviewer.getByRole('button', { name: 'Confirm Hold', exact: true })).toBeVisible();
    expect((await state(id)).state).toBe('AWAITING');
    expect(postPaths.filter(value => value.endsWith('/confirm'))).toHaveLength(0);

    await reviewer.getByRole('button', { name: 'Confirm Hold', exact: true }).click();
    await expect(reviewer.getByRole('heading', { name: 'Decision recorded', exact: true })).toBeFocused();
    await expect.poll(async () => (await state(id)).state).toBe('HELD');
    expect((await state(id)).execution_state).toBe('NOT_STARTED');
    expect(postPaths.filter(value => value.endsWith('/verify'))).toHaveLength(1);
    expect(postPaths.filter(value => value.endsWith('/confirm'))).toHaveLength(1);

    // A consumed HOLD token cannot cast a second vote; another outcome in
    // the same issued email is still valid because HELD is provisional.
    await reviewer.goto(links.get('Hold')!);
    await expect(reviewer.getByText('This approval link is not available.', { exact: false }))
      .toBeVisible();
    expect((await state(id)).state).toBe('HELD');

    await reviewer.goto(links.get('Approve')!);
    await expect(reviewer.getByRole('heading', { name: 'Approve request', exact: true })).toBeVisible();
    await expect(reviewer.getByRole('button', { name: 'Confirm Approve', exact: true })).toHaveCount(0);
    expect((await state(id)).state).toBe('HELD');
    await reviewer.getByLabel('Four-digit code from the email').fill(pin!);
    await reviewer.getByRole('button', { name: 'Verify code', exact: true }).click();
    await expect(reviewer.getByRole('heading', { name: 'Review request', exact: true })).toBeFocused();
    await expect(reviewer.getByRole('button', { name: 'Confirm Approve', exact: true })).toBeVisible();
    expect((await state(id)).state).toBe('HELD');
    await reviewer.getByRole('button', { name: 'Confirm Approve', exact: true }).click();
    await expect(reviewer.getByRole('heading', { name: 'Decision recorded', exact: true })).toBeFocused();
    await expect.poll(async () => (await state(id)).state).toBe('APPROVED');
    expect((await state(id)).execution_state).toBe('NOT_STARTED');
    expect(postPaths.filter(value => value.endsWith('/verify'))).toHaveLength(2);
    expect(postPaths.filter(value => value.endsWith('/confirm'))).toHaveLength(2);
    console.log('PF05_APPROVE_HOLD_DENY_FALLBACK=3/3 URLS; HOLD_TO_APPROVE_PIN_REVIEW_CONFIRM=PASS; REPLAY_REFUSED=YES; NO_EXECUTION=YES');
  } finally {
    await Promise.all([senderContext.close(), independentLinkContext.close()]);
  }
});
