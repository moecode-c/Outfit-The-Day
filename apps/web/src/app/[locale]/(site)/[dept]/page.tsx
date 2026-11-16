import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Listing } from '@/components/shop/Listing';
import { sapi } from '@/lib/server';

const DEPTS = { women: 'WOMEN', men: 'MEN', kids: 'KIDS' } as const;
type Sp = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ dept: string }> }): Promise<Metadata> {
  const { dept } = await params;
  const t = await getTranslations('nav');
  return { title: dept in DEPTS ? t(dept as 'women') : undefined };
}

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ locale: string; dept: string }>; searchParams: Sp }) {
  const { locale, dept } = await params;
  setRequestLocale(locale);
  if (!(dept in DEPTS)) notFound();
  const key = DEPTS[dept as keyof typeof DEPTS];
  const t = await getTranslations();
  const cats = ((await sapi<any[]>('/categories', { revalidate: 300 })) ?? []).filter((c) => c.departments.includes(key));
  return (
    <Listing
      title={t(`nav.${dept}` as 'nav.women')}
      kicker="OTD"
      query={{ department: dept }}
      sp={await searchParams}
      categories={cats}
    />
  );
}
