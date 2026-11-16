import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { LookShop } from '@/components/shop/LookShop';
import { Reveal } from '@/components/Reveal';
import { Link } from '@/i18n/routing';
import { tx } from '@/lib/format';
import { sapi } from '@/lib/server';

type P = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { id, locale } = await params;
  const l = await sapi<any>(`/looks/${id}`, { revalidate: 60 });
  return l ? { title: tx(l.title, locale), openGraph: { images: [l.cover] } } : {};
}

export default async function LookPage({ params }: { params: P }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const l = await sapi<any>(`/looks/${id}`, { revalidate: 30 });
  if (!l) notFound();
  return (
    <div className="grid gap-10 px-4 pt-8 md:px-10 lg:grid-cols-2 lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="aspect-[4/5] overflow-hidden bg-wash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.cover} alt="" className="h-full w-full object-cover" />
        </div>
      </div>
      <div>
        <Reveal>
          <Link href={`/brands/${l.seller?.slug}`} className="label text-muted">{tx(l.seller?.storeName, locale)}</Link>
          <h1 className="mt-3 font-display text-5xl md:text-7xl"><em>{tx(l.title, locale)}</em></h1>
          {tx(l.description, locale) && <p className="mt-5 text-muted">{tx(l.description, locale)}</p>}
        </Reveal>
        <LookShop products={l.products} />
      </div>
    </div>
  );
}
