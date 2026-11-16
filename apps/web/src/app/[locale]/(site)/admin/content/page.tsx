'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Button, Check, ErrorText, Field, I18nInput, ImagesInput, Input, Loading, Modal, Select, useAction, useLoad } from '@/components/ui';
import { api, del, patch, post, put } from '@/lib/api';
import { tx } from '@/lib/format';

export default function AdminContent() {
  const t = useTranslations('admin');
  const [tab, setTab] = useState<'banners' | 'pages' | 'looks'>('banners');
  return (
    <>
      <PageTitle>{t('content')}</PageTitle>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'banners', label: t('banners') }, { value: 'pages', label: t('pages') }, { value: 'looks', label: t('looks') }]} />
      {tab === 'banners' && <Banners />}
      {tab === 'pages' && <Pages />}
      {tab === 'looks' && <Looks />}
    </>
  );
}

function Banners() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/banners'), []);
  const [editing, setEditing] = useState<any>(null);
  if (loading && !data) return <Loading />;
  return (
    <>
      <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setEditing({})}>{t('newBanner')}</Button></div>
      <Table head={['', t('headline'), t('placement'), t('sort'), tc('status'), '']} empty={!data?.length}>
        {data?.map((b) => (
          <tr key={b._id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <td className="w-24">{b.image && <img src={b.image} alt="" className="h-12 w-20 object-cover" />}</td>
            <td>{tx(b.title, locale)}<p className="text-xs text-muted">{b.link}</p></td>
            <td>{b.placement}</td>
            <td>{b.sort}</td>
            <td>{b.active ? <Badge tone="solid">{t('active')}</Badge> : <Badge tone="muted">off</Badge>}</td>
            <td className="whitespace-nowrap text-end">
              <button className="label me-4 underline" onClick={() => setEditing(b)}>{tc('edit')}</button>
              <button className="label text-muted underline" onClick={async () => { if (confirm(`${tc('delete')}?`)) { await del(`/admin/banners/${b._id}`); reload(); } }}>{tc('delete')}</button>
            </td>
          </tr>
        ))}
      </Table>
      {editing && <BannerModal b={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function BannerModal({ b, onClose, onSaved }: { b: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const e = { en: '', ar: '' };
  const [f, setF] = useState({ placement: b.placement ?? 'HERO', kicker: b.kicker ?? e, title: b.title ?? e, subtitle: b.subtitle ?? e, cta: b.cta ?? e, link: b.link ?? '', image: b.image ? [b.image] : ([] as string[]), sort: b.sort ?? 0, active: b.active ?? true });
  const { busy, error, run } = useAction();
  const set = (p: any) => setF({ ...f, ...p });
  return (
    <Modal open onClose={onClose} title={t('banners')} wide>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t('placement')}><Select value={f.placement} onChange={(x) => set({ placement: x.target.value })}><option value="HERO">HERO</option><option value="EDIT">EDIT</option></Select></Field>
          <Field label={t('link')}><Input value={f.link} onChange={(x) => set({ link: x.target.value })} placeholder="/women" dir="ltr" /></Field>
          <Field label={t('sort')}><Input type="number" value={f.sort} onChange={(x) => set({ sort: Number(x.target.value) })} /></Field>
        </div>
        <I18nInput label={t('kicker')} value={f.kicker} onChange={(kicker) => set({ kicker })} />
        <I18nInput label={t('headline')} value={f.title} onChange={(title) => set({ title })} required />
        <I18nInput label={t('subtitle')} value={f.subtitle} onChange={(subtitle) => set({ subtitle })} />
        <I18nInput label={t('cta')} value={f.cta} onChange={(cta) => set({ cta })} />
        <Field label={t('image')}><ImagesInput value={f.image} onChange={(image) => set({ image })} max={1} /></Field>
        <Check label={t('active')} checked={f.active} onChange={(active) => set({ active })} />
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} onClick={() => run(async () => { const body = { ...f, image: f.image[0] }; if (b._id) await put(`/admin/banners/${b._id}`, body); else await post('/admin/banners', body); onSaved(); })}>{tc('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Pages() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/pages'), []);
  const [editing, setEditing] = useState<any>(null);
  if (loading && !data) return <Loading />;
  return (
    <>
      <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setEditing({})}>{tc('add')}</Button></div>
      <Table head={[t('slug'), t('headline'), '']} empty={!data?.length}>
        {data?.map((p) => (
          <tr key={p._id}>
            <td><a href={`/${locale}/pages/${p.slug}`} target="_blank" rel="noreferrer" className="underline">/{p.slug}</a></td>
            <td>{tx(p.title, locale)}</td>
            <td className="whitespace-nowrap text-end">
              <button className="label me-4 underline" onClick={() => setEditing(p)}>{tc('edit')}</button>
              <button className="label text-muted underline" onClick={async () => { if (confirm(`${tc('delete')}?`)) { await del(`/admin/pages/${p.slug}`); reload(); } }}>{tc('delete')}</button>
            </td>
          </tr>
        ))}
      </Table>
      {editing && <PageModal p={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function PageModal({ p, onClose, onSaved }: { p: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [f, setF] = useState({ slug: p.slug ?? '', title: p.title ?? { en: '', ar: '' }, body: p.body ?? { en: '', ar: '' } });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('pages')} wide>
      <div className="space-y-5">
        <Field label={t('slug')}><Input value={f.slug} disabled={!!p._id} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} dir="ltr" /></Field>
        <I18nInput label={t('headline')} value={f.title} onChange={(title) => setF({ ...f, title })} required />
        <I18nInput label={t('body')} value={f.body} onChange={(body) => setF({ ...f, body })} textarea />
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} onClick={() => run(async () => { await put('/admin/pages', f); onSaved(); })}>{tc('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Looks() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/looks'), []);
  if (loading && !data) return <Loading />;
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {data?.map((l) => (
        <div key={l._id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.cover} alt="" className={`aspect-[3/4] w-full object-cover ${l.active ? '' : 'opacity-40'}`} />
          <p className="mt-2 text-sm">{tx(l.title, locale)}</p>
          <p className="text-xs text-muted">{tx(l.seller?.storeName, locale)}</p>
          <div className="mt-2 flex flex-col gap-2">
            <Check label={t('featured')} checked={!!l.featured} onChange={async (featured) => { await patch(`/admin/looks/${l._id}`, { featured }); reload(); }} />
            <Check label={t('active')} checked={!!l.active} onChange={async (active) => { await patch(`/admin/looks/${l._id}`, { active }); reload(); }} />
          </div>
        </div>
      ))}
    </div>
  );
}
