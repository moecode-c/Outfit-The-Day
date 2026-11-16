'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, Check, Empty, ErrorText, Field, I18nInput, ImagesInput, Loading, Modal, useAction, useLoad } from '@/components/ui';
import { api, del, post, put } from '@/lib/api';
import { cx, firstImage, tx } from '@/lib/format';

export default function SellerLooks() {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<any[]>(() => api('/seller/looks'), []);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{t('newLook')}</Button>}>{t('looks')}</PageTitle>
      {loading && !data ? <Loading /> : !data?.length ? <Empty>{tc('empty')}</Empty> : (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {data.map((l) => (
            <div key={l._id} className="group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.cover} alt="" className={cx('aspect-[3/4] w-full object-cover', !l.active && 'opacity-40')} />
              <p className="mt-3 font-display text-xl">{tx(l.title, locale)}</p>
              <p className="text-xs text-muted">{l.products.length} · {l.featured ? '★' : ''}</p>
              <div className="mt-2 flex gap-4">
                <button className="label underline underline-offset-4" onClick={() => setEditing(l)}>{tc('edit')}</button>
                <button className="label text-muted underline underline-offset-4" onClick={async () => { if (confirm(`${tc('delete')}?`)) { await del(`/seller/looks/${l._id}`); reload(); } }}>{tc('delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <LookModal look={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function LookModal({ look, onClose, onSaved }: { look: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const products = useLoad<any>(() => api('/seller/products?status=LIVE&limit=100'), []);
  const [f, setF] = useState({
    title: look.title ?? { en: '', ar: '' },
    description: look.description ?? { en: '', ar: '' },
    cover: look.cover ? [look.cover] : ([] as string[]),
    products: (look.products ?? []).map((p: any) => String(p._id ?? p)) as string[],
    active: look.active ?? true,
  });
  const { busy, error, run } = useAction();
  const toggle = (id: string) => setF({ ...f, products: f.products.includes(id) ? f.products.filter((x) => x !== id) : f.products.length < 8 ? [...f.products, id] : f.products });
  return (
    <Modal open onClose={onClose} title={look._id ? tc('edit') : t('newLook')} wide>
      <div className="space-y-6">
        <I18nInput label={t('lookTitle')} value={f.title} onChange={(title) => setF({ ...f, title })} required />
        <I18nInput label={t('description')} value={f.description} onChange={(description) => setF({ ...f, description })} textarea />
        <Field label={t('cover')}><ImagesInput value={f.cover} onChange={(cover) => setF({ ...f, cover })} max={1} /></Field>
        <Field label={`${t('pickProducts')} (${f.products.length})`}>
          {products.loading ? <Loading /> : (
            <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {(products.data?.items ?? []).map((p: any) => (
                <button key={p._id} type="button" onClick={() => toggle(p._id)} className={cx('relative border-2 text-start', f.products.includes(p._id) ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={firstImage(p)} alt="" className="aspect-[3/4] w-full object-cover" />
                  <span className="line-clamp-1 block p-1 text-[10px]">{tx(p.title, locale)}</span>
                </button>
              ))}
            </div>
          )}
        </Field>
        <Check label={tc('status') + ': ✓'} checked={f.active} onChange={(active) => setF({ ...f, active })} />
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} disabled={!f.cover.length || f.products.length < 2} onClick={() => run(async () => {
            const body = { ...f, cover: f.cover[0] };
            if (look._id) await put(`/seller/looks/${look._id}`, body);
            else await post('/seller/looks', body);
            onSaved();
          })}>{tc('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
