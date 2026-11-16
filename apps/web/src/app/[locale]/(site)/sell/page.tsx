'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Reveal } from '@/components/Reveal';
import { Button, ErrorText, Field, FileInput, I18nInput, Input, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function SellPage() {
  const t = useTranslations('sell');
  const ta = useTranslations('auth');
  const tc = useTranslations('common');
  const { me, loading, reload } = useAuth();
  const app = useLoad<any>(() => (me ? api('/sellers/me') : Promise.resolve(null)), [me?.id]);
  const { busy, error, run } = useAction();
  const [f, setF] = useState<any>({ storeName: { en: '', ar: '' }, ownerName: '', phone: '', email: '', businessAddress: '', nationalIdFile: '', commercialRegisterFile: '', taxNumber: '', instapayHandle: '', description: { en: '', ar: '' } });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const s = app.data;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...f };
    if (!body.commercialRegisterFile) delete body.commercialRegisterFile;
    if (!body.taxNumber) delete body.taxNumber;
    void run(async () => {
      await post('/sellers/apply', body);
      await app.reload();
      await reload();
    });
  };

  return (
    <div className="px-4 pt-14 md:px-10">
      <Reveal className="max-w-4xl">
        <h1 className="font-display text-6xl md:text-8xl"><em>{t('title')}</em></h1>
        <p className="mt-8 max-w-2xl text-lg text-muted">{t('intro')}</p>
      </Reveal>
      <div className="mt-16 grid gap-px border-y border-line bg-line md:grid-cols-3">
        {[['how1', 'how1t'], ['how2', 'how2t'], ['how3', 'how3t']].map(([a, b], i) => (
          <div key={a} className="bg-canvas p-8">
            <p className="font-display text-5xl text-subtle">0{i + 1}</p>
            <p className="label mt-6">{t(a as 'how1')}</p>
            <p className="mt-2 text-sm text-muted">{t(b as 'how1t')}</p>
          </div>
        ))}
      </div>

      <div className="mt-20 max-w-3xl">
        {loading || app.loading ? (
          <Loading />
        ) : !me ? (
          <div className="space-y-6">
            <Notice>{t('signInFirst')}</Notice>
            <div className="flex gap-3">
              <Link href="/register?next=/sell" className="label bg-ink px-8 py-4 text-canvas">{ta('register')}</Link>
              <Link href="/login?next=/sell" className="label border border-ink px-8 py-4">{ta('signIn')}</Link>
            </div>
          </div>
        ) : s && s.status === 'PENDING' ? (
          <Notice>{t('pending')}</Notice>
        ) : s && (s.status === 'APPROVED' || s.status === 'SUSPENDED') ? (
          <div className="space-y-6">
            <Notice tone={s.status === 'SUSPENDED' ? 'danger' : 'default'}>{s.status === 'SUSPENDED' ? t('suspended', { reason: s.statusReason ?? '' }) : t('approved')}</Notice>
            <Link href="/seller" className="label inline-block bg-ink px-8 py-4 text-canvas">{t('goHub')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-8">
            <h2 className="font-display text-4xl">{t('form')}</h2>
            {s?.status === 'REJECTED' && <Notice tone="danger">{t('rejected', { reason: s.statusReason ?? '' })}</Notice>}
            <I18nInput label={t('storeName')} value={f.storeName} onChange={(v) => setF({ ...f, storeName: v })} required />
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={t('ownerName')}><Input required value={f.ownerName} onChange={set('ownerName')} /></Field>
              <Field label={ta('phone')}><Input required value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="01xxxxxxxxx" /></Field>
              <Field label={ta('email')}><Input required type="email" value={f.email} onChange={set('email')} /></Field>
              <Field label={t('taxNumber')} hint={tc('optional')}><Input value={f.taxNumber} onChange={set('taxNumber')} /></Field>
            </div>
            <Field label={t('businessAddress')}><Input required value={f.businessAddress} onChange={set('businessAddress')} /></Field>
            <Field label={t('instapay')}><Input required value={f.instapayHandle} onChange={set('instapayHandle')} placeholder="name@instapay" /></Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={`${t('nationalId')} *`}><FileInput value={f.nationalIdFile} onChange={(u) => setF({ ...f, nationalIdFile: u })} /></Field>
              <Field label={t('commercialRegister')} hint={tc('optional')}><FileInput value={f.commercialRegisterFile} onChange={(u) => setF({ ...f, commercialRegisterFile: u })} /></Field>
            </div>
            <I18nInput label={t('description')} value={f.description} onChange={(v) => setF({ ...f, description: v })} textarea />
            <p className="text-sm text-muted">{t('agree')} <Link href="/pages/seller-agreement" className="underline">↗</Link></p>
            <ErrorText error={error} />
            <Button size="lg" loading={busy} disabled={!f.nationalIdFile}>{t('submit')}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
