'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AddressForm, AddressText } from '@/components/shop/AddressForm';
import { usePricedBag } from '@/components/shop/BagDrawer';
import { Button, Empty, ErrorText, Loading, Radio, useAction, useLoad } from '@/components/ui';
import { Link, useRouter } from '@/i18n/routing';
import { api, ApiError, post } from '@/lib/api';
import { money, tx } from '@/lib/format';
import { useAuth, useBag } from '@/lib/store';

export default function CheckoutPage() {
  const t = useTranslations('checkout');
  const tb = useTranslations('bag');
  const locale = useLocale();
  const { me, loading: authLoading } = useAuth();
  const bag = useBag();
  const router = useRouter();
  const addresses = useLoad<any[]>(() => (me ? api('/account/addresses') : Promise.resolve([])), [me?.id]);
  const config = useLoad<any>(() => api('/content/config'), []);
  const [addressId, setAddressId] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<'COD' | 'INSTAPAY'>('COD');
  const [coupon] = useState<string | undefined>(() => (typeof window !== 'undefined' ? sessionStorage.getItem('otd-coupon') ?? undefined : undefined));
  const address = addresses.data?.find((a) => a._id === addressId);
  const { data, loading } = usePricedBag({ couponCode: coupon, governorate: address?.governorate?._id });
  const { busy, error, run, setError } = useAction();

  useEffect(() => {
    if (!authLoading && !me) router.replace('/login?next=/checkout');
  }, [authLoading, me, router]);
  useEffect(() => {
    if (addresses.data?.length && !addressId) setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0])._id);
    if (addresses.data && !addresses.data.length) setAdding(true);
  }, [addresses.data, addressId]);

  if (authLoading || !me) return <div className="px-10"><Loading /></div>;
  if (!bag.items.length) return <div className="px-4 pt-14 md:px-10"><Empty>{tb('empty')}</Empty></div>;

  const place = () =>
    run(async () => {
      try {
        const r = await post<{ number: string }>('/orders', { items: bag.items, addressId, paymentMethod: method, couponCode: data?.coupon?.code });
        bag.clear();
        try { sessionStorage.removeItem('otd-coupon'); } catch {}
        router.push(`/account/orders/${r.number}?placed=1`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setError(t('changed'));
        throw e;
      }
    });

  return (
    <div className="px-4 pt-14 md:px-10">
      <h1 className="font-display text-6xl md:text-8xl">{t('title')}</h1>
      <div className="mt-12 grid gap-16 lg:grid-cols-[1fr_400px]">
        <div className="space-y-14">
          <section>
            <h2 className="label mb-6">1 · {t('address')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.data?.map((a) => <Radio key={a._id} checked={addressId === a._id && !adding} onChange={() => { setAddressId(a._id); setAdding(false); }} label={<AddressText a={a} />} />)}
            </div>
            {adding ? (
              <div className="mt-6 border border-line p-6">
                <AddressForm onSaved={(a) => { addresses.reload(); setAddressId(a._id); setAdding(false); }} onCancel={addresses.data?.length ? () => setAdding(false) : undefined} />
              </div>
            ) : (
              <button className="label mt-5 underline underline-offset-4" onClick={() => setAdding(true)}>+ {t('addAddress')}</button>
            )}
          </section>

          <section>
            <h2 className="label mb-6">2 · {t('payment')}</h2>
            <div className="grid gap-3">
              <Radio checked={method === 'COD'} onChange={() => setMethod('COD')} label={t('cod')} desc={t('codText')} />
              <Radio checked={method === 'INSTAPAY'} onChange={() => setMethod('INSTAPAY')} label={t('instapay')} desc={t('instapayText', { hours: config.data?.instapayProofHours ?? 24 })} />
            </div>
          </section>

          <section>
            <h2 className="label mb-6">3 · {t('review')}</h2>
            {!data ? <Loading /> : data.groups.map((g: any) => (
              <div key={g.seller._id} className="mb-6 border-t border-ink pt-4">
                <div className="flex justify-between">
                  <p className="label">{tx(g.seller.storeName, locale)}</p>
                  {data.shippingKnown && <p className="text-xs text-muted">{t('eta', { n: g.etaDays })}</p>}
                </div>
                {g.items.map((l: any) => (
                  <div key={l.variant} className="mt-4 flex gap-4 text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.image} alt="" className="h-20 w-15 object-cover" />
                    <div className="flex-1">
                      <p>{tx(l.title, locale)}</p>
                      <p className="text-muted">{tx(l.colorName, locale)} · {l.size} · ×{l.qty}</p>
                      {l.issue && <p className="text-xs text-danger">{l.issue}</p>}
                    </div>
                    <p>{money(l.lineTotal, locale)}</p>
                  </div>
                ))}
                <div className="mt-4 flex justify-between text-sm text-muted">
                  <span>{tb('shipping')}</span>
                  <span>{data.shippingKnown ? (g.shippingFee ? money(g.shippingFee, locale) : tb('free')) : '—'}</span>
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="border border-line p-6">
            <p className="label mb-6">{t('summary')}</p>
            {data && (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt>{tb('subtotal')}</dt><dd>{money(data.totals.items, locale)}</dd></div>
                {data.totals.coupon > 0 && <div className="flex justify-between"><dt>{tb('coupon')} · {data.coupon?.code}</dt><dd>−{money(data.totals.coupon, locale)}</dd></div>}
                <div className="flex justify-between"><dt>{tb('shipping')}</dt><dd>{data.shippingKnown ? money(data.totals.shipping, locale) : '—'}</dd></div>
                <div className="flex justify-between border-t border-ink pt-3 text-base font-medium"><dt>{tb('total')}</dt><dd>{money(data.totals.total, locale)}</dd></div>
              </dl>
            )}
            {data?.couponError && <p className="mt-3 text-xs text-danger">{data.couponError}</p>}
            <div className="mt-4"><ErrorText error={error} /></div>
            <Button size="lg" className="mt-6 w-full" loading={busy} disabled={loading || !addressId || adding || !data || data.issues.some((i: string) => i !== 'LOW_STOCK')} onClick={place}>
              {t('placeOrder')}
            </Button>
            <Link href="/bag" className="label mt-4 block text-center text-muted underline underline-offset-4">{tb('viewBag')}</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
