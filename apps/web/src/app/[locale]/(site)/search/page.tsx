import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Listing } from '@/components/shop/Listing';
import { sapi } from '@/lib/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('search'), robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, any>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('shop');
  const tn = await getTranslations('nav');
  const cats = ((await sapi<any[]>('/categories', { revalidate: 300 })) ?? []).filter((c) => !c.parent);
  const title = sp.q ? t('searchFor', { q: sp.q }) : sp.onSale ? tn('sale') : sp.sort === 'newest' ? tn('new') : t('searchTitle');
  return <Listing title={title} query={{}} sp={sp} categories={cats} />;
}
