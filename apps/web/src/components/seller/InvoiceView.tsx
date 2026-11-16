'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { date, money, tx } from '@/lib/format';

/** Printable commission invoice (used by both the seller hub and the admin panel). */
export function InvoiceView({ data }: { data: { invoice: any; entries: any[]; seller: any } }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { invoice: i, entries, seller } = data;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-8 flex justify-end"><Button size="sm" variant="outline" onClick={() => window.print()}>{tc('print')}</Button></div>
      <div className="border border-line p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-ink pb-6">
          <div><p className="font-display text-4xl">OTD</p><p className="label mt-1 text-muted">{t('invoice')} · {t('commissionTotal')}</p></div>
          <div className="text-end text-sm">
            <p className="label">{i.number}</p>
            <p className="text-muted">{date(i.periodStart, locale)} – {date(i.periodEnd, locale)}</p>
            <p className="mt-2">{t('due')}: {date(i.dueAt, locale)}</p>
          </div>
        </div>
        <div className="py-6 text-sm">
          <p className="label mb-1">{tx(seller.storeName, locale)}</p>
          <p className="text-muted">{seller.ownerName} · {seller.email} · <span dir="ltr">{seller.phone}</span></p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {entries.map((e) => (
              <tr key={e._id} className="border-b border-line/60">
                <td className="py-2 text-muted">{date(e.createdAt, locale)}</td>
                <td className="py-2">{t(`entry.${e.type}` as any)} {e.subOrder?.number && <span className="text-muted">· {e.subOrder.number}</span>}{e.note && <span className="text-muted"> — {e.note}</span>}</td>
                <td className="py-2 text-end">{e.amount < 0 ? '−' : ''}{money(Math.abs(e.amount), locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-6 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Opening balance</dt><dd>{money(i.openingBalance, locale)}</dd></div>
          <div className="flex justify-between"><dt>{t('period')}</dt><dd>{money(i.periodTotal, locale)}</dd></div>
          <div className="flex justify-between"><dt>{t('paid')}</dt><dd>{money(i.paid, locale)}</dd></div>
          <div className="flex justify-between border-t-2 border-ink pt-3 text-lg"><dt>{t('amountDue')}</dt><dd>{money(Math.max(0, i.amountDue - i.paid), locale)}</dd></div>
        </dl>
      </div>
    </div>
  );
}
