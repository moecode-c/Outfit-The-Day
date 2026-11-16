'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PageTitle } from '@/components/shop/PanelShell';
import { ReturnStatus } from '@/components/shop/Status';
import { Empty, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

export default function ReturnsPage() {
  const t = useTranslations('account');
  const tr = useTranslations('returns');
  const locale = useLocale();
  const { data, loading } = useLoad<any[]>(() => api('/returns'), []);
  return (
    <>
      <PageTitle>{t('returns')}</PageTitle>
      {loading ? <Loading /> : !data?.length ? <Empty>{t('noReturns')}</Empty> : (
        <div className="divide-y divide-line border-y border-line">
          {data.map((r) => {
            const orderNo = r.subOrder?.number?.split('-').slice(0, -1).join('-');
            const items = (r.items ?? []).map((ri: any) => ({ ...r.subOrder?.items?.find((i: any) => String(i._id) === String(ri.item)), qty: ri.qty }));
            return (
              <div key={r._id} className="py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label">{r.number} · {tx(r.seller?.storeName, locale)}</p>
                    <p className="mt-1 text-sm text-muted">{date(r.createdAt, locale)} · {tr(`reasons.${r.reason}` as any)}</p>
                  </div>
                  <ReturnStatus s={r.status} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {items.map((i: any, k: number) => (
                    <div key={k} className="flex items-center gap-3 text-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {i.image && <img src={i.image} alt="" className="h-14 w-10 object-cover" />}
                      <span>{tx(i.title, locale)} ×{i.qty}</span>
                    </div>
                  ))}
                </div>
                {r.refundAmount > 0 && <p className="mt-3 text-sm">{tr('refund')}: {money(r.refundAmount, locale)}</p>}
                {orderNo && <Link href={`/account/orders/${orderNo}`} className="label mt-3 inline-block underline underline-offset-4">{r.subOrder.number} →</Link>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
