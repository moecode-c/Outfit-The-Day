'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, post, put } from '@/lib/api';
import { tx } from '@/lib/format';
import { Button, Check, ErrorText, Field, Input, Select, useAction } from '../ui';

let govCache: any[] | null = null;
export function useGovernorates() {
  const [govs, setGovs] = useState<any[]>(govCache ?? []);
  useEffect(() => {
    if (govCache) return;
    api<any[]>('/geo/governorates').then((g) => {
      govCache = g;
      setGovs(g);
    });
  }, []);
  return govs;
}

export function AddressForm({ initial, onSaved, onCancel }: { initial?: any; onSaved: (a: any) => void; onCancel?: () => void }) {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const ta = useTranslations('auth');
  const locale = useLocale();
  const govs = useGovernorates();
  const { busy, error, run } = useAction();
  const [f, setF] = useState<any>({
    label: '', fullName: '', phone: '', city: '', area: '', street: '', building: '', notes: '', isDefault: false,
    ...initial,
    governorate: initial?.governorate?._id ?? initial?.governorate ?? '',
  });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const gov = govs.find((g) => g._id === f.governorate);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { label: f.label, fullName: f.fullName, phone: f.phone, governorate: f.governorate, city: f.city, area: f.area, street: f.street, building: f.building, notes: f.notes, isDefault: f.isDefault };
    void run(async () => onSaved(initial?._id ? await put(`/account/addresses/${initial._id}`, body) : await post('/account/addresses', body)));
  };

  return (
    <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
      <Field label={t('fullName')}><Input required value={f.fullName} onChange={set('fullName')} autoComplete="name" /></Field>
      <Field label={t('label')}><Input value={f.label} onChange={set('label')} /></Field>
      <Field label={ta('phone')}><Input required value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="01xxxxxxxxx" autoComplete="tel" /></Field>
      <Field label={t('governorate')}>
        <Select required value={f.governorate} onChange={(e) => setF({ ...f, governorate: e.target.value, city: '' })}>
          <option value="" />
          {govs.map((g) => <option key={g._id} value={g._id}>{tx(g.name, locale)}</option>)}
        </Select>
      </Field>
      <Field label={t('city')}>
        <Input required value={f.city} onChange={set('city')} list="otd-cities" />
        <datalist id="otd-cities">{(gov?.cities ?? []).map((c: string) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label={t('area')}><Input value={f.area} onChange={set('area')} /></Field>
      <Field label={t('street')} className="sm:col-span-2"><Input required value={f.street} onChange={set('street')} autoComplete="street-address" /></Field>
      <Field label={t('building')}><Input value={f.building} onChange={set('building')} /></Field>
      <Field label={t('deliveryNotes')}><Input value={f.notes} onChange={set('notes')} /></Field>
      <Check className="sm:col-span-2" label={t('makeDefault')} checked={f.isDefault} onChange={(v) => setF({ ...f, isDefault: v })} />
      <div className="sm:col-span-2"><ErrorText error={error} /></div>
      <div className="flex gap-3 sm:col-span-2">
        <Button loading={busy}>{tc('save')}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{tc('cancel')}</Button>}
      </div>
    </form>
  );
}

export function AddressText({ a }: { a: any }) {
  const locale = useLocale();
  if (!a) return null;
  return (
    <div className="text-sm leading-relaxed">
      <p className="font-medium">{a.fullName}{a.label ? ` · ${a.label}` : ''}</p>
      <p className="text-muted">{[a.building, a.street, a.area, a.city].filter(Boolean).join(', ')}</p>
      <p className="text-muted">{tx(a.governorateName ?? a.governorate?.name, locale)} · {a.phone}</p>
      {a.notes && <p className="text-muted italic">{a.notes}</p>}
    </div>
  );
}
