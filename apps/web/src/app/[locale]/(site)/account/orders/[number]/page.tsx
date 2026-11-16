'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AddressText } from '@/components/shop/AddressForm';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus, PayStatus, Progress, ReturnStatus } from '@/components/shop/Status';
import { Button, ErrorText, Field, FileInput, Input, Loading, Modal, Notice, ReasonDialog, Select, Stars, Textarea, toast, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

function OrderDetail() {
  const { number } = useParams<{ number: string }>();
  const placed = useSearchParams().get('placed');
  const t = useTranslations('orders');
  const tc = useTranslations('checkout');
  const locale = useLocale();
  const o = useLoad<any>(() => api(`/orders/${number}`), [number]);

  if (o.loading && !o.data) return <Loading />;
  if (!o.data) return <Notice tone="danger">404</Notice>;
  const order = o.data;

  return (
    <>
      {placed && (
        <div className="mb-10 border border-ink p-6">
          <p className="font-display text-3xl">{tc('success')}</p>
          <p className="mt-2 text-muted">{tc('successText', { number: order.number })}</p>
        </div>
      )}
      <PageTitle actions={<Link href={`/account/orders/${order.number}/invoice`} className="label underline underline-offset-4">{t('invoice')}</Link>}>
        {t('order')} {order.number}
      </PageTitle>
      <p className="-mt-6 mb-10 text-sm text-muted">{t('placed', { date: date(order.createdAt, locale, true) })}</p>

      <div className="grid gap-12 xl:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          {order.subOrders.map((s: any) => (
            <SubOrder key={s._id} s={s} order={order} reload={o.reload} />
          ))}
        </div>
        <aside className="space-y-8">
          <div className="border border-line p-6">
            <p className="label mb-4">{t('deliverTo')}</p>
            <AddressText a={order.address} />
          </div>
          <div className="border border-line p-6 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between"><dt>{t('subtotal')}</dt><dd>{money(order.totals.items, locale)}</dd></div>
              {order.totals.coupon > 0 && <div className="flex justify-between"><dt>{t('coupon')} · {order.coupon?.code}</dt><dd>−{money(order.totals.coupon, locale)}</dd></div>}
              <div className="flex justify-between"><dt>{t('shipping')}</dt><dd>{money(order.totals.shipping, locale)}</dd></div>
              <div className="flex justify-between border-t border-ink pt-2 font-medium"><dt>{t('total')}</dt><dd>{money(order.totals.total, locale)}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}

