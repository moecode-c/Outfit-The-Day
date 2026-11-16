'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Section } from '@/components/panel';
import { AddressText } from '@/components/shop/AddressForm';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus, PayStatus, ReturnStatus } from '@/components/shop/Status';
import { Button, ErrorText, Loading, ReasonDialog, Textarea, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

export default function AdminOrder() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('admin');
  const to = useTranslations('orders');
  const locale = useLocale();
  const { data: s, loading, reload } = useLoad<any>(() => api(`/admin/orders/${id}`), [id]);
  const [note, setNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const act = useAction();
  if (loading && !s) return <Loading />;
  if (!s) return null;
  return (
    <>
      <PageTitle actions={!['DELIVERED', 'CANCELLED', 'RETURNED', 'RETURN_REQUESTED'].includes(s.status) && <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>{to('cancel')}</Button>}>{s.number}</PageTitle>
      <div className="-mt-6 mb-8 flex flex-wrap items-center gap-3 text-sm text-muted">
        {date(s.createdAt, locale, true)} · <Link href={`/admin/sellers/${s.seller?._id}`} className="underline">{tx(s.seller?.storeName, locale)}</Link> · {to(`method.${s.paymentMethod}` as any)} <PayStatus s={s.paymentStatus} /> <OrderStatus s={s.status} />
      </div>
      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="divide-y divide-line border-y border-line">
            {s.items.map((i: any) => (
              <div key={i._id} className="flex gap-4 py-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.image} alt="" className="h-16 w-12 object-cover" />
                <div className="flex-1"><p>{tx(i.title, locale)}</p><p className="text-muted">{tx(i.colorName, locale)} · {i.size} · {i.commissionRate}%</p></div>
                <p>×{i.qty}</p><p className="w-24 text-end">{money(i.lineTotal, locale)}</p>
              </div>
            ))}
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt>{to('subtotal')}</dt><dd>{money(s.itemsTotal, locale)}</dd></div>
            <div className="flex justify-between"><dt>{to('coupon')}</dt><dd>−{money(s.couponShare, locale)}</dd></div>
            <div className="flex justify-between"><dt>{to('shipping')}</dt><dd>{money(s.shippingFee, locale)}</dd></div>
            <div className="flex justify-between font-medium"><dt>{to('total')}</dt><dd>{money(s.total, locale)}</dd></div>
            <div className="flex justify-between text-muted"><dt>{t('commissionGross')}</dt><dd>{money(s.commissionAmount, locale)}</dd></div>
          </dl>

          {!!s.proofs?.length && (
            <Section title="InstaPay">
              {s.proofs.map((p: any) => <p key={p._id} className="text-sm"><a href={p.file} target="_blank" rel="noreferrer" className="underline">{p.referenceNo}</a> · {p.status} {p.reason && `— ${p.reason}`} · {date(p.at, locale, true)}</p>)}
            </Section>
          )}

          {!!s.returns?.length && (
            <Section title={t('returns')}>
              {s.returns.map((r: any) => <div key={r._id} className="flex items-center gap-3 text-sm"><Link href="/admin/returns" className="underline">{r.number}</Link><ReturnStatus s={r.status} />{r.flagged && <span className="text-danger">{t('flagged')}</span>}</div>)}
            </Section>
          )}

          <Section title={to('history')}>
            <ul className="space-y-2 text-sm">
              {[...s.events].reverse().map((e: any, k: number) => (
                <li key={k} className="flex gap-4"><span className="w-40 shrink-0 text-muted">{date(e.at, locale, true)}</span><span>{to.has(`status.${e.status}` as any) ? to(`status.${e.status}` as any) : e.status} {e.by?.name && <span className="text-muted">· {e.by.name}</span>}{e.note && <span className="text-muted"> — {e.note}</span>}</span></li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('addNote')} />
              <Button size="sm" disabled={!note.trim()} loading={act.busy} onClick={() => act.run(async () => { await post(`/admin/orders/${id}/note`, { note }); setNote(''); reload(); })}>{t('addNote')}</Button>
            </div>
            <ErrorText error={act.error} />
          </Section>
        </div>
        <aside className="space-y-6">
          <div className="border border-line p-5 text-sm">
            <p className="label mb-3">{t('customers')}</p>
            <p>{s.customer?.name}</p><p className="text-muted">{s.customer?.email}</p><p className="text-muted" dir="ltr">{s.customer?.phone}</p>
            <p className="mt-2 text-xs text-muted">COD failures: {s.customer?.codFailures ?? 0}</p>
          </div>
          <div className="border border-line p-5"><p className="label mb-3">{to('deliverTo')}</p><AddressText a={s.address} /></div>
          {(s.courier || s.trackingNo) && <div className="border border-line p-5 text-sm"><p className="label mb-3">{to('tracking')}</p>{s.courier} {s.trackingNo}</div>}
        </aside>
      </div>
      <ReasonDialog open={cancelling} title={to('cancel')} onClose={() => setCancelling(false)} busy={act.busy} error={act.error} onSubmit={(reason) => act.run(async () => { await post(`/admin/orders/${id}/cancel`, { reason }); setCancelling(false); reload(); })} />
    </>
  );
}
