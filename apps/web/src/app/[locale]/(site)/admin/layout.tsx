'use client';
import { useTranslations } from 'next-intl';
import { PanelShell } from '@/components/shop/PanelShell';
import { useAuth } from '@/lib/store';

const NAV: [string, string, string][] = [
  ['/admin', 'dashboard', ''],
  ['/admin/sellers', 'sellers', 'sellers'],
  ['/admin/products', 'products', 'products'],
  ['/admin/reviews', 'reviews', 'products'],
  ['/admin/orders', 'orders', 'orders'],
  ['/admin/returns', 'returns', 'orders'],
  ['/admin/finance', 'finance', 'finance'],
  ['/admin/coupons', 'coupons', 'coupons'],
  ['/admin/categories', 'categories', 'catalog'],
  ['/admin/content', 'content', 'content'],
  ['/admin/shipping', 'shipping', 'settings'],
  ['/admin/users', 'users', 'users'],
  ['/admin/reports', 'reports', 'reports'],
  ['/admin/settings', 'settings', 'settings'],
  ['/admin/admins', 'admins', '*'],
  ['/admin/outbox', 'outbox', 'settings'],
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin');
  const { me } = useAuth();
  const perms = me?.adminPerms ?? [];
  const can = (p: string) => !p || perms.includes('*') || perms.includes(p);
  return (
    <PanelShell
      title={t('panel')}
      allow={(m) => m.role === 'ADMIN'}
      header={<p className="mt-2 text-sm text-muted">{me?.name}</p>}
      nav={NAV.filter(([, , p]) => can(p)).map(([href, k]) => ({ href, label: t(k as any), exact: href === '/admin' }))}
    >
      {children}
    </PanelShell>
  );
}
