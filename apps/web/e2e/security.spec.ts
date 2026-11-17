import { expect, test } from '@playwright/test';
import { csrf, login } from './helpers';

// Side test: browser-level security expectations.
test.describe('security', () => {
  test('auth cookies are httpOnly and SameSite', async ({ page, context }) => {
    await login(page, 'customer');
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name === 'otd_at' || c.name === 'otd_rt');
    expect(auth.length).toBeGreaterThan(0);
    for (const c of auth) {
      expect(c.httpOnly, c.name).toBe(true);
      expect(['Lax', 'Strict'], c.name).toContain(c.sameSite);
    }
    // ...so page scripts cannot read them.
    await page.goto('/en');
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/otd_(at|rt)=/);
  });

  test('private uploads are not readable without signing in', async ({ page, browser }) => {
    await login(page, 'customer');
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
      'hex',
    );
    const up = await page.request.post('/api/files?visibility=private', { headers: await csrf(page.request), multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: png } } });
    expect(up.status()).toBe(201);
    const { url } = await up.json();
    expect((await page.request.get(url)).status()).toBe(200);

    const anon = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    expect((await anon.request.get(url)).status()).toBe(401);
    await anon.close();
  });

  test('product text is rendered as text, not HTML', async ({ page }) => {
    let alerted = false;
    page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
    await page.goto('/en/search?q=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    await page.waitForLoadState('networkidle');
    expect(alerted).toBe(false);
  });
});

test.describe('csrf', () => {
  test('state-changing API calls need the token from the otd_csrf cookie', async ({ page }) => {
    await login(page, 'customer');
    // A forged request rides along with the session cookies but cannot read the token.
    const forged = await page.request.post('/api/cart/price', { data: { items: [] } });
    expect(forged.status()).toBe(403);
    expect((await forged.json()).code).toBe('CSRF');
    const ok = await page.request.post('/api/cart/price', { data: { items: [] }, headers: await csrf(page.request) });
    expect(ok.status()).toBeLessThan(400);
  });

  test('the storefront sends the token itself (sign-in through the UI works)', async ({ page, context }) => {
    await page.goto('/en/login');
    await page.getByLabel('Email or phone').fill('customer@otd.test');
    await page.getByLabel('Password').fill('Customer123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'otd_at')).toBe(true);
    const token = (await context.cookies()).find((c) => c.name === 'otd_csrf');
    expect(token?.httpOnly).toBe(false);
  });
});
