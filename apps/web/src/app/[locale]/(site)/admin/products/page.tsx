'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { ProductStatus } from '@/components/shop/Status';
import { Button, Input, Loading, Pager, ReasonDialog, useAction, useLoad } from '@/components/ui';
import { api, post } from '@/lib/api';
import { firstImage, money, tx } from '@/lib/format';

export default function AdminProducts() {
  const t = useTranslations('admin');
  const ts = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<any>(null);
  const { data, loading, reload } = useLoad<any>(() => api(`/admin/products?status=${status}&page=${page}&q=${encodeURIComponent(q)}`), [status, page, q]);
  const act = useAction();
  const go = (p: any, action: string, body: any = {}) => act.run(async () => { await post(`/admin/products/${p._id}/${action}`, body); setRejecting(null); reload(); });
  return (
    <>
      <PageTitle>{t('products')}</PageTitle>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[...['PENDING', 'LIVE', 'REJECTED', 'HIDDEN', 'DRAFT'].map((s) => ({ value: s, label: ts(`productStatus.${s}` as any) })), { value: '', label: tc('all') }]} />
      <Input className="mb-6 max-w-xs" placeholder={tc('search')} onKeyDown={(e) => e.key === 'Enter' && (setQ((e.target as HTMLInputElement).value), setPage(1))} />
      {loading && !data ? <Loading /> : (
        <>
          <Table head={['', ts('title'), t('sellers'), ts('category'), ts('basePrice'), tc('status'), '']} empty={!data?.items.length}>
            {data?.items.map((p: any) => (
              <tr key={p._id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <td className="w-14"><img src={firstImage(p)} alt="" className="h-14 w-10 object-cover" /></td>
                <td><a href={`/${locale}/p/${p.slug}`} target="_blank" rel="noreferrer" className="hover:underline">{tx(p.title, locale)} ↗</a><p className="text-xs text-muted">{p.colors.length} colours · {p.variants.length} variants · {p.colors.reduce((n: number, c: any) => n + c.images.length, 0)} photos</p></td>
                <td>{tx(p.seller?.storeName, locale)}</td>
                <td className="text-muted">{tx(p.category?.name, locale)}</td>
                <td>{money(p.effectivePrice ?? p.price, locale)}</td>
                <td><ProductStatus s={p.status} />{p.statusReason && p.statusReason !== 'ADMIN' && <p className="text-xs text-muted">{p.statusReason}</p>}</td>
                <td className="whitespace-nowrap text-end">
                  <div className="flex justify-end gap-2">
                    {['PENDING', 'REJECTED'].includes(p.status) && <Button size="sm" loading={act.busy} onClick={() => go(p, 'approve')}>{t('approve')}</Button>}
                    {p.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => setRejecting(p)}>{t('reject')}</Button>}
                    {p.status === 'LIVE' && <Button size="sm" variant="outline" onClick={() => go(p, 'hide')}>{t('hide')}</Button>}
                    {p.status === 'HIDDEN' && p.statusReason === 'ADMIN' && <Button size="sm" variant="outline" onClick={() => go(p, 'unhide')}>{t('unhide')}</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
      )}
      <ReasonDialog open={!!rejecting} title={t('reject')} onClose={() => setRejecting(null)} busy={act.busy} error={act.error} onSubmit={(reason) => go(rejecting, 'reject', { reason })} />
    </>
  );
}
