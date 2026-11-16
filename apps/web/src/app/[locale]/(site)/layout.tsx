import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { VerifyBanner } from '@/components/shop/VerifyBanner';
import { Link } from '@/i18n/routing';
import { sapi } from '@/lib/server';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [config, categories, t] = await Promise.all([
    sapi<any>('/content/config', { revalidate: 60 }),
    sapi<any[]>('/categories', { revalidate: 300 }),
    getTranslations(),
  ]);
  const ticker = config?.ticker ?? { en: [], ar: [] };

  return (
    <>
      <SiteHeader ticker={ticker} categories={categories ?? []} />
      <VerifyBanner />
      <main className="min-h-[60vh]">{children}</main>
      <footer className="mt-32 border-t border-line">
        <div className="grid gap-12 px-4 py-16 md:grid-cols-12 md:px-10">
          <div className="md:col-span-5">
            <p className="font-display text-6xl leading-none md:text-8xl">OTD</p>
            <p className="mt-6 max-w-sm text-muted">{t('footer.tagline')}</p>
            <p className="label mt-8 text-muted">{t('footer.payments')}</p>
          </div>
          <FooterCol title={t('footer.shop')} links={[['/women', t('nav.women')], ['/men', t('nav.men')], ['/kids', t('nav.kids')], ['/brands', t('nav.brands')], ['/looks', t('nav.looks')], ['/search?onSale=true', t('nav.sale')]]} />
          <FooterCol title={t('footer.help')} links={[['/pages/faq', t('footer.faq')], ['/pages/returns', t('footer.returns')], ['/pages/contact', t('footer.contact')], ['/account/orders', t('account.orders')]]} />
          <FooterCol title={t('footer.company')} links={[['/pages/about', t('footer.about')], ['/sell', t('nav.sell')], ['/pages/terms', t('footer.terms')], ['/pages/privacy', t('footer.privacy')], ['/pages/seller-agreement', t('footer.sellerAgreement')]]} />
        </div>
        <div className="border-t border-line px-4 py-6 md:px-10">
          <p className="label text-muted">{t('footer.rights')}</p>
        </div>
      </footer>
    </>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="md:col-span-2">
      <p className="label mb-5">{title}</p>
      <ul className="space-y-3">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-muted transition-colors hover:text-ink">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
