'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus, PayStatus } from '@/components/shop/Status';
import { Input, Loading, Pager, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';

const ORDER_TABS = ['', 'AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'CANCELLED'];

export default function SellerOrders() {
  const t = useTranslations('seller');
  const to = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useLoad<any>(() => api(`/seller/orders?page=${page}&status=${status}&q=${encodeURIComponent(q)}`), [page, status, q]);
  return (
    <>
      <PageTitle>{t('orders')}</PageTitle>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={ORDER_TABS.map((s) => ({ value: s, label: s ? to(`status.${s}` as any) : tc('all') }))} />
      <Input className="mb-6 max-w-xs" placeholder={`${tc('search')} #`} onKeyDown={(e) => e.key === 'Enter' && (setQ((e.target as HTMLInputElement).value), setPage(1))} />
      {loading && !data ? <Loading /> : (
        <>
          <Table head={['#', t('customer'), tc('date'), to('items'), tc('total'), to('payment'), tc('status')]} empty={!data?.items.length}>
            {data?.items.map((s: any) => (
              <tr key={s._id}>
                <td><Link href={`/seller/orders/${s._id}`} className="underline underline-offset-4">{s.number}</Link></td>
                <td>{s.customer?.name}<p className="text-xs text-muted" dir="ltr">{s.customer?.phone}</p></td>
                <td className="text-muted">{date(s.createdAt, locale, true)}</td>
                <td>{s.items.reduce((n: number, i: any) => n + i.qty, 0)}</td>
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
