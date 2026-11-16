'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Section, Stat, Stats } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { money, tx } from '@/lib/format';

export default function AdminDashboard() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const { data: d, loading } = useLoad<any>(() => api('/admin/dashboard'), []);
  if (loading || !d) return <Loading />;
  const alerts: [string, number, string][] = [
    ['pendingSellers', d.alerts.pendingSellers, '/admin/sellers'],
    ['pendingProducts', d.alerts.pendingProducts, '/admin/products'],
    ['pendingPayments', d.alerts.pendingPayments, '/admin/finance'],
    ['overdueInvoices', d.alerts.overdueInvoices, '/admin/finance'],
    ['disputes', d.alerts.disputes, '/admin/returns'],
  ];
  return (
    <>
      <PageTitle>{t('dashboard')}</PageTitle>
      <Stats>
        <Stat label={t('totalSales')} value={money(d.totalSales, locale)} hint={`${d.orders} ${t('orders').toLowerCase()}`} />
        <Stat label={t('commissionGross')} value={money(d.commissionGross, locale)} hint={`${t('couponCost')}: ${money(d.couponCost, locale)}`} />
        <Stat label={t('commissionNet')} value={money(d.commissionEarned, locale)} />
        <Stat label={t('commissionUnpaid')} value={money(d.commissionUnpaid, locale)} />
      </Stats>
      <p className="mt-4 text-sm text-muted">{d.sellers} {t('sellers').toLowerCase()} · {d.customers} {t('customers').toLowerCase()}</p>

      <Section title={t('alerts')}>
        <div className="grid gap-px border border-line bg-line sm:grid-cols-5">
          {alerts.map(([k, n, href]) => (
            <Link key={k} href={href} className="bg-canvas p-5 transition-colors hover:bg-wash">
              <p className={`font-display text-3xl ${n ? '' : 'text-subtle'}`}>{n}</p>
              <p className="label mt-2 text-muted">{t(k as any)}</p>
            </Link>
          ))}
        </div>
      </Section>

      <div className="grid gap-x-12 lg:grid-cols-2">
        <Section title={t('topSellers')}>
          <ol className="space-y-3 text-sm">
            {d.topSellers.map((s: any, i: number) => (
              <li key={s._id} className="flex justify-between"><span><span className="me-3 text-muted">{i + 1}</span>{tx(s.name, locale)}</span><span>{money(s.total, locale)}</span></li>
            ))}
          </ol>
        </Section>
        <Section title={t('topProducts')}>
          <ol className="space-y-3 text-sm">
            {d.topProducts.map((p: any, i: number) => (
              <li key={p._id} className="flex justify-between"><Link href={`/p/${p.slug}`} className="hover:underline"><span className="me-3 text-muted">{i + 1}</span>{tx(p.title, locale)}</Link><span>{p.soldCount}</span></li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
