import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const evidenceDir = process.env.GRANT_UX_EVIDENCE_DIR ?? path.resolve('../.e2e/pf05-novice');
const fixture = (): { password: string; profile_id: string } => JSON.parse(fs.readFileSync(
  process.env.GRANT_E2E_FIXTURE_PATH ?? path.resolve('../.e2e/fixture.json'), 'utf8',
)) as { password: string; profile_id: string };

async function capture(page: Page, label: string) {
  fs.mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  const snapshot = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.querySelector('#dr-main-content') ?? document.body;
    const visible = (e: HTMLElement) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const controls = [...main.querySelectorAll('button,a,select,input,textarea')].filter(e => visible(e as HTMLElement));
    return {
      headings: [...main.querySelectorAll('h1,h2,h3,h4')].filter(e => visible(e as HTMLElement)).map(e => e.textContent?.trim()).slice(0, 45),
      buttons: controls.filter(e => e.tagName === 'BUTTON').map(e => ({
        text: (e.textContent || '').trim().slice(0, 120),
        aria: e.getAttribute('aria-label'),
        title: e.getAttribute('title'),
        disabled: (e as HTMLButtonElement).disabled,
      })).slice(0, 75),
      links: controls.filter(e => e.tagName === 'A').map(e => ({
        text: (e.textContent || '').trim().slice(0, 100), href: (e as HTMLAnchorElement).getAttribute('href'),
      })).slice(0, 45),
      text: (main.textContent || '').replace(/\s+/g, ' ').slice(0, 8500),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  fs.writeFileSync(path.join(evidenceDir, label + '.json'),
    JSON.stringify({ pathname: new URL(page.url()).pathname, snapshot }, null, 2), { mode: 0o600 });
  await page.screenshot({ path: path.join(evidenceDir, label + '.png'), fullPage: true });
  console.log('PF05_UX_CAPTURE', label, JSON.stringify({
    pathname: new URL(page.url()).pathname, headings: snapshot.headings,
    firstButtons: snapshot.buttons.map(a => a.aria || a.text).filter(Boolean).slice(0, 25),
    overflow: snapshot.overflow,
  }));
}

async function login(page: Page, username: string) {
  await page.goto('/home');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(fixture().password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}

test('PF05 novice administrator discovers configuration chain and unsupported system tasks', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await login(page, 'admin');
    await capture(page, '01-admin-home');
    await page.getByRole('button', { name: /Administrator\? Open workflow setup/ }).click();
    await expect(page.getByRole('heading', { name: 'Configure once, reuse on every request' })).toBeVisible();
    await capture(page, '02-admin-workflow-setup');
    await page.getByRole('link', { name: /Open user management/ }).click();
    await expect(page.getByRole('heading', { name: 'User Management', level: 2 })).toBeVisible();
    await capture(page, '03-admin-account-setup');
    await page.goBack();
    await page.getByRole('button', { name: /Manage approver groups/ }).click();
    await expect(page.getByRole('heading', { name: 'Approver groups', level: 1 })).toBeVisible();
    await capture(page, '04-admin-approver-groups');
    await page.goto('/system');
    await capture(page, '05-admin-system-tasks');
    for (const label of ['Management Access (ACL)', 'Roles & Permissions', 'Sessions']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test('PF05 novice requester and approver complete independently authenticated human decision', async ({ browser }) => {
  test.setTimeout(120_000);
  const rc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ac = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const requester = await rc.newPage();
  const approver = await ac.newPage();
  try {
    await login(requester, 'requester');
    await capture(requester, '06-requester-home');
    await requester.getByRole('button').filter({ hasText: 'Create approval request' }).click();
    await capture(requester, '07-requester-new-form');
    await requester.getByLabel('Request type', { exact: true }).selectOption(fixture().profile_id);
    await requester.getByLabel('Request title', { exact: true }).fill('Novice guided approval audit');
    await requester.getByLabel('Target', { exact: true }).fill('novice-audit-target');
    await requester.getByLabel('Reason', { exact: true }).fill('Non-executing private browser UX regression');
    await requester.getByRole('button', { name: 'Review request', exact: true }).click();
    await capture(requester, '08-requester-review-before-confirm');
    await expect(requester.getByRole('button', { name: 'Confirm create request', exact: true })).toBeVisible();
    await requester.getByRole('button', { name: 'Confirm create request', exact: true }).click();
    await capture(requester, '09-requester-submitted');
    const detail = requester.url();
    await login(approver, 'approver');
    await capture(approver, '10-approver-home');
    await approver.getByRole('button').filter({ hasText: 'Review assigned work' }).click();
    await capture(approver, '11-approver-inbox');
    await approver.goto(detail);
    await capture(approver, '12-approver-request-detail');
    await approver.getByRole('button', { name: 'Approve', exact: true }).click();
    await capture(approver, '13-approver-before-confirm');
    await expect(approver.getByRole('button', { name: 'Confirm approved', exact: true })).toBeVisible();
    await approver.getByRole('button', { name: 'Confirm approved', exact: true }).click();
    await capture(approver, '14-approver-confirmed');
    await requester.reload();
    await expect(requester.getByRole('region', { name: 'Current request workflow' })
      .getByText('APPROVED', { exact: true })).toBeVisible();
    await capture(requester, '15-requester-durable-result');
  } finally {
    await Promise.all([rc.close(), ac.close()]);
  }
});

test('PF05 novice Grant mobile workflow avoids horizontal overflow at 390 and 320 pixels', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await page.goto('/home');
    await capture(page, '16-mobile-login-390');
    await login(page, 'requester');
    await capture(page, '17-mobile-requester-home-390');
    await page.getByRole('button').filter({ hasText: 'Create approval request' }).click();
    await capture(page, '18-mobile-request-form-390');
    await page.setViewportSize({ width: 320, height: 680 });
    await capture(page, '19-mobile-request-form-320');
    const horizontal = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(horizontal, 'Grant-owned request form should not horizontally overflow at 320px').toBe(false);
  } finally {
    await ctx.close();
  }
});

test('PF05 accounts must not claim an empty roster before their initial GET finishes', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  let releaseFetch = () => {};
  const waitForRelease = new Promise<void>(resolve => { releaseFetch = resolve; });
  try {
    await login(page, 'admin');
    await page.route('**/api/v1/admin/users', async route => {
      await waitForRelease;
      await route.continue();
    });
    await page.goto('/system?view=accounts');
    await expect(page.getByRole('heading', { name: 'User Management', level: 2 })).toBeVisible();
    await capture(page, '20-admin-account-list-pending-fetch');
    await expect(page.getByText('No accounts are available from the product adapter.', { exact: true }))
      .toHaveCount(0);
    releaseFetch();
    await expect(page.getByText('admin@example.invalid', { exact: false })).toBeVisible();
    await capture(page, '21-admin-account-list-loaded');
  } finally {
    releaseFetch();
    await context.close();
  }
});

test('PF05 novice administrator and member can discover task routes without guessing URLs', async ({ browser }) => {
  test.setTimeout(150_000);
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const admin = await adminContext.newPage();
  const member = await memberContext.newPage();
  try {
    await login(admin, 'admin');
    const nav = admin.getByRole('navigation', { name: 'Primary navigation' });
    for (const [label, route, slug] of [
      ['Workflow setup', '/admin/setup', 'workflow'],
      ['Approver groups', '/approvers', 'groups'],
      ['Integrations', '/integrations', 'integrations'],
      ['Notification templates', '/notifications', 'notifications'],
      ['Approval policies', '/profiles', 'policies'],
      ['Operations', '/operations', 'operations'],
      ['Audit explorer', '/audit', 'audit'],
      ['System management', '/system', 'system'],
    ]) {
      await nav.getByRole('button', { name: label, exact: true }).click();
      await expect(admin).toHaveURL(new RegExp(route.replaceAll('/', '\\/') + '(?:$|\\?)'));
      if (slug === 'policies') {
        await expect(admin.getByRole('heading', { name: 'Manage existing approval workflows' }))
          .toBeVisible();
      }
      await capture(admin, 'admin-route-' + slug);
    }
    await login(member, 'requester');
    const memberNav = member.getByRole('navigation', { name: 'Primary navigation' });
    for (const [label, route, slug] of [
      ['Home', '/home', 'home'],
      ['New request', '/requests/new', 'new-request'],
      ['My approvals', '/approvals', 'approvals'],
      ['My requests', '/my-requests', 'my-requests'],
      ['Delegations', '/delegations', 'delegations'],
      ['Account & security', '/security', 'security'],
    ]) {
      await memberNav.getByRole('button', { name: label, exact: true }).click();
      await expect(member).toHaveURL(new RegExp(route.replaceAll('/', '\\/') + '(?:$|\\?)'));
      await capture(member, 'member-route-' + slug);
    }
    await member.goto('/system');
    await expect(member.getByText('Page unavailable', { exact: true })).toBeVisible();
    await capture(member, 'member-admin-denied');
  } finally {
    await Promise.all([adminContext.close(), memberContext.close()]);
  }
});

test('PF05 failed account GET is a verified error and never a false zero-account report', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await login(page, 'admin');
    await page.route('**/api/v1/admin/users', route => route.abort('failed'));
    await page.goto('/system?view=accounts');
    await expect(page.getByRole('heading', { name: 'User Management', level: 2 })).toBeVisible();
    await expect(page.getByText('Account directory could not be verified. Retry before changing access.')).toBeVisible();
    await expect(page.getByText('No accounts are available from the product adapter.', { exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review account creation', exact: true })).toBeDisabled();
    await capture(page, '22-admin-account-fetch-failed');
    await expect(page.getByRole('button', { name: 'Retry account directory', exact: true })).toBeVisible();
    await page.unroute('**/api/v1/admin/users');
    await page.getByRole('button', { name: 'Retry account directory', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review account creation', exact: true })).toBeEnabled();
    await capture(page, '23-admin-account-retry-succeeded');
  } finally {
    await context.close();
  }
});


test('PF05 workflow title must remain readable against the dark Control-derived shell', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await login(page, 'admin');
    await page.getByRole('button', { name: /Administrator\\? Open workflow setup/ }).click();
    const title = page.locator('#grant-admin-workflow-title');
    await expect(title).toBeVisible();
    const colors = await title.evaluate(element => {
      const reference = document.querySelector<HTMLElement>('.grant-admin-setup-step > strong');
      if (!reference) throw Error('MISSING_CARD_TEXT_REFERENCE');
      const mainText = getComputedStyle(element).color;
      const referenceText = getComputedStyle(reference).color;
      const brightness = (css: string): number => {
        const values = css.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        if (values.length !== 3) throw Error('UNPARSABLE_COLOR_' + css);
        const normalized = values.map(channel => {
          const v = channel / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return normalized[0]! * .2126 + normalized[1]! * .7152 + normalized[2]! * .0722;
      };
      return {
        title: mainText,
        reference: referenceText,
        luminanceDifference: Math.abs(brightness(mainText) - brightness(referenceText)),
      };
    });
    console.log('PF05_VISUAL_HEADER_COLOR', JSON.stringify(colors));
    expect(colors.luminanceDifference, 'Main workflow heading must be as readable as other main headings in the same theme')
      .toBeLessThan(0.28);
  } finally {
    await ctx.close();
  }
});
