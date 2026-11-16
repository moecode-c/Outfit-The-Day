import { describe, expect, it, vi } from 'vitest';

// Regression guard: a mis-escaped matcher once excluded every route, so Arabic never rendered.
vi.mock('next-intl/middleware', () => ({ default: () => () => null }));
vi.mock('@/i18n/routing', () => ({ routing: {} }));

describe('middleware matcher', async () => {
  const { config } = await import('@/middleware');
  const re = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/', '/en', '/ar', '/ar/brands', '/en/p/silk-slip-dress', '/ar/account/orders', '/women'])('runs on page route %s', (p) => {
    expect(re.test(p)).toBe(true);
  });

  it.each(['/api/products', '/uploads/a.png', '/_next/static/chunk.js', '/favicon.ico', '/robots.txt', '/_vercel/insights'])(
    'skips %s',
    (p) => {
      expect(re.test(p)).toBe(false);
    },
  );
});
