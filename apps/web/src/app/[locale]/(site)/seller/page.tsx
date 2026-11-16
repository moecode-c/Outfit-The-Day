'use client';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart, Section, Stat, Stats, Table } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus } from '@/components/shop/Status';
import { Button, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';

export default function SellerDashboard() {
  const t = useTranslations('seller');
  const locale = useLocale();
  const { data: d, loading } = useLoad<any>(() => api('/seller/dashboard'), []);
  if (loading || !d) return <Loading />;
  const L = (p: string) => `/${locale}${p}`;
  return (
    <>
      <PageTitle actions={<Link href="/seller/products/new"><Button size="sm">{t('newProduct')}</Button></Link>}>{t('dashboard')}</PageTitle>
      <Stats>
        <Stat label={t('today')} value={money(d.today.t, locale)} hint={`${d.today.n} ${t('orders').toLowerCase()}`} />
        <Stat label={t('thisMonth')} value={money(d.month.t, locale)} hint={`${d.month.n} ${t('orders').toLowerCase()}`} />
        <Stat label={t('commissionDue')} value={money(Math.max(0, d.commissionDue), locale)} href={L('/seller/finance')} />
        <Stat label={t('pendingProducts')} value={d.pendingProducts} href={L('/seller/products')} />
        <Stat label={t('newOrders')} value={d.newOrders} href={L('/seller/orders')} />
        <Stat label={t('toShip')} value={d.toShip} href={L('/seller/orders')} />
        <Stat label={t('proofs')} value={d.proofs} href={L('/seller/orders')} />
        <Stat label={t('pendingReturns')} value={d.pendingReturns} href={L('/seller/returns')} />
      </Stats>
      <Section title={t('last30')}><BarChart data={d.chart} /></Section>
      <Section title={t('recentOrders')} actions={<Link href="/seller/orders" className="label underline underline-offset-4">→</Link>}>
        <Table head={['#', t('customer'), 'Date', 'Total', 'Status']} empty={!d.recent.length}>
          {d.recent.map((s: any) => (
            <tr key={s._id}>
              <td><Link href={`/seller/orders/${s._id}`} className="underline underline-offset-4">{s.number}</Link></td>
              <td>{s.customer?.name}</td>
              <td className="text-muted">{date(s.createdAt, locale)}</td>
              <td>{money(s.total, locale)}</td>
              <td><OrderStatus s={s.status} /></td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
