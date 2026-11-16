import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ParallaxHero, Rail, RevealImage } from '@/components/shop/Editorial';
import { ProductGrid } from '@/components/shop/ProductCard';
import { Reveal } from '@/components/Reveal';
import { Link } from '@/i18n/routing';
import { tx } from '@/lib/format';
import { sapi } from '@/lib/server';

export const revalidate = 30;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const data = await sapi<any>('/content/home', { revalidate: 30 });
  const hero = data?.banners?.find((b: any) => b.placement === 'HERO');
  const edits = (data?.banners ?? []).filter((b: any) => b.placement === 'EDIT');

  return (
    <>
      <ParallaxHero image={hero?.image}>
        <Reveal className="max-w-5xl">
          <p className="label mb-6 opacity-80">{tx(hero?.kicker, locale) || t('hero.kicker')}</p>
          <h1 className="font-display text-[17vw] leading-[0.88] tracking-tight md:text-[10vw]">
            <em>{tx(hero?.title, locale) || t('hero.title')}</em>
          </h1>
          <p className="mt-6 max-w-md text-lg opacity-85">{tx(hero?.subtitle, locale) || t('hero.subtitle')}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/women" className="label bg-white px-8 py-4 text-black transition-opacity hover:opacity-85">{t('home.ctaWomen')}</Link>
            <Link href="/men" className="label border border-white px-8 py-4 transition-colors hover:bg-white hover:text-black">{t('home.ctaMen')}</Link>
          </div>
        </Reveal>
      </ParallaxHero>

      {/* Departments triptych */}
      <section className="grid gap-2 px-2 pt-2 md:grid-cols-3">
        {[
          ['/women', t('nav.women'), 'dept-women'],
          ['/men', t('nav.men'), 'dept-men'],
          ['/kids', t('nav.kids'), 'dept-kids'],
        ].map(([href, label, seed], i) => (
          <Reveal key={href} delay={i * 0.08}>
            <Link href={href} className="group relative block">
              <RevealImage src={`https://picsum.photos/seed/${seed}/900/1200?grayscale`} ratio="aspect-[4/5]" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-white">
                <span className="font-display text-5xl">{label}</span>
                <span className="label translate-x-0 transition-transform duration-500 group-hover:translate-x-2 rtl:group-hover:-translate-x-2">→</span>
              </span>
            </Link>
          </Reveal>
        ))}
      </section>

      {/* New In rail */}
      {data?.newIn?.length > 0 && (
        <section className="pt-28">
          <SectionHead title={t('home.newIn')} href="/search?sort=newest" cta={t('common.viewAll')} />
          <Rail items={data.newIn} />
        </section>
      )}

      {/* The Edit */}
      {edits.length > 0 && (
        <section className="px-4 pt-32 md:px-10">
          <Reveal>
            <h2 className="mb-14 font-display text-6xl md:text-8xl">{t('home.theEdit')}</h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-12">
            {edits.slice(0, 3).map((b: any, i: number) => (
              <Reveal key={b._id} delay={i * 0.1} className={['md:col-span-7', 'md:col-span-5 md:mt-40', 'md:col-span-6 md:col-start-4 md:-mt-10'][i]}>
                <Link href={b.link || '/'} className="group block">
                  <RevealImage src={b.image} ratio={['aspect-[4/5]', 'aspect-[3/4]', 'aspect-[16/10]'][i]} />
                  <p className="mt-4 flex items-center justify-between">
                    <span className="font-display text-3xl">{tx(b.title, locale)}</span>
                    <span className="label transition-transform group-hover:translate-x-1">→</span>
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Complete the look */}
      {data?.looks?.length > 0 && (
        <section className="mt-32 bg-wash px-4 py-24 md:px-10">
          <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
            <Reveal>
              <h2 className="font-display text-5xl md:text-7xl"><em>{t('home.looks')}</em></h2>
              <p className="mt-4 max-w-md text-muted">{t('home.looksSub')}</p>
            </Reveal>
            <Link href="/looks" className="label underline underline-offset-8">{t('common.viewAll')}</Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {data.looks.slice(0, 3).map((l: any, i: number) => (
              <Reveal key={l._id} delay={i * 0.1}>
                <Link href={`/looks/${l._id}`} className="group block">
                  <RevealImage src={l.cover} ratio="aspect-[4/5]" />
                  <p className="label mt-4 text-muted">{tx(l.seller?.storeName, locale)}</p>
                  <p className="mt-1 font-display text-2xl">{tx(l.title, locale)}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Best sellers */}
      {data?.best?.length > 0 && (
        <section className="px-4 pt-32 md:px-10">
          <SectionHead title={t('home.bestSellers')} href="/search?sort=best" cta={t('common.viewAll')} inline />
          <ProductGrid items={data.best.slice(0, 8)} />
        </section>
      )}

      {/* Brands */}
      {data?.brands?.length > 0 && (
        <section className="pt-32">
          <SectionHead title={t('home.brands')} href="/brands" cta={t('common.viewAll')} />
          <div className="grid grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-3">
            {data.brands.slice(0, 6).map((b: any) => (
              <Link key={b._id} href={`/brands/${b.slug}`} className="group relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.banner && <img src={b.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100" />}
                <span className="relative font-display text-3xl transition-colors duration-500 group-hover:text-white md:text-4xl">{tx(b.storeName, locale)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sale */}
      {data?.sale?.length > 0 && (
        <section className="pt-32">
          <SectionHead title={t('home.onSale')} href="/search?onSale=true" cta={t('common.viewAll')} />
          <Rail items={data.sale} />
        </section>
      )}
    </>
  );
}

function SectionHead({ title, href, cta, inline }: { title: string; href: string; cta: string; inline?: boolean }) {
  return (
    <div className={`mb-10 flex items-end justify-between ${inline ? '' : 'px-4 md:px-10'}`}>
      <Reveal>
        <h2 className="font-display text-4xl md:text-6xl">{title}</h2>
      </Reveal>
      <Link href={href} className="label underline underline-offset-8">{cta}</Link>
    </div>
  );
}
