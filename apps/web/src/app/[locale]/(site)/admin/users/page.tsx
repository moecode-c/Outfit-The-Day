'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Input, Loading, Pager, toast, useLoad } from '@/components/ui';
import { api, post } from '@/lib/api';
import { date } from '@/lib/format';

export default function AdminUsers() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [role, setRole] = useState('CUSTOMER');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useLoad<any>(() => api(`/admin/users?role=${role}&page=${page}&q=${encodeURIComponent(q)}`), [role, page, q]);
  const act = async (u: any, body: any) => { try { await post(`/admin/users/${u._id}/block`, body); toast(tc('done')); reload(); } catch (e: any) { alert(e.message); } };
  return (
    <>
      <PageTitle>{t('users')}</PageTitle>
      <Tabs value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[{ value: 'CUSTOMER', label: t('customers') }, { value: 'SELLER', label: t('sellers') }, { value: 'ADMIN', label: t('admins') }, { value: '', label: tc('all') }]} />
      <Input className="mb-6 max-w-xs" placeholder={tc('search')} onKeyDown={(e) => e.key === 'Enter' && (setQ((e.target as HTMLInputElement).value), setPage(1))} />
      {loading && !data ? <Loading /> : (
        <>
          <Table head={['Name', 'Email', 'Phone', tc('date'), 'COD ✕', tc('status'), '']} empty={!data?.items.length}>
            {data?.items.map((u: any) => (
              <tr key={u._id}>
                <td>{u.name}<p className="text-xs text-muted">{u.role}</p></td>
                <td>{u.email}{u.emailVerifiedAt && <span className="ms-1 text-xs">✓</span>}</td>
                <td dir="ltr">{u.phone}</td>
                <td className="text-muted">{date(u.createdAt, locale)}</td>
                <td>{u.codFailures ?? 0}</td>
                <td>{u.blockedAt ? <Badge tone="danger">blocked</Badge> : <Badge tone="muted">ok</Badge>}</td>
                <td className="whitespace-nowrap text-end">
                  {!!u.codFailures && <button className="label me-4 underline" onClick={() => act(u, { blocked: !!u.blockedAt, resetCod: true })}>{t('resetCod')}</button>}
                  <button className="label underline" onClick={() => confirm(`${u.blockedAt ? t('unblock') : t('block')} ${u.name}?`) && act(u, { blocked: !u.blockedAt })}>{u.blockedAt ? t('unblock') : t('block')}</button>
                </td>
              </tr>
            ))}
          </Table>
          {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
      )}
    </>
  );
}
