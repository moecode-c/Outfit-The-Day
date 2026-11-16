import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Reveal } from '@/components/Reveal';
import { Link } from '@/i18n/routing';
import { tx } from '@/lib/format';
import { alternates } from '@/lib/seo';
import { sapi } from '@/lib/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('brands'), alternates: alternates(locale, '/brands') };
}

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('nav');
  const brands = (await sapi<any[]>('/brands', { revalidate: 60 })) ?? [];
  const groups: Record<string, any[]> = {};
  for (const b of brands) {
    const k = (tx(b.storeName, locale)[0] ?? '#').toUpperCase();
    (groups[k] ??= []).push(b);
  }
  return (
    <div className="px-4 pt-14 md:px-10">
      <Reveal><h1 className="font-display text-6xl md:text-8xl">{t('brands')}</h1></Reveal>
      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {brands.slice(0, 3).map((b) => (
          <Link key={b._id} href={`/brands/${b.slug}`} className="group block">
            <div className="relative aspect-[4/5] overflow-hidden bg-wash">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.banner && <img src={b.banner} alt="" className="h-full w-full object-cover transition-transform duration-[1500ms] group-hover:scale-105" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <p className="absolute bottom-6 start-6 font-display text-4xl text-white">{tx(b.storeName, locale)}</p>
            </div>
            <p className="mt-4 text-sm text-muted">{tx(b.description, locale)}</p>
          </Link>
        ))}
      </div>
      <div className="mt-24 columns-1 gap-12 sm:columns-2 lg:columns-4">
        {Object.keys(groups).sort().map((k) => (
          <div key={k} className="mb-10 break-inside-avoid">
            <p className="font-display text-4xl">{k}</p>
            <ul className="mt-4 space-y-2">
              {groups[k].map((b) => (
                <li key={b._id}><Link href={`/brands/${b.slug}`} className="text-muted transition-colors hover:text-ink">{tx(b.storeName, locale)}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
