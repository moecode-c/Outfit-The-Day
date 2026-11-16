import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { languages, localePath, SITE_URL } from '@/lib/seo';
import { sapi } from '@/lib/server';

// Rebuilt at most once an hour.
export const revalidate = 3600;

type Entry = { slug?: string; _id: string; updatedAt?: string };
type Source = { products: Entry[]; brands: Entry[]; categories: Entry[]; looks: Entry[]; pages: Entry[] };

const abs = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, SITE_URL + v]));

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const src = await sapi<Source>('/content/sitemap', { revalidate });
  const out: MetadataRoute.Sitemap = [];

  // One <url> per locale, each listing every language version (hreflang).
  const add = (path: string, opts: { lastModified?: string; changeFrequency?: 'daily' | 'weekly' | 'monthly'; priority?: number } = {}) => {
    const alternates = { languages: abs(languages(path)) };
    for (const l of routing.locales) out.push({ url: SITE_URL + localePath(l, path), alternates, ...opts });
  };

  add('/', { changeFrequency: 'daily', priority: 1 });
  for (const d of ['women', 'men', 'kids']) add(`/${d}`, { changeFrequency: 'daily', priority: 0.9 });
  add('/brands', { changeFrequency: 'weekly', priority: 0.7 });
  add('/looks', { changeFrequency: 'weekly', priority: 0.7 });
  add('/sell', { changeFrequency: 'monthly', priority: 0.3 });

  if (src) {
    for (const c of src.categories) add(`/c/${c.slug}`, { lastModified: c.updatedAt, changeFrequency: 'daily', priority: 0.8 });
    for (const b of src.brands) add(`/brands/${b.slug}`, { lastModified: b.updatedAt, changeFrequency: 'weekly', priority: 0.7 });
    for (const p of src.products) add(`/p/${p.slug}`, { lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.8 });
    for (const l of src.looks) add(`/looks/${l._id}`, { lastModified: l.updatedAt, changeFrequency: 'monthly', priority: 0.5 });
    for (const p of src.pages) add(`/pages/${p.slug}`, { lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.3 });
  }
  return out;
}
