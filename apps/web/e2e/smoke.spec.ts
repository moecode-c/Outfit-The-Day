import { expect, test } from '@playwright/test';
import { api, watchErrors } from './helpers';

// Side test: every public page renders in both languages with no crashes, console errors or 5xx.
test.describe('smoke: public routes', () => {
  let dynamic: string[] = [];

  test.beforeAll(async ({ request }) => {
    const [products, brands, looks, cats] = await Promise.all([
      api(request, 'GET', '/products?limit=1&facets=false'),
      api(request, 'GET', '/brands'),
      api(request, 'GET', '/looks'),
      api(request, 'GET', '/categories'),
    ]);
    const brandList = Array.isArray(brands) ? brands : brands.items;
    const lookList = Array.isArray(looks) ? looks : looks.items;
    dynamic = [
      `/p/${products.items[0].slug}`,
      `/brands/${brandList[0].slug}`,
      ...(lookList[0] ? [`/looks/${lookList[0]._id}`] : []),
      `/c/${cats[0].slug}`,
    ];
  });

  const statics = ['', '/women', '/men', '/kids', '/brands', '/looks', '/search?q=dress', '/bag', '/login', '/register', '/forgot', '/sell'];

  for (const locale of ['en', 'ar']) {
    test(`all public pages render in ${locale} @mobile`, async ({ page }) => {
      const errors = watchErrors(page);
      for (const path of [...statics, ...dynamic]) {
        const r = await page.goto(`/${locale}${path}`);
        expect(r?.status(), `${locale}${path}`).toBeLessThan(400);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('body')).not.toContainText('Application error');
        await page.waitForLoadState('networkidle');
      }
      expect(errors).toEqual([]);
    });
  }

  test('CMS pages from the seed render', async ({ page, request }) => {
    const config = await api(request, 'GET', '/content/config').catch(() => null);
    const slugs: string[] = (config?.pages ?? []).map((p: any) => p.slug ?? p).filter(Boolean);
    for (const slug of slugs.length ? slugs : ['about']) {
      const r = await page.goto(`/en/pages/${slug}`);
      expect([200, 404], slug).toContain(r?.status());
    }
  });

  test('API is reachable through the web proxy', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    expect((await r.json()).db).toBe('up');
  });
});
