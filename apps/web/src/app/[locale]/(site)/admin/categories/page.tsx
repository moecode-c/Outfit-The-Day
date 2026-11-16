'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Button, Check, ErrorText, Field, I18nInput, ImagesInput, Input, Loading, Modal, Select, useAction, useLoad } from '@/components/ui';
import { api, del, post, put } from '@/lib/api';
import { tx } from '@/lib/format';

const DEPTS = ['WOMEN', 'MEN', 'KIDS', 'UNISEX'];

export default function AdminCategories() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/categories'), []);
  const [editing, setEditing] = useState<any>(null);
  const roots = (data ?? []).filter((c) => !c.parent);
  const rows = roots.flatMap((r) => [r, ...(data ?? []).filter((c) => String(c.parent) === String(r._id))]);
  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{t('newCategory')}</Button>}>{t('categories')}</PageTitle>
      {loading && !data ? <Loading /> : (
        <Table head={[t('categories'), t('slug'), t('departments'), 'Comm. %', t('returnable'), tc('status'), '']} empty={!rows.length}>
          {rows.map((c) => (
            <tr key={c._id}>
              <td className={c.parent ? 'ps-6 text-muted' : 'font-medium'}>{c.parent && '— '}{tx(c.name, locale)}</td>
              <td className="text-muted">{c.slug}</td>
              <td className="text-xs">{c.departments.join(', ')}</td>
              <td>{c.commissionRate ?? '—'}</td>
              <td>{c.returnable ? '✓' : '✕'}</td>
              <td>{c.active ? <Badge tone="solid">{t('active')}</Badge> : <Badge tone="muted">off</Badge>}</td>
              <td className="whitespace-nowrap text-end">
                <button className="label me-4 underline underline-offset-4" onClick={() => setEditing(c)}>{tc('edit')}</button>
                <button className="label text-muted underline underline-offset-4" onClick={async () => { if (confirm(`${tc('delete')}?`)) { try { await del(`/admin/categories/${c._id}`); reload(); } catch (e: any) { alert(e.message); } } }}>{tc('delete')}</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <CategoryModal c={editing} roots={roots} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function CategoryModal({ c, roots, onClose, onSaved }: { c: any; roots: any[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [f, setF] = useState({
    name: c.name ?? { en: '', ar: '' }, slug: c.slug ?? '', parent: c.parent ? String(c.parent) : '', departments: (c.departments ?? ['WOMEN']) as string[],
    image: c.image ? [c.image] : ([] as string[]), sort: c.sort ?? 0, active: c.active ?? true, returnable: c.returnable ?? true, commissionRate: c.commissionRate ?? '',
  });
  const { busy, error, run } = useAction();
  const set = (p: any) => setF({ ...f, ...p });
  return (
    <Modal open onClose={onClose} title={c._id ? tx(c.name, locale) : t('newCategory')} wide>
      <div className="space-y-5">
        <I18nInput label={t('categories')} value={f.name} onChange={(name) => set({ name })} required />
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t('slug')}><Input value={f.slug} onChange={(e) => set({ slug: e.target.value })} dir="ltr" /></Field>
          <Field label={t('parent')}>
            <Select value={f.parent} onChange={(e) => set({ parent: e.target.value })}>
              <option value="">{tc('none')}</option>
              {roots.filter((r) => r._id !== c._id).map((r) => <option key={r._id} value={r._id}>{tx(r.name, locale)}</option>)}
            </Select>
          </Field>
          <Field label={t('sort')}><Input type="number" value={f.sort} onChange={(e) => set({ sort: Number(e.target.value) })} /></Field>
        </div>
        <div>
          <p className="label mb-3">{t('departments')}</p>
          <div className="flex flex-wrap gap-6">{DEPTS.map((d) => <Check key={d} label={d} checked={f.departments.includes(d)} onChange={(v) => set({ departments: v ? [...f.departments, d] : f.departments.filter((x) => x !== d) })} />)}</div>
        </div>
        <Field label={t('commissionOverride')} hint="Empty = platform default"><Input type="number" min={0} max={100} step="0.5" value={f.commissionRate} onChange={(e) => set({ commissionRate: e.target.value })} className="max-w-40" /></Field>
        <Field label={t('image')}><ImagesInput value={f.image} onChange={(image) => set({ image })} max={1} /></Field>
        <div className="flex gap-8">
          <Check label={t('active')} checked={f.active} onChange={(active) => set({ active })} />
          <Check label={t('returnable')} checked={f.returnable} onChange={(returnable) => set({ returnable })} />
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} disabled={!f.departments.length} onClick={() => run(async () => {
            const body = { ...f, parent: f.parent || null, slug: f.slug || undefined, image: f.image[0], commissionRate: f.commissionRate === '' ? null : Number(f.commissionRate) };
            if (c._id) await put(`/admin/categories/${c._id}`, body);
            else await post('/admin/categories', body);
            onSaved();
          })}>{tc('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
