'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus, PayStatus } from '@/components/shop/Status';
import { Input, Loading, Pager, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

const TABS = ['', 'AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED'];

export default function AdminOrders() {
  const t = useTranslations('admin');
  const to = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useLoad<any>(() => api(`/admin/orders?status=${status}&page=${page}&q=${encodeURIComponent(q)}`), [status, page, q]);
  return (
    <>
      <PageTitle>{t('orders')}</PageTitle>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={TABS.map((s) => ({ value: s, label: s ? to(`status.${s}` as any) : tc('all') }))} />
      <Input className="mb-6 max-w-xs" placeholder={`${tc('search')} #`} onKeyDown={(e) => e.key === 'Enter' && (setQ((e.target as HTMLInputElement).value), setPage(1))} />
      {loading && !data ? <Loading /> : (
        <>
          <Table head={['#', t('sellers'), t('customers'), tc('date'), tc('total'), to('payment'), tc('status')]} empty={!data?.items.length}>
            {data?.items.map((s: any) => (
              <tr key={s._id}>
                <td><Link href={`/admin/orders/${s._id}`} className="underline underline-offset-4">{s.number}</Link></td>
                <td>{tx(s.seller?.storeName, locale)}</td>
                <td>{s.customer?.name}<p className="text-xs text-muted">{s.customer?.email}</p></td>
                <td className="text-muted">{date(s.createdAt, locale)}</td>
                <td>{money(s.total, locale)}</td>
                <td><PayStatus s={s.paymentStatus} /></td>
                <td><OrderStatus s={s.status} /></td>
              </tr>
            ))}
          </Table>
          {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
      )}
    </>
  );
}
