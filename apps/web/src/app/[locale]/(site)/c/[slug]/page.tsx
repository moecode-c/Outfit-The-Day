import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Listing } from '@/components/shop/Listing';
import { tx } from '@/lib/format';
import { alternates } from '@/lib/seo';
import { sapi } from '@/lib/server';

type P = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { slug, locale } = await params;
  const cats = (await sapi<any[]>('/categories', { revalidate: 300 })) ?? [];
  const c = cats.find((x) => x.slug === slug);
  return c ? { title: tx(c.name, locale), alternates: alternates(locale, `/c/${slug}`) } : {};
}

export default async function CategoryPage({ params, searchParams }: { params: P; searchParams: Promise<Record<string, any>> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('shop');
  const cats = (await sapi<any[]>('/categories', { revalidate: 300 })) ?? [];
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) notFound();
  const children = cats.filter((c) => c.parent === cat._id);
  const dep = typeof sp.department === 'string' ? sp.department.toUpperCase() : null;
  return (
    <Listing
      title={tx(cat.name, locale)}
      kicker={dep ? t(`department.${dep}` as 'department.WOMEN') : undefined}
      query={{ category: sp.category || slug }}
      sp={sp}
      categories={children.length ? children : undefined}
    />
  );
}
