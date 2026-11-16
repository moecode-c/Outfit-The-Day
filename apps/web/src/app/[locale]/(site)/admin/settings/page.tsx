'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { egpInput, fromEgp, Section } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, Check, ErrorText, Field, Input, Loading, Select, Textarea, toast, useAction, useLoad } from '@/components/ui';
import { api, put } from '@/lib/api';
import { tx } from '@/lib/format';

const INTS = ['invoiceDueDays', 'overdueWarningDays', 'overdueSuspendDays', 'returnWindowDays', 'sellerReturnResponseDays', 'instapayProofHours', 'codMaxFailures'] as const;

export default function AdminSettings() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading } = useLoad<any>(() => api('/admin/settings'), []);
  const cats = useLoad<any[]>(() => api('/admin/categories'), []);
  const [f, setF] = useState<any>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!data) return;
    setF({
      ...data,
      codMaxOrder: egpInput(data.codMaxOrder),
      defaultShippingFee: egpInput(data.defaultShippingFee),
      tickerEn: (data.home?.tickerEn ?? []).join('\n'),
      tickerAr: (data.home?.tickerAr ?? []).join('\n'),
      featuredCategories: (data.home?.featuredCategories ?? []).map(String),
    });
  }, [data]);

  if (loading || !f) return <Loading />;
  const set = (p: any) => setF({ ...f, ...p });
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  return (
    <>
      <PageTitle>{t('settings')}</PageTitle>
      <form
        className="max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await put('/admin/settings', {
              commissionRate: Number(f.commissionRate),
              billingCycle: f.billingCycle,
              ...Object.fromEntries(INTS.map((k) => [k, Number(f[k])])),
              codMaxOrder: fromEgp(f.codMaxOrder) ?? 0,
              defaultShippingFee: fromEgp(f.defaultShippingFee) ?? 0,
              productModeration: f.productModeration,
              platformInstapay: f.platformInstapay,
              home: { featuredCategories: f.featuredCategories, tickerEn: lines(f.tickerEn), tickerAr: lines(f.tickerAr) },
            });
            toast(t('settingsSaved'));
          });
        }}
      >
        <Section title={t('finance')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('commissionRate')}><Input type="number" step="0.5" min={0} max={100} value={f.commissionRate} onChange={(e) => set({ commissionRate: e.target.value })} /></Field>
            <Field label={t('billingCycle')}><Select value={f.billingCycle} onChange={(e) => set({ billingCycle: e.target.value })}><option value="WEEKLY">{t('weekly')}</option><option value="MONTHLY">{t('monthly')}</option></Select></Field>
            <Field label={t('invoiceDueDays')}><Input type="number" value={f.invoiceDueDays} onChange={(e) => set({ invoiceDueDays: e.target.value })} /></Field>
            <Field label={t('platformInstapay')}><Input value={f.platformInstapay} onChange={(e) => set({ platformInstapay: e.target.value })} dir="ltr" /></Field>
            <Field label={t('overdueWarningDays')}><Input type="number" value={f.overdueWarningDays} onChange={(e) => set({ overdueWarningDays: e.target.value })} /></Field>
            <Field label={t('overdueSuspendDays')}><Input type="number" value={f.overdueSuspendDays} onChange={(e) => set({ overdueSuspendDays: e.target.value })} /></Field>
          </div>
        </Section>
        <Section title={t('orders')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('returnWindowDays')}><Input type="number" value={f.returnWindowDays} onChange={(e) => set({ returnWindowDays: e.target.value })} /></Field>
            <Field label={t('sellerReturnResponseDays')}><Input type="number" value={f.sellerReturnResponseDays} onChange={(e) => set({ sellerReturnResponseDays: e.target.value })} /></Field>
            <Field label={t('instapayProofHours')}><Input type="number" value={f.instapayProofHours} onChange={(e) => set({ instapayProofHours: e.target.value })} /></Field>
            <Field label={t('codMaxOrder')}><Input type="number" value={f.codMaxOrder} onChange={(e) => set({ codMaxOrder: e.target.value })} /></Field>
            <Field label={t('codMaxFailures')}><Input type="number" value={f.codMaxFailures} onChange={(e) => set({ codMaxFailures: e.target.value })} /></Field>
            <Field label={`${t('fee')} (default)`}><Input type="number" step="0.01" value={f.defaultShippingFee} onChange={(e) => set({ defaultShippingFee: e.target.value })} /></Field>
            <Field label={t('productModeration')}><Select value={f.productModeration} onChange={(e) => set({ productModeration: e.target.value })}><option value="ALL">{t('moderationAll')}</option><option value="OFF">{t('moderationOff')}</option></Select></Field>
          </div>
        </Section>
        <Section title={t('content')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={`${t('ticker')} — EN`}><Textarea rows={4} value={f.tickerEn} onChange={(e) => set({ tickerEn: e.target.value })} /></Field>
            <Field label={`${t('ticker')} — AR`}><Textarea rows={4} dir="rtl" value={f.tickerAr} onChange={(e) => set({ tickerAr: e.target.value })} /></Field>
          </div>
          <p className="label mb-3 mt-6">{t('featured')} — {t('categories')}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(cats.data ?? []).filter((c) => !c.parent).map((c) => (
              <Check key={c._id} label={tx(c.name, locale)} checked={f.featuredCategories.includes(c._id)} onChange={(v) => set({ featuredCategories: v ? [...f.featuredCategories, c._id] : f.featuredCategories.filter((x: string) => x !== c._id) })} />
            ))}
          </div>
        </Section>
        <ErrorText error={error} />
        <Button className="mt-10" loading={busy}>{tc('save')}</Button>
      </form>
    </>
  );
}
