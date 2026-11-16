import { expect, test } from '@playwright/test';
import { api, login, uniq, watchErrors } from './helpers';

test.describe('admin', () => {
  test('approves a pending product, which then goes live in the shop', async ({ browser, page }) => {
    // Seller submits a product (via API, in its own browser context).
    const sellerCtx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const seller = await sellerCtx.newPage();
    await login(seller, 'nour');
    const cats = await api(seller.request, 'GET', '/categories');
    const id = uniq();
    const title = `E2E Linen Shirt ${id}`;
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
      'hex',
    );
    const img = await seller.request.post('/api/files?visibility=public', { multipart: { file: { name: 'shirt.png', mimeType: 'image/png', buffer: png } } });
    expect(img.status()).toBe(201);
    const { url } = await img.json();
    const created = await api(seller.request, 'POST', '/seller/products', {
      category: cats.find((c: any) => c.slug === 'dresses')._id,
      department: 'WOMEN',
      title: { en: title, ar: 'قميص تجريبي' },
      description: { en: 'Made by the E2E suite.', ar: '' },
      price: 99000,
      colors: [{ key: 'c1', name: { en: 'White', ar: 'أبيض' }, hex: '#ffffff', family: 'white', images: [url] }],
      variants: [{ colorKey: 'c1', size: 'M', stock: 4 }],
    });
    expect(created.status).toBe('PENDING');
    await sellerCtx.close();

    const errors = watchErrors(page);
    await login(page, 'admin');
    await page.goto('/en/admin/products?status=PENDING');
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible();
    // Wait for the approve request itself: the button shows a spinner (and loses its label) while saving,
    // so "no Approve button" alone can pass before the product is actually live.
    const approved = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/admin\/products\/[^/]+\/approve$/.test(r.url()));
    await row.getByRole('button', { name: 'Approve' }).click();
    expect((await approved).ok()).toBe(true);
    await expect(row).toHaveCount(0);

    const found = await api(page.request, 'GET', `/products?q=${encodeURIComponent(id)}`);
    expect(found.total).toBe(1);
    expect(errors).toEqual([]);
  });

  test('every admin section loads without errors', async ({ page }) => {
    await login(page, 'admin');
    const errors = watchErrors(page);
    for (const s of ['', 'sellers', 'products', 'reviews', 'orders', 'returns', 'finance', 'coupons', 'categories', 'content', 'shipping', 'users', 'reports', 'settings', 'admins', 'outbox']) {
      await page.goto('/en/admin/' + s);
      await expect(page.locator('main, [role=main], h1').first(), s).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });

  test('every seller section loads without errors', async ({ page }) => {
    await login(page, 'nour');
    const errors = watchErrors(page);
    for (const s of ['', 'products', 'products/new', 'orders', 'returns', 'looks', 'size-guides', 'finance', 'store']) {
      await page.goto('/en/seller/' + s);
      await expect(page.locator('h1').first(), s).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });

  test('every account section loads without errors', async ({ page }) => {
    await login(page, 'customer');
    const errors = watchErrors(page);
    for (const s of ['orders', 'returns', 'addresses', 'wishlist', 'notifications', 'profile']) {
      await page.goto('/en/account/' + s);
      await expect(page.locator('h1').first(), s).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });
});
