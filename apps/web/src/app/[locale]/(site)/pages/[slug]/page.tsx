import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { tx } from '@/lib/format';
import { sapi } from '@/lib/server';

type P = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { slug, locale } = await params;
  const p = await sapi<any>(`/pages/${slug}`, { revalidate: 300 });
  return p ? { title: tx(p.title, locale) } : {};
}

export default async function StaticPage({ params }: { params: P }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await sapi<any>(`/pages/${slug}`, { revalidate: 300 });
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-2xl px-4 pt-16">
      <h1 className="font-display text-5xl md:text-7xl">{tx(p.title, locale)}</h1>
      {/* Admin-authored HTML from the CMS. */}
      <div className="prose-otd mt-10 text-[15px] text-muted" dangerouslySetInnerHTML={{ __html: tx(p.body, locale) }} />
    </article>
  );
}
