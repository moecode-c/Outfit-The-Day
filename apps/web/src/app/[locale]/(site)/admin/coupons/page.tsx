'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { egpInput, fromEgp, Table } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Button, Check, ErrorText, Field, Input, Loading, Modal, Radio, Select, useAction, useLoad } from '@/components/ui';
import { api, del, post, put } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

export default function AdminCoupons() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/coupons'), []);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{t('newCoupon')}</Button>}>{t('coupons')}</PageTitle>
      <p className="-mt-6 mb-8 max-w-2xl text-sm text-muted">Coupons are funded by OTD: each brand’s share is credited against the commission it owes.</p>
      {loading && !data ? <Loading /> : (
        <Table head={[t('code'), t('value'), t('scope'), t('used'), `${tc('from')} – ${tc('to')}`, tc('status'), '']} empty={!data?.length}>
          {data?.map((c) => (
            <tr key={c._id}>
              <td className="font-medium">{c.code}</td>
              <td>{c.type === 'PERCENT' ? `${c.value}%` : money(c.value, locale)}{c.maxDiscount ? <span className="text-xs text-muted"> ≤ {money(c.maxDiscount, locale)}</span> : null}</td>
              <td>{c.scope === 'GLOBAL' ? t('global').split(' ')[0] : c.sellers.map((s: any) => tx(s.storeName, locale)).join(', ')}</td>
              <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
              <td className="text-muted">{c.startsAt ? date(c.startsAt, locale) : '—'} – {c.endsAt ? date(c.endsAt, locale) : '—'}</td>
              <td>{c.active ? <Badge tone="solid">{t('active')}</Badge> : <Badge tone="muted">off</Badge>}</td>
              <td className="whitespace-nowrap text-end">
                <button className="label me-4 underline underline-offset-4" onClick={() => setEditing(c)}>{tc('edit')}</button>
                <button className="label text-muted underline underline-offset-4" onClick={async () => { if (confirm(`${tc('delete')} ${c.code}?`)) { await del(`/admin/coupons/${c._id}`); reload(); } }}>{tc('delete')}</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <CouponModal c={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function CouponModal({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const sellers = useLoad<any[]>(() => api('/admin/sellers?status=APPROVED'), []);
  const d = (x?: string) => (x ? new Date(x).toISOString().slice(0, 10) : '');
  const [f, setF] = useState({
    code: c.code ?? '', type: c.type ?? 'PERCENT', value: c.type === 'FIXED' ? egpInput(c.value) : String(c.value ?? ''),
    maxDiscount: egpInput(c.maxDiscount), minOrder: egpInput(c.minOrder), usageLimit: c.usageLimit ?? '', perCustomerLimit: c.perCustomerLimit ?? '',
    startsAt: d(c.startsAt), endsAt: d(c.endsAt), newCustomersOnly: !!c.newCustomersOnly, excludesDiscounted: !!c.excludesDiscounted,
    scope: c.scope ?? 'GLOBAL', sellers: (c.sellers ?? []).map((s: any) => String(s._id ?? s)) as string[], active: c.active ?? true,
  });
  const { busy, error, run } = useAction();
  const set = (p: any) => setF({ ...f, ...p });
  const num = (v: any) => (v === '' || v == null ? null : Number(v));
  return (
    <Modal open onClose={onClose} title={c._id ? c.code : t('newCoupon')} wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('code')}><Input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('type')}><Select value={f.type} onChange={(e) => set({ type: e.target.value })}><option value="PERCENT">{t('percent')}</option><option value="FIXED">{t('fixed')}</option></Select></Field>
          <Field label={t('value')}><Input type="number" step="0.01" value={f.value} onChange={(e) => set({ value: e.target.value })} /></Field>
        </div>
        <Field label={t('maxDiscount')}><Input type="number" value={f.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} /></Field>
        <Field label={t('minOrder')}><Input type="number" value={f.minOrder} onChange={(e) => set({ minOrder: e.target.value })} /></Field>
        <Field label={t('usageLimit')}><Input type="number" value={f.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} /></Field>
        <Field label={t('perCustomer')}><Input type="number" value={f.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} /></Field>
        <Field label={tc('from')}><Input type="date" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
        <Field label={tc('to')}><Input type="date" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></Field>
        <div className="space-y-3 sm:col-span-2">
          <Check label={t('newCustomersOnly')} checked={f.newCustomersOnly} onChange={(v) => set({ newCustomersOnly: v })} />
          <Check label={t('excludesDiscounted')} checked={f.excludesDiscounted} onChange={(v) => set({ excludesDiscounted: v })} />
          <Check label={t('active')} checked={f.active} onChange={(v) => set({ active: v })} />
        </div>
        <div className="space-y-3 sm:col-span-2">
          <p className="label">{t('scope')}</p>
          <Radio label={t('global')} checked={f.scope === 'GLOBAL'} onChange={() => set({ scope: 'GLOBAL' })} />
          <Radio label={t('local')} checked={f.scope === 'SELLERS'} onChange={() => set({ scope: 'SELLERS' })} />
          {f.scope === 'SELLERS' && (
            <div className="grid gap-2 ps-8 sm:grid-cols-2">
              {(sellers.data ?? []).map((s) => (
                <Check key={s._id} label={tx(s.storeName, locale)} checked={f.sellers.includes(s._id)} onChange={(v) => set({ sellers: v ? [...f.sellers, s._id] : f.sellers.filter((x) => x !== s._id) })} />
              ))}
            </div>
          )}
        </div>
      </div>
      <ErrorText error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
        <Button loading={busy} onClick={() => run(async () => {
          const body = {
            code: f.code, type: f.type, value: f.type === 'FIXED' ? fromEgp(f.value) : Number(f.value),
            maxDiscount: fromEgp(f.maxDiscount), minOrder: fromEgp(f.minOrder), usageLimit: num(f.usageLimit), perCustomerLimit: num(f.perCustomerLimit),
            startsAt: f.startsAt || null, endsAt: f.endsAt ? `${f.endsAt}T23:59:59` : null,
            newCustomersOnly: f.newCustomersOnly, excludesDiscounted: f.excludesDiscounted, scope: f.scope, sellers: f.scope === 'SELLERS' ? f.sellers : [], active: f.active,
          };
          if (c._id) await put(`/admin/coupons/${c._id}`, body);
          else await post('/admin/coupons', body);
          onSaved();
        })}>{tc('save')}</Button>
      </div>
    </Modal>
  );
}
