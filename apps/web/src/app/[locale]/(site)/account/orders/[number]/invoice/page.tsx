'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { AddressText } from '@/components/shop/AddressForm';
import { Button, Loading, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

/** Printable customer invoice — one section per brand, since each brand ships and bills separately. */
export default function InvoicePage() {
  const { number } = useParams<{ number: string }>();
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data: o, loading } = useLoad<any>(() => api(`/orders/${number}`), [number]);
  if (loading || !o) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-8 flex justify-end gap-3">
        <a href={`/api/orders/${o.number}/invoice/pdf`} download className="label border border-ink px-4 py-2 hover:bg-ink hover:text-canvas text-[11px]">{tc('downloadPdf')} ↓</a>
        <Button variant="outline" size="sm" onClick={() => window.print()}>{tc('print')}</Button>
      </div>
      <div className="border border-line p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-ink pb-6">
          <div>
            <p className="font-display text-4xl">OTD</p>
            <p className="label mt-1 text-muted">Outfit The Day</p>
          </div>
          <div className="text-end text-sm">
            <p className="label">{t('invoice')}</p>
            <p className="mt-1">{o.number}</p>
            <p className="text-muted">{date(o.createdAt, locale)}</p>
          </div>
        </div>
        <div className="grid gap-6 py-6 text-sm sm:grid-cols-2">
          <div><p className="label mb-2">{t('deliverTo')}</p><AddressText a={o.address} /></div>
          <div className="sm:text-end"><p className="label mb-2">{t('payment')}</p>{[...new Set(o.subOrders.map((s: any) => t(`method.${s.paymentMethod}` as any)))].join(' · ')}</div>
        </div>
        {o.subOrders.map((s: any) => (
          <div key={s._id} className="break-inside-avoid border-t border-line py-6">
            <p className="label mb-3">{tx(s.seller?.storeName, locale)} · {s.number}</p>
            <table className="w-full text-sm">
              <tbody>
                {s.items.map((i: any) => (
                  <tr key={i._id} className="border-b border-line/60">
                    <td className="py-2">{tx(i.title, locale)} <span className="text-muted">· {tx(i.colorName, locale)} · {i.size}</span></td>
                    <td className="py-2 text-center">×{i.qty}</td>
                    <td className="py-2 text-end">{money(i.lineTotal, locale)}</td>
                  </tr>
                ))}
                <tr><td className="pt-2 text-muted" colSpan={2}>{t('shipping')}</td><td className="pt-2 text-end">{money(s.shippingFee, locale)}</td></tr>
                {s.couponShare > 0 && <tr><td className="text-muted" colSpan={2}>{t('coupon')}</td><td className="text-end">−{money(s.couponShare, locale)}</td></tr>}
                <tr><td className="pt-2 font-medium" colSpan={2}>{t('total')}</td><td className="pt-2 text-end font-medium">{money(s.total, locale)}</td></tr>
              </tbody>
            </table>
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-ink pt-4 text-lg">
          <span>{t('total')}</span><span>{money(o.totals.total, locale)}</span>
        </div>
      </div>
    </div>
  );
}
