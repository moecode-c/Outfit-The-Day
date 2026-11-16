'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { ReturnStatus } from '@/components/shop/Status';
import { Button, Check, Empty, ErrorText, Field, FileInput, Loading, Modal, ReasonDialog, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { date, tx } from '@/lib/format';

export default function SellerReturns() {
  const t = useTranslations('seller');
  const tr = useTranslations('returns');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useLoad<any[]>(() => api(`/seller/returns?status=${status}`), [status]);
  const [rejecting, setRejecting] = useState<any>(null);
  const [receiving, setReceiving] = useState<any>(null);
  const [refunding, setRefunding] = useState<any>(null);
  const act = useAction();
  const go = (r: any, action: string, body: any = {}) => act.run(async () => { await post(`/seller/returns/${r._id}/${action}`, body); setRejecting(null); setReceiving(null); setRefunding(null); reload(); });

  return (
    <>
      <PageTitle>{t('returns')}</PageTitle>
      <Tabs value={status} onChange={setStatus} options={['', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED'].map((s) => ({ value: s, label: s ? tr(`status.${s}` as any) : tc('all') }))} />
      <ErrorText error={act.error} />
      {loading && !data ? <Loading /> : !data?.length ? <Empty>{tc('empty')}</Empty> : (
        <div className="space-y-6">
          {data.map((r) => {
            const items = r.items.map((ri: any) => ({ ...r.subOrder?.items?.find((i: any) => String(i._id) === String(ri.item)), qty: ri.qty }));
            return (
              <div key={r._id} className="border border-line p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label">{r.number} · <Link href={`/seller/orders/${r.subOrder?._id}`} className="underline">{r.subOrder?.number}</Link></p>
                    <p className="mt-1 text-sm text-muted">{r.customer?.name} · {date(r.createdAt, locale)} · {tr(`reasons.${r.reason}` as any)}</p>
                  </div>
                  <div className="flex items-center gap-2">{r.flagged && <span className="label text-danger">!</span>}<ReturnStatus s={r.status} /></div>
                </div>
                {r.details && <p className="mt-4 text-sm">“{r.details}”</p>}
                <div className="mt-4 flex flex-wrap gap-4">
                  {items.map((i: any, k: number) => (
                    <div key={k} className="flex items-center gap-3 text-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {i.image && <img src={i.image} alt="" className="h-14 w-10 object-cover" />}
                      <span>{tx(i.title, locale)} · {i.size} ×{i.qty}</span>
                    </div>
                  ))}
                </div>
                {!!r.photos?.length && (
                  <div className="mt-4 flex gap-2">
                    {r.photos.map((p: string) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="h-20 w-20 border border-line object-cover" /></a>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-xs text-muted">{r.returnShippingPaidBy === 'SELLER' ? tr('shippingSeller') : tr('shippingCustomer')}{r.status === 'REQUESTED' && r.sellerDeadline && ` · ${t('deadline', { date: date(r.sellerDeadline, locale, true) })}`}</p>
                {r.adminNote && <p className="mt-2 text-sm italic">OTD: {r.adminNote}</p>}
                <div className="mt-5 flex flex-wrap gap-3">
                  {r.status === 'REQUESTED' && <>
                    <Button size="sm" loading={act.busy} onClick={() => go(r, 'approve')}>{t('approve')}</Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(r)}>{tc('reject')}</Button>
                  </>}
                  {r.status === 'APPROVED' && <Button size="sm" onClick={() => setReceiving(r)}>{t('markReceived')}</Button>}
                  {r.status === 'RECEIVED' && <Button size="sm" onClick={() => setRefunding(r)}>{t('markRefunded')}</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ReasonDialog open={!!rejecting} title={tc('reject')} onClose={() => setRejecting(null)} busy={act.busy} error={act.error} onSubmit={(reason) => go(rejecting, 'reject', { reason })} />
      {receiving && <ReceiveModal onClose={() => setReceiving(null)} onSubmit={(restock) => go(receiving, 'received', { restock })} busy={act.busy} />}
      {refunding && <RefundModal onClose={() => setRefunding(null)} onSubmit={(refundProof) => go(refunding, 'refunded', { refundProof: refundProof || undefined })} busy={act.busy} />}
    </>
  );
}

function ReceiveModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (restock: boolean) => void; busy: boolean }) {
  const t = useTranslations('seller');
  const [restock, setRestock] = useState(true);
  return (
    <Modal open onClose={onClose} title={t('markReceived')}>
      <Check label={t('restock')} checked={restock} onChange={setRestock} />
      <Button className="mt-6" loading={busy} onClick={() => onSubmit(restock)}>{t('markReceived')}</Button>
    </Modal>
  );
}

function RefundModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (proof: string) => void; busy: boolean }) {
  const t = useTranslations('seller');
  const [proof, setProof] = useState('');
  return (
    <Modal open onClose={onClose} title={t('markRefunded')}>
      <Field label={t('refundProof')}><FileInput value={proof} onChange={setProof} /></Field>
      <Button className="mt-6" loading={busy} onClick={() => onSubmit(proof)}>{t('markRefunded')}</Button>
    </Modal>
  );
}
