'use client';
import { useTranslations } from 'next-intl';
import { PanelShell, SignOut } from '@/components/shop/PanelShell';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/lib/store';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('account');
  const tn = useTranslations('nav');
  const { me } = useAuth();
  return (
    <PanelShell
      title={t('title')}
      header={
        <div className="mt-2 text-sm text-muted">
          {me && t('hello', { name: me.name.split(' ')[0] })}
          {me?.role === 'SELLER' && <Link href="/seller" className="label mt-4 block text-ink underline underline-offset-4">{tn('sellerHub')} →</Link>}
          {me?.role === 'ADMIN' && <Link href="/admin" className="label mt-4 block text-ink underline underline-offset-4">{tn('adminPanel')} →</Link>}
          <SignOut />
        </div>
      }
      nav={[
        { href: '/account/orders', label: t('orders') },
        { href: '/account/returns', label: t('returns') },
        { href: '/account/wishlist', label: t('wishlist') },
        { href: '/account/addresses', label: t('addresses') },
        { href: '/account/notifications', label: t('notifications') },
        { href: '/account/profile', label: t('profile') },
      ]}
    >
      {children}
    </PanelShell>
  );
}
