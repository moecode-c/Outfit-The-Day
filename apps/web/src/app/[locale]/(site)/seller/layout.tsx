'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PanelShell } from '@/components/shop/PanelShell';
import { Link } from '@/i18n/routing';
import { tx } from '@/lib/format';
import { useAuth } from '@/lib/store';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('seller');
  const locale = useLocale();
  const { me } = useAuth();
  const s = me?.seller;
  return (
    <PanelShell
      title={t('hub')}
      allow={(m) => m.role === 'SELLER' && !!m.seller}
      header={
        s && (
          <div className="mt-2 text-sm text-muted">
            {tx(s.storeName, locale)}
            <Link href={`/brands/${s.slug}`} className="label mt-3 block text-ink underline underline-offset-4">{t('viewStore')} ↗</Link>
          </div>
        )
      }
      nav={[
        { href: '/seller', label: t('dashboard'), exact: true },
        { href: '/seller/products', label: t('products') },
        { href: '/seller/orders', label: t('orders') },
        { href: '/seller/returns', label: t('returns') },
        { href: '/seller/looks', label: t('looks') },
        { href: '/seller/size-guides', label: t('sizeGuides') },
        { href: '/seller/finance', label: t('finance') },
        { href: '/seller/store', label: t('store') },
      ]}
    >
      {s?.status === 'SUSPENDED' && (
        <div className="mb-8 border border-danger p-4 text-sm text-danger">{t('suspendedBanner', { reason: s.statusReason || '—' })}</div>
      )}
      {children}
    </PanelShell>
  );
}
