import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import localFont from 'next/font/local';
import { routing } from '@/i18n/routing';
import { SmoothScroll } from '@/components/SmoothScroll';
import { Toaster } from '@/components/ui';
import { Providers } from '@/lib/store';
import '../globals.css';

// Fonts are bundled in src/fonts (Google Fonts files, OFL licence) so builds never depend on fonts.googleapis.com.
const inter = localFont({ src: '../../fonts/inter-latin-var.woff2', weight: '100 900', variable: '--font-inter', display: 'swap' });
const playfair = localFont({
  src: [
    { path: '../../fonts/playfair-latin-var.woff2', weight: '400 900', style: 'normal' },
    { path: '../../fonts/playfair-latin-italic-var.woff2', weight: '400 900', style: 'italic' },
  ],
  variable: '--font-playfair',
  display: 'swap',
});
const plexAr = localFont({
  src: [
    { path: '../../fonts/plex-arabic-400.woff2', weight: '400' },
    { path: '../../fonts/plex-arabic-500.woff2', weight: '500' },
    { path: '../../fonts/plex-arabic-600.woff2', weight: '600' },
  ],
  variable: '--font-plex-ar',
  display: 'swap',
});
const naskh = localFont({ src: '../../fonts/naskh-arabic-var.woff2', weight: '400 700', variable: '--font-naskh', display: 'swap' });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ar = locale === 'ar';
  return {
    metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
    title: { default: ar ? 'OTD — تأنّق ليومك' : 'OTD — Outfit The Day', template: '%s · OTD' },
    description: ar ? 'دور الأزياء المصرية المستقلة، في مكان واحد.' : 'Egypt’s independent fashion houses, curated in one place.',
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
