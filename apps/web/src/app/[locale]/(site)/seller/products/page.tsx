'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { egpInput, fromEgp, Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { ProductStatus } from '@/components/shop/Status';
import { Button, Input, Loading, Modal, Pager, toast, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, del, patch } from '@/lib/api';
import { firstImage, money, tx } from '@/lib/format';

export default function SellerProducts() {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [stockFor, setStockFor] = useState<any>(null);
  const { data, loading, reload } = useLoad<any>(() => api(`/seller/products?page=${page}&status=${status}&q=${encodeURIComponent(q)}`), [page, status, q]);

  return (
    <>
      <PageTitle actions={<Link href="/seller/products/new"><Button size="sm">{t('newProduct')}</Button></Link>}>{t('products')}</PageTitle>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: tc('all') }, ...['LIVE', 'PENDING', 'DRAFT', 'REJECTED', 'HIDDEN'].map((s) => ({ value: s, label: t(`productStatus.${s}` as any) }))]} />
      <Input className="mb-6 max-w-xs" placeholder={tc('search')} defaultValue={q} onKeyDown={(e) => e.key === 'Enter' && (setQ((e.target as HTMLInputElement).value), setPage(1))} />
      {loading && !data ? <Loading /> : (
        <>
          <Table head={['', t('title'), t('basePrice'), t('stock'), tc('status'), '']} empty={!data?.items.length}>
            {data?.items.filter((p: any) => p.statusReason !== 'DELETED').map((p: any) => (
              <tr key={p._id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <td className="w-14"><img src={firstImage(p)} alt="" className="h-14 w-10 object-cover" /></td>
                <td><Link href={`/seller/products/${p._id}`} className="hover:underline">{tx(p.title, locale)}</Link>{p.status === 'REJECTED' && <p className="text-xs text-danger">{p.statusReason}</p>}</td>
                <td>{money(p.effectivePrice ?? p.price, locale)}{p.onSale && <span className="ms-2 text-xs text-muted line-through">{money(p.price, locale)}</span>}</td>
                <td className={p.totalStock === 0 ? 'text-danger' : ''}>{p.totalStock}</td>
                <td><ProductStatus s={p.status} /></td>
                <td className="whitespace-nowrap text-end">
                  <button className="label me-4 underline underline-offset-4" onClick={() => setStockFor(p)}>{t('quickStock')}</button>
                  <button className="label text-muted underline underline-offset-4" onClick={async () => { if (confirm(`${tc('delete')}?`)) { await del(`/seller/products/${p._id}`); reload(); } }}>{tc('delete')}</button>
                </td>
              </tr>
            ))}
          </Table>
          {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
      )}
      {stockFor && <QuickStock p={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); reload(); }} />}
    </>
  );
}

function QuickStock({ p, onClose, onSaved }: { p: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [price, setPrice] = useState(egpInput(p.price));
  const [rows, setRows] = useState(p.variants.map((v: any) => ({ id: v._id, stock: v.stock, size: v.size, color: p.colors.find((c: any) => c._id === v.color) })));
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('quickStock')}>
      <p className="mb-6 text-sm">{tx(p.title, locale)}</p>
      <label className="label mb-2 block">{t('basePrice')}</label>
      <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="mt-6 max-h-80 space-y-2 overflow-y-auto">
        {rows.map((r: any, i: number) => (
          <div key={r.id} className="flex items-center gap-3 text-sm">
            <span className="h-4 w-4 border border-line" style={{ background: r.color?.hex }} />
            <span className="flex-1">{tx(r.color?.name, locale)} · {r.size}</span>
            <Input type="number" min={0} className="w-24" value={r.stock} onChange={(e) => setRows(rows.map((x: any, k: number) => (k === i ? { ...x, stock: Number(e.target.value) } : x)))} />
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{String(error)}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
        <Button loading={busy} onClick={() => run(async () => { await patch(`/seller/products/${p._id}/stock`, { price: fromEgp(price) ?? undefined, variants: rows.map((r: any) => ({ id: r.id, stock: r.stock })) }); toast(tc('done')); onSaved(); })}>{tc('save')}</Button>
      </div>
    </Modal>
  );
}
