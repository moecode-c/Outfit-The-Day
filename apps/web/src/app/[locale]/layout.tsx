import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Inter, Playfair_Display, IBM_Plex_Sans_Arabic, Noto_Naskh_Arabic } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { SmoothScroll } from '@/components/SmoothScroll';
import { Toaster } from '@/components/ui';
import { Providers } from '@/lib/store';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', style: ['normal', 'italic'] });
const plexAr = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600'], variable: '--font-plex-ar' });
const naskh = Noto_Naskh_Arabic({ subsets: ['arabic'], weight: ['400', '600'], variable: '--font-naskh' });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ar = locale === 'ar';
  return {
    metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
    title: { default: ar ? 'OTD — تأنّق ليومك' : 'OTD — Outfit The Day', template: '%s · OTD' },
    description: ar ? 'دور الأزياء المصرية المستقلة، في مكان واحد.' : 'Egypt’s independent fashion houses, curated in one place.',
    alternates: { languages: { en: '/en', ar: '/ar' } },
    openGraph: { siteName: 'OTD — Outfit The Day', locale: ar ? 'ar_EG' : 'en_EG', type: 'website' },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('otd-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme="light" suppressHydrationWarning className={`${inter.variable} ${playfair.variable} ${plexAr.variable} ${naskh.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>
            <SmoothScroll />
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
