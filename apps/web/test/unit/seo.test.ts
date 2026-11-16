import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/routing', () => ({ routing: { locales: ['en', 'ar'], defaultLocale: 'en' } }));
vi.mock('@/lib/server', () => ({ sapi: vi.fn() }));

describe('seo helpers', async () => {
  const { alternates, languages, localePath } = await import('@/lib/seo');

  it('prefixes paths with the locale, without a trailing slash on the home page', () => {
    expect(localePath('en', '/')).toBe('/en');
    expect(localePath('ar', '/p/silk-dress')).toBe('/ar/p/silk-dress');
  });

  it('lists every language plus x-default for the same page', () => {
    expect(languages('/brands/nour')).toEqual({ en: '/en/brands/nour', ar: '/ar/brands/nour', 'x-default': '/en/brands/nour' });
  });

  it('makes the current locale canonical', () => {
    expect(alternates('ar', '/looks')).toEqual({ canonical: '/ar/looks', languages: languages('/looks') });
  });
});

describe('robots.txt', async () => {
  const { default: robots } = await import('@/app/robots');

  it('blocks the API and private areas in both locales and points to the sitemap', () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    for (const p of ['/api/', '/en/account', '/ar/admin', '/en/seller', '/ar/checkout']) expect(rule.disallow).toContain(p);
    expect(rule.disallow).not.toContain('/en/p');
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe('sitemap.xml', async () => {
  const { sapi } = await import('@/lib/server');
  const { default: sitemap } = await import('@/app/sitemap');

  it('emits one entry per locale with hreflang alternates for each API URL', async () => {
    vi.mocked(sapi).mockResolvedValue({
      products: [{ _id: '1', slug: 'silk-dress', updatedAt: '2026-11-01T00:00:00.000Z' }],
      brands: [{ _id: '2', slug: 'nour' }],
      categories: [],
      looks: [{ _id: 'abc' }],
      pages: [{ _id: '3', slug: 'faq' }],
    });
    const urls = await sitemap();
    const product = urls.filter((u) => u.url.endsWith('/p/silk-dress'));
    expect(product.map((u) => new URL(u.url).pathname)).toEqual(['/en/p/silk-dress', '/ar/p/silk-dress']);
    expect(product[0].lastModified).toBe('2026-11-01T00:00:00.000Z');
    expect(product[1].alternates?.languages).toMatchObject({ en: expect.stringMatching(/^https?:\/\/.+\/en\/p\/silk-dress$/) });
    for (const p of ['/en', '/ar/women', '/en/brands/nour', '/ar/looks/abc', '/en/pages/faq']) expect(urls.some((u) => new URL(u.url).pathname === p)).toBe(true);
  });

  it('still lists the static pages when the API is down', async () => {
    vi.mocked(sapi).mockResolvedValue(null);
    const urls = await sitemap();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => u.url.includes('/p/'))).toBe(false);
  });
});
