import { APIRequestContext, expect, Page } from '@playwright/test';

// Seeded demo accounts (apps/api/src/seed.ts).
export const USERS = {
  admin: { identifier: 'admin@otd.test', password: 'Admin123!' },
  customer: { identifier: 'customer@otd.test', password: 'Customer123!' },
  nour: { identifier: 'atelier@otd.test', password: 'Seller123!' },
  kemet: { identifier: 'kemet@otd.test', password: 'Seller123!' },
} as const;
export type Who = keyof typeof USERS;

/** Log in through the API proxy; cookies land in the page's browser context. */
export async function login(page: Page, who: Who) {
  const r = await page.request.post('/api/auth/login', { data: USERS[who] });
  expect(r.status(), `login ${who}`).toBe(200);
}

export async function api<T = any>(req: APIRequestContext, method: 'GET' | 'POST' | 'PUT', path: string, data?: unknown): Promise<T> {
  const r = await req.fetch('/api' + path, { method, data });
  expect(r.status(), `${method} ${path}: ${await r.text().catch(() => '')}`).toBeLessThan(300);
  return r.json();
}

/** A product whose first colour has an in-stock size, so it can be added from the product page. */
export async function buyableProduct(req: APIRequestContext, seller = 'kemet-studio') {
  const list = await api(req, 'GET', `/products?seller=${seller}&facets=false&limit=48`);
  for (const item of list.items) {
    if (item.totalStock < 3) continue;
    const p = await api(req, 'GET', '/products/' + item.slug);
    const first = p.colors?.[0]?._id;
    const v = p.variants.find((x: any) => (!first || x.color === first) && x.stock >= 2);
    if (v) return { p, v };
  }
  throw new Error('no buyable product for ' + seller);
}

/** Collects uncaught errors, console errors and 5xx responses from our own origin. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  const origin = new URL(process.env.WEB_URL ?? 'http://localhost:3100').origin;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // covered by the response check below (and 401 for guests is expected)
    errors.push('console: ' + t);
  });
  page.on('response', (r) => {
    if (r.status() >= 500 && r.url().startsWith(origin)) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return errors;
}

export const uniq = () => Date.now().toString().slice(-7);
