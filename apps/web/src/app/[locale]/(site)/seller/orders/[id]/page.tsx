'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Section } from '@/components/panel';
import { AddressText } from '@/components/shop/AddressForm';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus, PayStatus, Progress } from '@/components/shop/Status';
import { Button, ErrorText, Field, Input, Loading, Modal, ReasonDialog, useAction, useLoad } from '@/components/ui';
import { api, post } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

const NEXT: Record<string, string> = { PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' };

export default function SellerOrder() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('seller');
  const to = useTranslations('orders');
  const locale = useLocale();
  const { data: s, loading, reload } = useLoad<any>(() => api(`/seller/orders/${id}`), [id]);
  const [dialog, setDialog] = useState<'' | 'cancel' | 'failed' | 'reject' | 'ship'>('');
  const act = useAction();
  if (loading && !s) return <Loading />;
  if (!s) return null;

  const next = NEXT[s.status];
  const label: Record<string, string> = { CONFIRMED: t('confirmOrder'), PROCESSING: t('markProcessing'), SHIPPED: t('markShipped'), DELIVERED: t('markDelivered') };
  const proof = s.proofs?.[s.proofs.length - 1];
  const close = () => setDialog('');
  const advance = (body: any) => act.run(async () => { await post(`/seller/orders/${id}/status`, body); close(); reload(); });

  return (
    <>
      <PageTitle actions={<Button size="sm" variant="outline" onClick={() => window.print()}>{t('packingSlip')}</Button>}>{s.number}</PageTitle>
      <div className="no-print -mt-6 mb-8 flex flex-wrap items-center gap-3 text-sm text-muted">
        {date(s.createdAt, locale, true)} · {to(`method.${s.paymentMethod}` as any)} <PayStatus s={s.paymentStatus} /> <OrderStatus s={s.status} />
      </div>
      <div className="no-print mb-10"><Progress status={s.status} /></div>

      {s.paymentStatus === 'PROOF_SUBMITTED' && proof && (
        <div className="no-print mb-10 border border-ink p-6">
          <p className="font-display text-2xl">{t('confirmPayment')}</p>
          <p className="mt-2 text-sm text-muted">{t('checkInstapay', { amount: money(s.total, locale), ref: proof.referenceNo })}</p>
          <a href={proof.file} target="_blank" rel="noreferrer" className="mt-4 block w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof.file} alt="proof" className="max-h-80 border border-line" />
          </a>
          <div className="mt-6 flex gap-3">
            <Button loading={act.busy} onClick={() => act.run(async () => { await post(`/seller/orders/${id}/payment/confirm`); reload(); })}>{t('confirmPayment')}</Button>
            <Button variant="outline" onClick={() => setDialog('reject')}>{t('rejectPayment')}</Button>
          </div>
        </div>
      )}

      <div className="no-print mb-10 flex flex-wrap gap-3">
        {next && s.status !== 'AWAITING_PAYMENT' && (
          <Button loading={act.busy} onClick={() => (next === 'SHIPPED' ? setDialog('ship') : advance({ status: next }))}>{label[next]}</Button>
        )}
        {s.status === 'SHIPPED' && <Button variant="outline" onClick={() => setDialog('failed')}>{t('failedDelivery')}</Button>}
        {['AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING'].includes(s.status) && <Button variant="ghost" onClick={() => setDialog('cancel')}>{t('cancelOrder')}</Button>}
      </div>
      <ErrorText error={act.error} />

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="divide-y divide-line border-y border-line">
            {s.items.map((i: any) => (
              <div key={i._id} className="flex gap-4 py-4 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.image} alt="" className="h-20 w-14 object-cover" />
                <div className="flex-1">
                  <p>{tx(i.title, locale)}</p>
                  <p className="text-muted">{tx(i.colorName, locale)} · {i.size} · SKU {i.sku}</p>
                  {i.returnedQty > 0 && <p className="text-xs text-muted">↩ {i.returnedQty}</p>}
                </div>
                <p>×{i.qty}</p>
                <p className="w-24 text-end">{money(i.lineTotal, locale)}</p>
              </div>
            ))}
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt>{to('subtotal')}</dt><dd>{money(s.itemsTotal, locale)}</dd></div>
            <div className="flex justify-between"><dt>{to('shipping')}</dt><dd>{money(s.shippingFee, locale)}</dd></div>
            {s.couponShare > 0 && <div className="flex justify-between text-muted"><dt>{to('coupon')} (OTD)</dt><dd>−{money(s.couponShare, locale)}</dd></div>}
            <div className="flex justify-between border-t border-ink pt-2 font-medium"><dt>{s.paymentMethod === 'COD' ? to('method.COD') : to('total')}</dt><dd>{money(s.total, locale)}</dd></div>
          </dl>
          <Section title={to('history')}>
            <ul className="space-y-2 text-sm">
              {[...s.events].reverse().map((e: any, k: number) => (
                <li key={k} className="flex gap-4"><span className="w-40 shrink-0 text-muted">{date(e.at, locale, true)}</span><span>{to.has(`status.${e.status}` as any) ? to(`status.${e.status}` as any) : e.status}{e.note && <span className="text-muted"> — {e.note}</span>}</span></li>
              ))}
            </ul>
          </Section>
        </div>
        <aside className="space-y-6">
          <div className="border border-line p-5 text-sm">
            <p className="label mb-3">{t('customer')}</p>
            <p>{s.customer?.name}</p>
            <p className="text-muted" dir="ltr">{s.customer?.phone}</p>
            <p className="text-muted">{s.customer?.email}</p>
          </div>
          <div className="border border-line p-5"><p className="label mb-3">{to('deliverTo')}</p><AddressText a={s.address} /></div>
          {(s.courier || s.trackingNo) && <div className="border border-line p-5 text-sm"><p className="label mb-3">{to('tracking')}</p>{s.courier} {s.trackingNo}</div>}
        </aside>
      </div>

      <ShipDialog open={dialog === 'ship'} onClose={close} busy={act.busy} error={act.error} onSubmit={(b) => advance({ status: 'SHIPPED', ...b })} />
      <ReasonDialog open={dialog === 'cancel'} title={t('cancelOrder')} onClose={close} busy={act.busy} error={act.error} onSubmit={(reason) => act.run(async () => { await post(`/seller/orders/${id}/cancel`, { reason }); close(); reload(); })} />
      <ReasonDialog open={dialog === 'failed'} title={t('failedDelivery')} onClose={close} busy={act.busy} error={act.error} onSubmit={(reason) => act.run(async () => { await post(`/seller/orders/${id}/failed-delivery`, { reason }); close(); reload(); })} />
      <ReasonDialog open={dialog === 'reject'} title={t('rejectPayment')} onClose={close} busy={act.busy} error={act.error} onSubmit={(reason) => act.run(async () => { await post(`/seller/orders/${id}/payment/reject`, { reason }); close(); reload(); })} />
    </>
  );
}

function ShipDialog({ open, onClose, onSubmit, busy, error }: { open: boolean; onClose: () => void; onSubmit: (b: any) => void; busy: boolean; error: any }) {
  const t = useTranslations('seller');
  const [f, setF] = useState({ courier: '', trackingNo: '', note: '' });
  return (
    <Modal open={open} onClose={onClose} title={t('markShipped')}>
      <div className="space-y-5">
        <Field label={t('courierName')}><Input value={f.courier} onChange={(e) => setF({ ...f, courier: e.target.value })} placeholder="Bosta, Aramex…" /></Field>
        <Field label={t('trackingNo')}><Input value={f.trackingNo} onChange={(e) => setF({ ...f, trackingNo: e.target.value })} dir="ltr" /></Field>
        <Field label={t('trackingNote')}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorText error={error} />
        <Button loading={busy} onClick={() => onSubmit({ courier: f.courier || undefined, trackingNo: f.trackingNo || undefined, note: f.note || undefined })}>{t('markShipped')}</Button>
      </div>
    </Modal>
  );
}