function SubOrder({ s, order, reload }: { s: any; order: any; reload: () => void }) {
  const t = useTranslations('orders');
  const tr = useTranslations('returns');
  const locale = useLocale();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const cancel = useAction();
  const brand = tx(s.seller?.storeName, locale);
  const ret = order.returns.filter((r: any) => r.subOrder === s._id);
  const windowEnd = s.deliveredAt ? new Date(new Date(s.deliveredAt).getTime() + order.returnWindowDays * 86_400_000) : null;
  const canReturn = s.status === 'DELIVERED' && windowEnd && windowEnd > new Date() && !ret.some((r: any) => ['REQUESTED', 'APPROVED', 'RECEIVED'].includes(r.status)) && s.items.some((i: any) => i.returnable && i.qty > i.returnedQty);

  return (
    <section className="border-t border-ink pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">{brand}</p>
          <p className="mt-1 text-xs text-muted">{s.number} · {t(`method.${s.paymentMethod}` as any)}</p>
        </div>
        <div className="flex gap-2"><PayStatus s={s.paymentStatus} /><OrderStatus s={s.status} /></div>
      </div>
      <div className="mt-6"><Progress status={s.status} /></div>

      {s.status === 'AWAITING_PAYMENT' && <InstapayPanel s={s} brand={brand} reload={reload} />}

      {s.trackingNo || s.courier ? (
        <p className="mt-6 text-sm"><span className="label me-3">{t('tracking')}</span>{s.courier} {s.trackingNo && `· ${s.trackingNo}`} {s.shippingNote && <span className="text-muted">— {s.shippingNote}</span>}</p>
      ) : null}

      <div className="mt-6 divide-y divide-line">
        {s.items.map((i: any) => (
          <div key={i._id} className="flex gap-4 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.image} alt="" className="h-24 w-18 object-cover" />
            <div className="flex-1 text-sm">
              <Link href={`/p/${i.product}`} className="pointer-events-none">{tx(i.title, locale)}</Link>
              <p className="text-muted">{tx(i.colorName, locale)} · {i.size} · ×{i.qty}</p>
              {i.returnedQty > 0 && <p className="text-xs text-muted">{tr('status.REFUNDED')}: {i.returnedQty}</p>}
              {!i.returnable && <p className="text-xs text-muted">{tr('notReturnable')}</p>}
              {['DELIVERED', 'RETURN_REQUESTED', 'RETURNED'].includes(s.status) && (
                i.reviewed ? <p className="label mt-2 text-[10px] text-muted">✓ {t('reviewed')}</p> : <button className="label mt-2 underline underline-offset-4" onClick={() => setReviewItem(i)}>{t('review')}</button>
              )}
            </div>
            <p className="text-sm">{money(i.lineTotal, locale)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-4 border-t border-line pt-4 text-sm">
        <span className="text-muted">{t('shipping')} {money(s.shippingFee, locale)}{s.couponShare > 0 && ` · ${t('coupon')} −${money(s.couponShare, locale)}`}</span>
        <span className="font-medium">{money(s.total, locale)}</span>
      </div>

      {ret.map((r: any) => <ReturnCard key={r._id} r={r} reload={reload} />)}

      <div className="mt-6 flex flex-wrap gap-3">
        {['AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING'].includes(s.status) && <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>{t('cancel')}</Button>}
        {canReturn && <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>{t('returnItems')}</Button>}
        {s.seller?.email && <a href={`mailto:${s.seller.email}?subject=${s.number}`} className="label self-center text-muted underline underline-offset-4">{t('sellerContact', { brand })}</a>}
      </div>
      {windowEnd && s.status === 'DELIVERED' && <p className="mt-3 text-xs text-muted">{t('returnWindow', { date: date(windowEnd, locale) })}</p>}

      <ReasonDialog open={cancelOpen} title={t('cancelReason')} onClose={() => setCancelOpen(false)} busy={cancel.busy} error={cancel.error}
        onSubmit={(reason) => cancel.run(async () => { await post(`/orders/sub/${s._id}/cancel`, { reason }); setCancelOpen(false); reload(); })} />
      {returnOpen && <ReturnModal s={s} onClose={() => setReturnOpen(false)} onDone={() => { setReturnOpen(false); reload(); }} />}
      {reviewItem && <ReviewModal s={s} item={reviewItem} onClose={() => setReviewItem(null)} onDone={() => { setReviewItem(null); reload(); }} />}
    </section>
  );
}

function InstapayPanel({ s, brand, reload }: { s: any; brand: string; reload: () => void }) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [file, setFile] = useState('');
  const [ref, setRef] = useState('');
  const { busy, error, run } = useAction();
  const last = s.proofs?.[s.proofs.length - 1];
  if (s.paymentStatus === 'PROOF_SUBMITTED') return <div className="mt-6"><Notice>{t('proofSubmitted', { brand })}</Notice></div>;
  return (
    <div className="mt-6 border border-ink p-6">
      <p className="font-display text-2xl">{t('payTitle', { amount: money(s.total, locale) })}</p>
      {s.paymentStatus === 'REJECTED' && last && <p className="mt-3 text-sm text-danger">{t('proofRejected', { reason: last.reason })}</p>}
      <p className="mt-4 text-sm text-muted">{t('payTo', { amount: money(s.total, locale) })}</p>
      <div className="mt-2 flex items-center gap-3">
        <code className="bg-wash px-3 py-2 text-lg" dir="ltr">{s.instapayHandle}</code>
        <button className="label underline" onClick={() => { navigator.clipboard?.writeText(s.instapayHandle); toast(tc('copied')); }}>{tc('copy')}</button>
      </div>
      {s.proofDeadline && <p className="mt-3 text-xs text-muted">{t('payDeadline', { date: date(s.proofDeadline, locale, true) })}</p>}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Field label={t('uploadProof')}><FileInput value={file} onChange={setFile} accept="image/jpeg,image/png,image/webp" /></Field>
        <Field label={t('referenceNo')}><Input value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" /></Field>
      </div>
      <ErrorText error={error} />
      <Button className="mt-6" loading={busy} disabled={!file || ref.trim().length < 4} onClick={() => run(async () => { await post(`/orders/sub/${s._id}/proof`, { file, referenceNo: ref.trim() }); reload(); })}>
        {t('submitProof')}
      </Button>
    </div>
  );
}

function ReturnCard({ r, reload }: { r: any; reload: () => void }) {
  const tr = useTranslations('returns');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const d = useAction();
  return (
    <div className="mt-6 bg-wash p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">{r.number} · {tr(`reasons.${r.reason}` as any)}</p>
        <ReturnStatus s={r.status} />
      </div>
      <p className="mt-2 text-muted">{r.returnShippingPaidBy === 'SELLER' ? tr('shippingSeller') : tr('shippingCustomer')}</p>
      {r.rejectReason && <p className="mt-2">{tr('reason')}: {r.rejectReason}</p>}
      {r.refundAmount > 0 && <p className="mt-2">{tr('refund')}: {money(r.refundAmount, locale)}</p>}
      {r.refundProof && <a className="mt-2 inline-block underline" href={r.refundProof} target="_blank" rel="noreferrer">↗ proof</a>}
      {r.adminNote && <p className="mt-2 italic">OTD: {r.adminNote}</p>}
      {r.disputed ? <p className="label mt-3">{tr('disputed')}</p> : ['REJECTED', 'REFUNDED'].includes(r.status) && (
        <button className="label mt-3 underline underline-offset-4" onClick={() => setOpen(true)}>{tr('dispute')}</button>
      )}
      <ReasonDialog open={open} title={tr('disputeReason')} onClose={() => setOpen(false)} busy={d.busy} error={d.error}
        onSubmit={(reason) => d.run(async () => { await post(`/returns/${r._id}/dispute`, { reason }); setOpen(false); reload(); })} />
    </div>
  );
}

function ReturnModal({ s, onClose, onDone }: { s: any; onClose: () => void; onDone: () => void }) {
  const tr = useTranslations('returns');
  const tc = useTranslations('common');
  const locale = useLocale();
  const eligible = s.items.filter((i: any) => i.returnable && i.qty > i.returnedQty);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('SIZE');
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([item, q]) => ({ item, qty: q }));
  return (
    <Modal open onClose={onClose} title={tr('title')}>
      <div className="space-y-6">
        {eligible.map((i: any) => (
          <div key={i._id} className="flex items-center gap-4 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.image} alt="" className="h-16 w-12 object-cover" />
            <span className="flex-1">{tx(i.title, locale)} · {i.size}</span>
            <Select className="w-16" value={qty[i._id] ?? 0} onChange={(e) => setQty({ ...qty, [i._id]: Number(e.target.value) })}>
              {Array.from({ length: i.qty - i.returnedQty + 1 }, (_, k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </div>
        ))}
        <Field label={tr('reason')}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {['SIZE', 'CHANGED_MIND', 'FAULTY', 'WRONG_ITEM', 'OTHER'].map((r) => <option key={r} value={r}>{tr(`reasons.${r}` as any)}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-muted">{['FAULTY', 'WRONG_ITEM'].includes(reason) ? tr('shippingSeller') : tr('shippingCustomer')} {tr('rule')}</p>
        <Field label={tr('details')}><Textarea value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
        <Field label={tr('photos')}><PrivatePhotos value={photos} onChange={setPhotos} /></Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} disabled={!items.length} onClick={() => run(async () => { await post('/returns', { subOrder: s._id, items, reason, details, photos }); onDone(); })}>{tr('submit')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PrivatePhotos({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((v, i) => <p key={v} className="text-xs">✓ {i + 1} <button className="underline" onClick={() => onChange(value.filter((x) => x !== v))}>✕</button></p>)}
      {value.length < 6 && <FileInput key={value.length} onChange={(u) => onChange([...value, u])} accept="image/jpeg,image/png,image/webp" />}
    </div>
  );
}

function ReviewModal({ s, item, onClose, onDone }: { s: any; item: any; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('review')}>
      <p className="text-sm">{tx(item.title, locale)}</p>
      <div className="my-6"><Stars value={rating} size={28} onChange={setRating} /></div>
      <Field label={t('yourReview')}><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <ErrorText error={error} />
      <Button className="mt-6" loading={busy} onClick={() => run(async () => { await post('/reviews', { subOrder: s._id, item: item._id, rating, text }); onDone(); })}>{tc('submit')}</Button>
    </Modal>
  );
}

export default function Page() {
  return (
    <Suspense>
      <OrderDetail />
    </Suspense>
  );
}
