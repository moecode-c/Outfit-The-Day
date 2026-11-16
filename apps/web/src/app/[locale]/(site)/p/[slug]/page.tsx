import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProductGrid } from '@/components/shop/ProductCard';
import { ProductView } from '@/components/shop/ProductView';
import { Reveal } from '@/components/Reveal';
import { Stars } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { date, firstImage, tx } from '@/lib/format';
import { sapi } from '@/lib/server';

type P = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { slug, locale } = await params;
  const p = await sapi<any>(`/products/${slug}`, { revalidate: 30 });
  if (!p) return {};
  const title = `${tx(p.title, locale)} — ${tx(p.seller?.storeName, locale)}`;
  return { title, description: tx(p.description, locale).slice(0, 160), openGraph: { title, images: [firstImage(p)] } };
}

export default async function ProductPage({ params }: { params: P }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('product');
  // Auth-forwarded fetch so sellers/admins can preview pending products.
  const [p, config] = await Promise.all([sapi<any>(`/products/${slug}`, { auth: true }), sapi<any>('/content/config', { revalidate: 60 })]);
  if (!p) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: tx(p.title, locale),
    image: p.colors.flatMap((c: any) => c.images).slice(0, 6),
    description: tx(p.description, locale),
    brand: { '@type': 'Brand', name: tx(p.seller?.storeName, locale) },
    offers: { '@type': 'AggregateOffer', priceCurrency: 'EGP', lowPrice: p.effectivePrice / 100, availability: p.totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
    ...(p.ratingCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.ratingCount } } : {}),
  };

  return (
    <div className="px-4 pt-8 md:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {p.status !== 'LIVE' && <p className="mb-6 border border-ink bg-wash px-4 py-3 text-sm">{t('preview', { status: p.status })}</p>}
      <nav className="label mb-8 flex gap-2 text-muted">
        <Link href="/">OTD</Link>/<Link href={`/c/${p.category?.slug}`}>{tx(p.category?.name, locale)}</Link>
      </nav>
      <ProductView p={p} returnDays={config?.returnWindowDays ?? 14} />

      {/* Complete the look */}
      {p.looks?.length > 0 && (
        <section className="mt-32">
          <Reveal><h2 className="mb-10 font-display text-4xl md:text-6xl"><em>{t('completeLook')}</em></h2></Reveal>
          {p.looks.slice(0, 1).map((l: any) => (
            <div key={l._id} className="grid gap-8 lg:grid-cols-[1fr_2fr]">
              <Link href={`/looks/${l._id}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden bg-wash">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.cover} alt="" className="h-full w-full object-cover transition-transform duration-[1500ms] group-hover:scale-105" />
                </div>
                <p className="mt-4 font-display text-2xl">{tx(l.title, locale)}</p>
              </Link>
              <ProductGrid items={l.products.filter((x: any) => x && x._id !== p._id)} cols={3} />
            </div>
          ))}
        </section>
      )}

      {/* Reviews */}
      <section id="reviews" className="mt-32 grid gap-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="font-display text-4xl">{t('reviews')}</h2>
          {p.ratingCount > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <span className="font-display text-5xl">{p.rating}</span>
              <div><Stars value={p.rating} size={14} /><p className="text-xs text-muted">{p.ratingCount}</p></div>
            </div>
          )}
        </div>
        <div className="divide-y divide-line border-y border-line">
          {p.reviews?.length ? (
            p.reviews.map((r: any) => (
              <div key={r._id} className="py-6">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} />
                  <span className="text-xs text-muted">{date(r.createdAt, locale)}</span>
                </div>
                {r.text && <p className="mt-3 leading-relaxed">{r.text}</p>}
                <p className="label mt-3 text-muted">{r.user?.name?.split(' ')[0]}</p>
              </div>
            ))
          ) : (
            <p className="py-8 text-muted">{t('noReviews')}</p>
          )}
        </div>
      </section>

      {p.related?.length > 0 && (
        <section className="mt-32">
          <h2 className="mb-10 font-display text-4xl md:text-5xl">{t('related')}</h2>
          <ProductGrid items={p.related.slice(0, 4)} />
        </section>
      )}
    </div>
  );
}
