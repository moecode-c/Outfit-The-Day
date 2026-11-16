'use client';
import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

export function LocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === 'en' ? 'ar' : 'en';
  return (
    <Link href={pathname} locale={other} className="label transition-opacity hover:opacity-60">
      {other === 'ar' ? 'العربية' : 'English'}
    </Link>
  );
}
