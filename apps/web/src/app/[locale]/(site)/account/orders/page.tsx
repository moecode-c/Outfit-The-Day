'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PageTitle } from '@/components/shop/PanelShell';
import { OrderStatus } from '@/components/shop/Status';
import { Empty, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

export default function OrdersPage() {
  const t = useTranslations('account');
  const to = useTranslations('orders');
  const locale = useLocale();
  const { data, loading } = useLoad<any[]>(() => api('/orders'), []);
  return (
    <>
      <PageTitle>{t('orders')}</PageTitle>
      {loading ? <Loading /> : !data?.length ? <Empty>{t('noOrders')}</Empty> : (
        <div className="divide-y divide-line border-y border-line">
          {data.map((o) => (
            <Link key={o._id} href={`/account/orders/${o.number}`} className="group block py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label">{to('order')} {o.number}</p>
                  <p className="mt-1 text-sm text-muted">{to('placed', { date: date(o.createdAt, locale) })}</p>
                </div>
                <p className="text-sm">{money(o.totals.total, locale)}</p>
              </div>
              <div className="mt-4 space-y-3">
                {o.subOrders.map((s: any) => (
                  <div key={s._id} className="flex items-center gap-4">
                    <div className="flex -space-x-3 rtl:space-x-reverse">
                      {s.items.slice(0, 4).map((i: any, k: number) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={k} src={i.image} alt="" className="h-16 w-12 border-2 border-canvas object-cover" />
                      ))}
                    </div>
                    <p className="flex-1 text-sm text-muted">{tx(s.seller?.storeName, locale)}</p>
                    <OrderStatus s={s.status} />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
