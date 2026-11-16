import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Side test: browser-level security expectations.
test.describe('security', () => {
  test('auth cookies are httpOnly and SameSite', async ({ page, context }) => {
    await login(page, 'customer');
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name.startsWith('otd_'));
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
    const up = await page.request.post('/api/files?visibility=private', { multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: png } } });
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
