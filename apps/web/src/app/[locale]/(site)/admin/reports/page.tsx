'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Field, Input, Loading, Select, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AdminReports() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [kind, setKind] = useState<'sales' | 'commission' | 'coupons' | 'returns'>('sales');
  const [by, setBy] = useState('seller');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const query = `from=${from}&to=${to}${kind === 'sales' ? `&by=${by}` : ''}`;
  const { data, loading } = useLoad<{ header: string[]; rows: any[][] }>(() => api(`/admin/reports/${kind}?${query}`), [kind, query]);
  return (
    <>
      <PageTitle
        actions={
          <div className="flex flex-wrap gap-3">
            <a href={`/api/admin/reports/${kind}?${query}&format=xlsx`} download className="label border border-ink px-4 py-2 hover:bg-ink hover:text-canvas self-center">{t('exportXlsx')} ↓</a>
            <a href={`/api/admin/reports/${kind}?${query}&format=csv`} download className="label border border-ink px-4 py-2 hover:bg-ink hover:text-canvas self-center">{t('exportCsv')} ↓</a>
          </div>
        }
      >
        {t('reports')}
      </PageTitle>
      <Tabs value={kind} onChange={setKind} options={(['sales', 'commission', 'coupons', 'returns'] as const).map((k) => ({ value: k, label: t(`report.${k}` as any) }))} />
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <Field label={tc('from')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={tc('to')}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {kind === 'sales' && (
          <Field label={t('groupBy')}>
            <Select value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="seller">{t('byBrand')}</option>
              <option value="category">{t('byCategory')}</option>
              <option value="day">{t('byDay')}</option>
            </Select>
          </Field>
        )}
      </div>
      {loading && !data ? <Loading /> : data && (
        <Table head={data.header} empty={!data.rows.length}>
          {data.rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} className={typeof c === 'number' ? 'tabular-nums' : ''}>{typeof c === 'number' ? c.toLocaleString('en-EG', { maximumFractionDigits: 2 }) : c}</td>)}</tr>)}
        </Table>
      )}
    </>
  );
}
