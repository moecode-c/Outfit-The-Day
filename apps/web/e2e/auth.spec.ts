import { expect, test } from '@playwright/test';
import { login, uniq } from './helpers';

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
