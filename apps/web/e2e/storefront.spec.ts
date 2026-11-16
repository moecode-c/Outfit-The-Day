import { expect, test } from '@playwright/test';
import { buyableProduct, watchErrors } from './helpers';

test.describe('storefront', () => {
  test('home renders hero, header and products @mobile', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/en');
    await expect(page).toHaveTitle(/OTD/i);
    await expect(page.getByRole('link', { name: 'OTD' }).first()).toBeVisible();
    await expect(page.locator('a[href*="/p/"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('root redirects to a locale', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(en|ar)(\/|$)/);
  });

  test('Arabic is right-to-left and translated @mobile', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('body')).toContainText('الحقيبة'); // "Bag"
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('language switch keeps the current page', async ({ page }) => {
    await page.goto('/en/brands');
    await page.getByRole('link', { name: 'العربية' }).first().click();
    await expect(page).toHaveURL(/\/ar\/brands/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('dark mode toggles and survives a reload', async ({ page }) => {
    await page.goto('/en');
    const html = page.locator('html');
    const before = (await html.getAttribute('data-theme')) ?? 'light';
    await page.getByRole('button', { name: 'Toggle theme' }).first().click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', after);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', after);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('');
  });

  test('search finds products from the header', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('button', { name: 'Search' }).first().click();
    const box = page.getByPlaceholder(/Search pieces/);
    await box.fill('dress');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=dress/);
    await expect(page.locator('a[href*="/p/"]').first()).toBeVisible();
  });

  test('Arabic search works', async ({ page }) => {
    await page.goto('/ar/search?q=' + encodeURIComponent('فستان'));
    await expect(page.locator('a[href*="/p/"]').first()).toBeVisible();
  });

  test('department listing filters by sale', async ({ page }) => {
    await page.goto('/en/women?onSale=true');
    await expect(page.locator('a[href*="/p/"]').first()).toBeVisible();
  });

  test('product page shows price, sizes and add to bag @mobile', async ({ page, request }) => {
    const { p } = await buyableProduct(request);
    await page.goto('/en/p/' + p.slug);
    await expect(page.getByRole('heading', { name: p.title.en }).first()).toBeVisible();
    await expect(page.getByText(/EGP/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to bag' })).toBeEnabled();
  });

  test('mobile menu opens the navigation drawer @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/en');
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('link', { name: 'Brands' }).last()).toBeVisible();
  });

  test('unknown product shows a not-found page', async ({ page }) => {
    const r = await page.goto('/en/p/definitely-not-a-product');
    expect(r?.status()).toBe(404);
  });
});
