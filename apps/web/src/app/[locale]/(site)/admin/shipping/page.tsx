'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { egpInput, fromEgp, Table } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Button, Check, ErrorText, Field, I18nInput, Input, Loading, Modal, Textarea, useAction, useLoad } from '@/components/ui';
import { api, post, put } from '@/lib/api';
import { money, tx } from '@/lib/format';

export default function AdminShipping() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/governorates'), []);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{tc('add')}</Button>}>{t('shipping')}</PageTitle>
      <p className="-mt-6 mb-8 max-w-2xl text-sm text-muted">Default delivery fee per governorate. Brands can override these in their store settings.</p>
      {loading && !data ? <Loading /> : (
        <Table head={['Governorate', t('fee'), 'Days', t('cities'), tc('status'), '']} empty={!data?.length}>
          {data?.map((g) => (
            <tr key={g._id}>
              <td>{tx(g.name, locale)}</td>
              <td>{money(g.shippingFee, locale)}</td>
              <td>{g.etaDays}</td>
              <td className="max-w-xs truncate text-xs text-muted">{g.cities.join(', ')}</td>
              <td>{g.active ? <Badge tone="solid">{t('active')}</Badge> : <Badge tone="muted">off</Badge>}</td>
              <td className="text-end"><button className="label underline" onClick={() => setEditing(g)}>{tc('edit')}</button></td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <GovModal g={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function GovModal({ g, onClose, onSaved }: { g: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [f, setF] = useState({ name: g.name ?? { en: '', ar: '' }, fee: egpInput(g.shippingFee ?? 6000), etaDays: g.etaDays ?? 3, cities: (g.cities ?? []).join(', '), active: g.active ?? true, sort: g.sort ?? 0 });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('shipping')}>
      <div className="space-y-5">
        <I18nInput label="Governorate" value={f.name} onChange={(name) => setF({ ...f, name })} required />
        <div className="grid grid-cols-3 gap-4">
          <Field label={t('fee')}><Input type="number" step="0.01" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
          <Field label="Days"><Input type="number" value={f.etaDays} onChange={(e) => setF({ ...f, etaDays: Number(e.target.value) })} /></Field>
          <Field label={t('sort')}><Input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} /></Field>
        </div>
        <Field label={t('cities')}><Textarea rows={3} value={f.cities} onChange={(e) => setF({ ...f, cities: e.target.value })} /></Field>
        <Check label={t('active')} checked={f.active} onChange={(active) => setF({ ...f, active })} />
        <ErrorText error={error} />
        <Button loading={busy} onClick={() => run(async () => {
          const body = { name: f.name, shippingFee: fromEgp(f.fee) ?? 0, etaDays: f.etaDays, cities: f.cities.split(',').map((c: string) => c.trim()).filter(Boolean), active: f.active, sort: f.sort };
          if (g._id) await put(`/admin/governorates/${g._id}`, body);
          else await post('/admin/governorates', body);
          onSaved();
        })}>{tc('save')}</Button>
      </div>
    </Modal>
  );
}
