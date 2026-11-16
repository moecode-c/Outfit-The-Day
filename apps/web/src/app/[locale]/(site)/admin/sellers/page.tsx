'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { AnyStatus } from '@/components/shop/Status';
import { Input, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { date, tx } from '@/lib/format';

export default function AdminSellers() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const { data, loading } = useLoad<any[]>(() => api(`/admin/sellers?status=${status}&q=${encodeURIComponent(q)}`), [status, q]);
  return (
    <>
      <PageTitle>{t('sellers')}</PageTitle>
      <Tabs value={status} onChange={setStatus} options={[{ value: '', label: tc('all') }, ...['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].map((s) => ({ value: s, label: s }))]} />
      <Input className="mb-6 max-w-xs" placeholder={tc('search')} onKeyDown={(e) => e.key === 'Enter' && setQ((e.target as HTMLInputElement).value)} />
      {loading && !data ? <Loading /> : (
        <Table head={[t('sellers'), 'Owner', 'Contact', tc('date'), tc('status')]} empty={!data?.length}>
          {data?.map((s) => (
            <tr key={s._id}>
              <td><Link href={`/admin/sellers/${s._id}`} className="underline underline-offset-4">{tx(s.storeName, locale)}</Link></td>
              <td>{s.ownerName}</td>
              <td className="text-muted">{s.email}<br /><span dir="ltr">{s.phone}</span></td>
              <td className="text-muted">{date(s.createdAt, locale)}</td>
              <td><AnyStatus s={s.status} />{s.suspendedForOverdue && <span className="ms-2 text-xs text-danger">overdue</span>}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
