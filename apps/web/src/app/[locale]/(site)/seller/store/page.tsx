'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { egpInput, fromEgp, Section } from '@/components/panel';
import { useGovernorates } from '@/components/shop/AddressForm';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, ErrorText, Field, I18nInput, ImagesInput, Input, Loading, Select, toast, useAction, useLoad } from '@/components/ui';
import { api, patch } from '@/lib/api';
import { tx } from '@/lib/format';
import { useAuth } from '@/lib/store';

export default function StoreSettings() {
  const t = useTranslations('seller');
  const ta = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { reload: reloadMe } = useAuth();
  const govs = useGovernorates();
  const { data: s, loading } = useLoad<any>(() => api('/sellers/me'), []);
  const [f, setF] = useState<any>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!s) return;
    setF({
      storeName: s.storeName, description: s.description ?? { en: '', ar: '' }, returnPolicy: s.returnPolicy ?? { en: '', ar: '' },
      logo: s.logo ? [s.logo] : [], banner: s.banner ? [s.banner] : [],
      phone: s.phone ?? '', email: s.email ?? '', instapayHandle: s.instapayHandle ?? '',
      flatFee: egpInput(s.shipping?.flatFee), freeAbove: egpInput(s.shipping?.freeAbove),
      zones: (s.shipping?.perGovernorate ?? []).map((z: any) => ({ governorate: String(z.governorate), fee: egpInput(z.fee), etaDays: z.etaDays ?? '' })),
    });
  }, [s]);

  if (loading || !f) return <Loading />;
  const set = (p: any) => setF({ ...f, ...p });

  return (
    <>
      <PageTitle>{t('store')}</PageTitle>
      <form
        className="max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await patch('/sellers/me', {
              storeName: f.storeName, description: f.description, returnPolicy: f.returnPolicy,
              logo: f.logo[0] ?? '', banner: f.banner[0] ?? '',
              phone: f.phone || undefined, email: f.email || undefined, instapayHandle: f.instapayHandle || undefined,
              shipping: {
                flatFee: fromEgp(f.flatFee), freeAbove: fromEgp(f.freeAbove),
                perGovernorate: f.zones.filter((z: any) => z.governorate && z.fee !== '').map((z: any) => ({ governorate: z.governorate, fee: fromEgp(z.fee), etaDays: z.etaDays === '' ? undefined : Number(z.etaDays) })),
              },
            });
            await reloadMe();
            toast(tc('done'));
          });
        }}
      >
        <div className="space-y-6">
          <I18nInput label={t('storeName')} value={f.storeName} onChange={(storeName) => set({ storeName })} required />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={t('logo')}><ImagesInput value={f.logo} onChange={(logo) => set({ logo })} max={1} /></Field>
            <Field label={t('banner')}><ImagesInput value={f.banner} onChange={(banner) => set({ banner })} max={1} /></Field>
          </div>
          <I18nInput label={t('description')} value={f.description} onChange={(description) => set({ description })} textarea />
          <I18nInput label={t('returnPolicy')} value={f.returnPolicy} onChange={(returnPolicy) => set({ returnPolicy })} textarea />
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label={ta('phone')}><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} dir="ltr" /></Field>
            <Field label={ta('email')}><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} dir="ltr" /></Field>
            <Field label="InstaPay"><Input value={f.instapayHandle} onChange={(e) => set({ instapayHandle: e.target.value })} dir="ltr" /></Field>
          </div>
        </div>

        <Section title={t('shipping')}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={t('flatFee')}><Input type="number" min={0} step="0.01" value={f.flatFee} onChange={(e) => set({ flatFee: e.target.value })} /></Field>
            <Field label={t('freeAbove')}><Input type="number" min={0} step="0.01" value={f.freeAbove} onChange={(e) => set({ freeAbove: e.target.value })} /></Field>
          </div>
          <p className="label mb-3 mt-8">{t('perGov')}</p>
          <div className="space-y-2">
            {f.zones.map((z: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_110px_80px_auto] gap-2">
                <Select value={z.governorate} onChange={(e) => set({ zones: f.zones.map((x: any, k: number) => (k === i ? { ...x, governorate: e.target.value } : x)) })}>
                  <option value="">—</option>
                  {govs.map((g) => <option key={g._id} value={g._id}>{tx(g.name, locale)}</option>)}
                </Select>
                <Input type="number" min={0} placeholder="EGP" value={z.fee} onChange={(e) => set({ zones: f.zones.map((x: any, k: number) => (k === i ? { ...x, fee: e.target.value } : x)) })} />
                <Input type="number" min={0} placeholder={t('eta')} value={z.etaDays} onChange={(e) => set({ zones: f.zones.map((x: any, k: number) => (k === i ? { ...x, etaDays: e.target.value } : x)) })} />
                <button type="button" className="px-2 text-muted" onClick={() => set({ zones: f.zones.filter((_: any, k: number) => k !== i) })}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="label mt-3 underline underline-offset-4" onClick={() => set({ zones: [...f.zones, { governorate: '', fee: '', etaDays: '' }] })}>+ {t('addZone')}</button>
        </Section>

        <ErrorText error={error} />
        <Button className="mt-10" loading={busy}>{tc('save')}</Button>
      </form>
    </>
  );
}
