import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { alternates } from '@/lib/seo';

// The sell page is a client component, so its metadata lives here.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('sell'), alternates: alternates(locale, '/sell') };
}

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
