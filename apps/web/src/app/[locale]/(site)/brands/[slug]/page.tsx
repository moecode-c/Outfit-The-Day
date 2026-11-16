import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Filters, PageNav, SortSelect } from '@/components/shop/Filters';
import { ProductGrid } from '@/components/shop/ProductCard';
import { Reveal } from '@/components/Reveal';
import { Stars } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { tx } from '@/lib/format';
import { qs, sapi } from '@/lib/server';

type P = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { slug, locale } = await params;
  const d = await sapi<any>(`/brands/${slug}?facets=false&limit=1`, { revalidate: 60 });
  return d ? { title: tx(d.seller.storeName, locale), description: tx(d.seller.description, locale) } : {};
}

export default async function BrandPage({ params, searchParams }: { params: P; searchParams: Promise<Record<string, any>> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations();
  const d = await sapi<any>(`/brands/${slug}${qs({ ...sp, limit: 24 })}`, { revalidate: 15 });
  if (!d) notFound();
  const s = d.seller;
  return (
    <>
      <section className="relative h-[60svh] min-h-[420px] overflow-hidden bg-wash">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.banner && <img src={s.banner} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <Reveal className="absolute bottom-10 start-4 max-w-2xl text-white md:start-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo && <img src={s.logo} alt="" className="mb-6 h-16 w-16 rounded-full object-cover" />}
          <h1 className="font-display text-6xl md:text-8xl">{tx(s.storeName, locale)}</h1>
          <p className="mt-4 opacity-85">{tx(s.description, locale)}</p>
          {s.ratingCount > 0 && <p className="mt-3 flex items-center gap-2 text-sm"><Stars value={s.rating} /> {s.rating} ({s.ratingCount})</p>}
        </Reveal>
      </section>

      {d.looks?.length > 0 && (
        <section className="px-4 pt-16 md:px-10">
          <p className="label mb-6">{t('nav.looks')}</p>
          <div className="no-scrollbar flex gap-4 overflow-x-auto">
            {d.looks.map((l: any) => (
              <Link key={l._id} href={`/looks/${l._id}`} className="w-60 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.cover} alt="" className="aspect-[4/5] w-full object-cover" />
                <p className="mt-3 font-display text-xl">{tx(l.title, locale)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="px-4 pt-16 md:px-10">
        <div className="flex items-center justify-between border-y border-line py-4">
          <span className="label text-muted">{t('shop.results', { n: d.products.total })}</span>
          <div className="flex items-center gap-6">
            <span className="lg:hidden"><Filters facets={d.products.facets} hide={['seller']} /></span>
            <SortSelect />
          </div>
        </div>
        <div className="mt-10 grid gap-12 lg:grid-cols-[220px_1fr]">
          <div className="hidden lg:block"><div className="sticky top-32"><Filters facets={d.products.facets} hide={['seller']} /></div></div>
          <div>
            {d.products.items.length ? <ProductGrid items={d.products.items} cols={3} /> : <p className="py-24 text-center text-muted">{t('shop.noResults')}</p>}
            <PageNav page={d.products.page} pages={d.products.pages} />
          </div>
        </div>
        {tx(s.returnPolicy, locale) && (
          <div className="mt-24 max-w-2xl border-t border-line pt-8">
            <p className="label mb-3">{t('seller.returnPolicy')}</p>
            <p className="text-sm text-muted">{tx(s.returnPolicy, locale)}</p>
          </div>
        )}
      </div>
    </>
  );
}
