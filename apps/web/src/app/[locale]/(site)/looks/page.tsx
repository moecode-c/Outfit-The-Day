import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RevealImage } from '@/components/shop/Editorial';
import { Reveal } from '@/components/Reveal';
import { Link } from '@/i18n/routing';
import { tx } from '@/lib/format';
import { alternates } from '@/lib/seo';
import { sapi } from '@/lib/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return { title: t('looks'), description: t('looksSub'), alternates: alternates(locale, '/looks') };
}

export default async function LooksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const looks = (await sapi<any[]>('/looks?limit=24', { revalidate: 60 })) ?? [];
  return (
    <div className="px-4 pt-14 md:px-10">
      <Reveal>
        <h1 className="font-display text-6xl md:text-8xl"><em>{t('looks')}</em></h1>
        <p className="mt-6 max-w-md text-muted">{t('looksSub')}</p>
      </Reveal>
      <div className="mt-16 grid gap-x-6 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
        {looks.map((l, i) => (
          <Reveal key={l._id} delay={(i % 3) * 0.08} className={i % 3 === 1 ? 'lg:mt-24' : ''}>
            <Link href={`/looks/${l._id}`} className="group block">
              <RevealImage src={l.cover} ratio="aspect-[4/5]" />
              <p className="label mt-4 text-muted">{tx(l.seller?.storeName, locale)}</p>
              <p className="mt-1 font-display text-3xl">{tx(l.title, locale)}</p>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
