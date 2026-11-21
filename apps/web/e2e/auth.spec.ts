import { expect, request, test } from '@playwright/test';
import { csrf, login, uniq, USERS } from './helpers';

test.describe('auth', () => {
  test('register a new customer through the form', async ({ page }) => {
    const id = uniq();
    await page.goto('/en/register');
    await page.getByLabel('Full name').fill('E2E Shopper');
    await page.getByLabel('Email').fill(`e2e${id}@otd.test`);
    await page.getByLabel('Mobile number').fill(`0155${id}`);
    await page.getByLabel('Password').fill('Shopper123!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).not.toHaveURL(/\/register/);
    const me = await page.request.get('/api/auth/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).email).toBe(`e2e${id}@otd.test`);
  });

  test('sign in with the form and see the account area @mobile', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByLabel('Email or phone').fill('customer@otd.test');
    await page.getByLabel('Password').fill('Customer123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/en/account/orders');
    await expect(page).toHaveURL(/\/account\/orders/);
  });

  test('wrong password shows an error and stays on the page', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByLabel('Email or phone').fill('customer@otd.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.text-danger').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('forgot password: request a link, set a new password, sign in with it @mobile', async ({ page }) => {
    // A fresh account, so other tests that use the seeded customer are unaffected.
    const id = uniq();
    const email = `reset${id}@otd.test`;
    const reg = await page.request.post('/api/auth/register', {
      data: { name: 'Reset Shopper', email, phone: `0155${id}`, password: 'OldPass123!' },
      headers: await csrf(page.request),
    });
    expect(reg.status()).toBe(201);
    await page.context().clearCookies();

    await page.goto('/en/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot/);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send link' }).click();
    await expect(page.getByTestId('forgot-sent')).toContainText(email);

    // No email provider in tests: read the link from the admin outbox.
    const admin = await request.newContext({ baseURL: page.url().replace(/\/en\/.*$/, '') });
    const r = await admin.post('/api/auth/login', { data: USERS.admin, headers: await csrf(admin) });
    expect(r.status()).toBe(200);
    let link: string | undefined;
    await expect(async () => {
      const outbox = await (await admin.get('/api/admin/outbox')).json();
      link = outbox.find((m: any) => m.to === email && /reset\?token=/.test(m.html))?.html.match(/href="([^"]*\/reset\?token=[a-f0-9]+)"/)?.[1];
      expect(link).toBeTruthy();
    }).toPass({ timeout: 10_000 });
    await admin.dispose();

    await page.goto(new URL(link!).pathname + new URL(link!).search);
    await page.getByLabel('New password', { exact: false }).first().fill('NewPass123!');
    await page.getByLabel('Confirm new password').fill('Different123!');
    await page.getByRole('button', { name: 'Choose a new password' }).click();
    await expect(page.getByText('The passwords don’t match.')).toBeVisible();
    await page.getByLabel('Confirm new password').fill('NewPass123!');
    await page.getByRole('button', { name: 'Choose a new password' }).click();
    await expect(page.getByTestId('reset-done')).toBeVisible();

    // The link is single-use.
    await page.reload();
    await expect(page.getByTestId('reset-invalid')).toBeVisible();

    await page.goto('/en/login');
    await page.getByLabel('Email or phone').fill(email);
    await page.getByLabel('Password').fill('NewPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('a reset link without a valid token says so', async ({ page }) => {
    await page.goto('/en/reset?token=' + 'a'.repeat(48));
    await expect(page.getByTestId('reset-invalid')).toBeVisible();
    await page.goto('/ar/reset');
    await expect(page.getByTestId('reset-invalid')).toContainText('رابط');
  });

  test('protected pages send guests to sign in', async ({ page }) => {
    for (const path of ['/en/account/orders', '/en/seller', '/en/admin', '/en/checkout']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test('customers cannot open seller or admin panels', async ({ page }) => {
    await login(page, 'customer');
    for (const path of ['/en/seller', '/en/admin']) {
      await page.goto(path);
      await expect(page, path).not.toHaveURL(new RegExp(path.replace('/en', '') + '$'));
    }
  });
});
