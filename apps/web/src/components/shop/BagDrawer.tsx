'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { post } from '@/lib/api';
import { money, tx } from '@/lib/format';
import { useBag } from '@/lib/store';
import { Button, Drawer, Empty, Price, Spinner } from '../ui';

export function usePricedBag(extra: { couponCode?: string; governorate?: string } = {}) {
  const bag = useBag();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify([bag.items, extra]);
  useEffect(() => {
    if (!bag.items.length) {
      setData(null);
      return;
    }
    let live = true;
    setLoading(true);
    post('/cart/price', { items: bag.items, ...extra })
      .then((d) => live && setData(d))
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}

export function BagLine({ l, compact }: { l: any; compact?: boolean }) {
  const t = useTranslations('bag');
  const locale = useLocale();
  const bag = useBag();
  return (
    <div className="flex gap-4 py-5">
      <Link href={`/p/${l.slug}`} className="block w-20 shrink-0 bg-wash md:w-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {l.image && <img src={l.image} alt="" className="aspect-[3/4] w-full object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <Link href={`/p/${l.slug}`} className="truncate text-sm">{tx(l.title, locale)}</Link>
          <Price price={l.price * (l.issue === 'LOW_STOCK' ? Math.min(l.qty, l.stock) : l.qty)} original={l.onSale ? l.original * l.qty : undefined} className="text-sm whitespace-nowrap" />
        </div>
        <p className="mt-1 text-xs text-muted">{tx(l.colorName, locale)} · {l.size}</p>
        {l.issue && (
          <p className="mt-1 text-xs text-danger">
            {l.issue === 'LOW_STOCK' ? t('lowStock', { n: l.stock }) : l.issue === 'OUT_OF_STOCK' ? t('outOfStock') : t('unavailable')}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          {!compact || !l.issue ? (
            <div className="flex items-center border border-line">
              <button className="px-3 py-1" onClick={() => bag.setQty(l.variant, l.qty - 1)} aria-label="−">−</button>
              <span className="w-6 text-center text-sm">{l.qty}</span>
              <button className="px-3 py-1" onClick={() => bag.setQty(l.variant, l.qty + 1)} aria-label="+" disabled={l.qty >= l.stock}>+</button>
            </div>
          ) : <span />}
          <button className="label text-muted hover:text-ink" onClick={() => bag.remove(l.variant)}>{t('removeCoupon')}</button>
        </div>
      </div>
    </div>
  );
}

export function BagDrawer() {
  const t = useTranslations('bag');
  const locale = useLocale();
  const bag = useBag();
  const { data, loading } = usePricedBag();
  return (
    <Drawer open={bag.open} onClose={() => bag.setOpen(false)} title={`${t('title')} · ${t('items', { n: bag.count })}`}>
      {!bag.items.length ? (
        <div className="p-6">
          <Empty>{t('empty')}</Empty>
          <Button variant="outline" className="mt-6 w-full" onClick={() => bag.setOpen(false)}>{t('continue')}</Button>
        </div>
      ) : (
        <div className="flex min-h-full flex-col">
          <div className="flex-1 px-6">
            {loading && !data && <div className="py-10"><Spinner /></div>}
            {data?.groups.map((g: any) => (
              <div key={g.seller._id} className="border-b border-line py-4">
                <p className="label text-muted">{t('fromBrand', { brand: tx(g.seller.storeName, locale) })}</p>
                <div className="divide-y divide-line">
                  {g.items.map((l: any) => <BagLine key={l.variant} l={l} compact />)}
                </div>
              </div>
            ))}
          </div>
          {data && (
            <div className="sticky bottom-0 border-t border-line bg-canvas p-6">
              <div className="flex justify-between text-sm"><span>{t('subtotal')}</span><span>{money(data.totals.items, locale)}</span></div>
              {data.totals.savings > 0 && <div className="mt-1 flex justify-between text-sm text-muted"><span>{t('savings')}</span><span>−{money(data.totals.savings, locale)}</span></div>}
              <p className="mt-1 text-xs text-muted">{t('shipping')}: {t('shippingAtCheckout')}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Link href="/bag" onClick={() => bag.setOpen(false)} className="label border border-ink py-3.5 text-center transition-colors hover:bg-ink hover:text-canvas">{t('viewBag')}</Link>
                <Link href="/checkout" onClick={() => bag.setOpen(false)} className="label bg-ink py-3.5 text-center text-canvas transition-opacity hover:opacity-85">{t('checkout')}</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
