import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Locale-prefixed path, e.g. ('ar', '/p/x') → '/ar/p/x' and ('en', '/') → '/en'. */
export const localePath = (locale: string, path: string) => `/${locale}${path === '/' ? '' : path}`;

/** hreflang map for one page: every locale plus x-default (the default locale). */
export function languages(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of routing.locales) out[l] = localePath(l, path);
  out['x-default'] = localePath(routing.defaultLocale, path);
  return out;
}

/** Canonical URL + hreflang alternates for a public page. `path` has no locale prefix. */
export function alternates(locale: string, path: string): Metadata['alternates'] {
  return { canonical: localePath(locale, path), languages: languages(path) };
}

/** Paths no crawler should index: private panels, checkout, auth flows. */
export const PRIVATE_PATHS = ['/account', '/seller', '/admin', '/bag', '/checkout', '/login', '/register', '/verify', '/forgot', '/reset'];
