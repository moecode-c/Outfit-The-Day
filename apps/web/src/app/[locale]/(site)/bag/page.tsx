'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { BagLine, usePricedBag } from '@/components/shop/BagDrawer';
import { Button, Empty, Input, Loading } from '@/components/ui';
import { Link, useRouter } from '@/i18n/routing';
import { money, tx } from '@/lib/format';
import { useBag } from '@/lib/store';

export default function BagPage() {
  const t = useTranslations('bag');
  const tf = useTranslations('footer');
  const locale = useLocale();
  const bag = useBag();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<string | undefined>(() => (typeof window !== 'undefined' ? sessionStorage.getItem('otd-coupon') ?? undefined : undefined));
  const { data, loading } = usePricedBag({ couponCode: applied });

  const apply = (c?: string) => {
    setApplied(c);
    try {
      if (c) sessionStorage.setItem('otd-coupon', c);
      else sessionStorage.removeItem('otd-coupon');
    } catch {}
  };

  return (
    <div className="px-4 pt-14 md:px-10">
      <h1 className="font-display text-6xl md:text-8xl">{t('title')}</h1>
      {!bag.items.length ? (
        <div className="mt-12 max-w-xl">
          <Empty>{t('empty')}</Empty>
          <Link href="/" className="label mt-6 inline-block underline underline-offset-8">{t('continue')}</Link>
        </div>
      ) : !data ? (
        <Loading />
      ) : (
        <div className="mt-12 grid gap-16 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="label mb-6 text-muted">{t('shipsSeparately')}</p>
            {data.groups.map((g: any) => (
              <section key={g.seller._id} className="mb-10 border-t border-ink">
                <p className="label py-4">{t('fromBrand', { brand: tx(g.seller.storeName, locale) })}</p>
                <div className="divide-y divide-line border-t border-line">
                  {g.items.map((l: any) => <BagLine key={l.variant} l={l} />)}
                </div>
              </section>
            ))}
          </div>
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <div className="border border-line p-6">
              <form className="flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (code.trim()) apply(code.trim().toUpperCase()); }}>
                <Input placeholder={t('couponCode')} value={code} onChange={(e) => setCode(e.target.value)} />
                <Button size="sm" variant="outline">{t('applyCoupon')}</Button>
              </form>
              {data.couponError && <p className="mt-2 text-xs text-danger">{data.couponError}</p>}
              {data.coupon && (
                <p className="mt-3 flex items-center justify-between text-sm">
                  <span className="label">{data.coupon.code}</span>
                  <button className="label text-muted underline" onClick={() => { apply(undefined); setCode(''); }}>{t('removeCoupon')}</button>
                </p>
              )}
              <dl className="mt-6 space-y-3 text-sm">
                <Row k={t('subtotal')} v={money(data.totals.items, locale)} />
                {data.totals.savings > 0 && <Row k={t('savings')} v={`−${money(data.totals.savings, locale)}`} muted />}
                {data.totals.coupon > 0 && <Row k={t('coupon')} v={`−${money(data.totals.coupon, locale)}`} />}
                <Row k={t('shipping')} v={t('shippingAtCheckout')} muted />
                <div className="border-t border-ink pt-3"><Row k={t('total')} v={money(data.totals.items - data.totals.coupon, locale)} strong /></div>
              </dl>
              <Button size="lg" className="mt-6 w-full" disabled={loading || data.issues.some((i: string) => i !== 'LOW_STOCK')} onClick={() => router.push('/checkout')}>
                {t('checkout')}
              </Button>
              <p className="label mt-4 text-center text-[10px] text-muted">{tf('payments')}</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, muted, strong }: { k: string; v: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-muted' : ''} ${strong ? 'text-base font-medium' : ''}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
