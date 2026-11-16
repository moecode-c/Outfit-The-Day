'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { ReturnStatus } from '@/components/shop/Status';
import { Button, Check, Empty, ErrorText, Loading, Modal, Textarea, useAction, useLoad } from '@/components/ui';
import { api, post } from '@/lib/api';
import { date, tx } from '@/lib/format';

export default function AdminReturns() {
  const t = useTranslations('admin');
  const tr = useTranslations('returns');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [tab, setTab] = useState('flagged');
  const { data, loading, reload } = useLoad<any[]>(() => api(`/admin/returns?${tab === 'flagged' ? 'flagged=true' : `status=${tab}`}`), [tab]);
  const [noting, setNoting] = useState<any>(null);
  return (
    <>
      <PageTitle>{t('returns')}</PageTitle>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'flagged', label: t('flagged') }, { value: '', label: tc('all') }, ...['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED'].map((s) => ({ value: s, label: tr(`status.${s}` as any) }))]} />
      {loading && !data ? <Loading /> : !data?.length ? <Empty>{tc('empty')}</Empty> : (
        <div className="divide-y divide-line border-y border-line">
          {data.map((r) => (
            <div key={r._id} className="py-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p><span className="label">{r.number}</span> · {tx(r.seller?.storeName, locale)} · {r.customer?.name} <span className="text-muted">({r.customer?.email})</span></p>
                <div className="flex items-center gap-2">
                  {r.flagged && <span className="label text-danger">{t('flagged')}</span>}
                  {r.disputed && <span className="label">{tr('disputed')}</span>}
                  <ReturnStatus s={r.status} />
                </div>
              </div>
              <p className="mt-2 text-muted">{date(r.createdAt, locale)} · {tr(`reasons.${r.reason}` as any)}{r.details && ` — “${r.details}”`}</p>
              {r.rejectReason && <p className="mt-1">Rejected: {r.rejectReason}</p>}
              {r.events?.filter((e: any) => ['DISPUTED', 'FLAGGED'].includes(e.status)).map((e: any, k: number) => <p key={k} className="mt-1 text-muted">{e.status}: {e.note}</p>)}
              {!!r.photos?.length && <div className="mt-3 flex gap-2">{r.photos.map((p: string) => <a key={p} href={p} target="_blank" rel="noreferrer" className="underline">photo ↗</a>)}</div>}
              {r.adminNote && <p className="mt-2 italic">Note: {r.adminNote}</p>}
              <button className="label mt-3 underline underline-offset-4" onClick={() => setNoting(r)}>{t('addNote')}</button>
            </div>
          ))}
        </div>
      )}
      {noting && <NoteModal r={noting} onClose={() => setNoting(null)} onDone={() => { setNoting(null); reload(); }} />}
    </>
  );
}

function NoteModal({ r, onClose, onDone }: { r: any; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('admin');
  const [note, setNote] = useState(r.adminNote ?? '');
  const [resolve, setResolve] = useState(r.flagged);
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`${t('addNote')} · ${r.number}`}>
      <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-4"><Check label={t('resolve')} checked={resolve} onChange={setResolve} /></div>
      <p className="mt-2 text-xs text-muted">The customer and the brand are both notified.</p>
      <ErrorText error={error} />
      <Button className="mt-6" loading={busy} disabled={!note.trim()} onClick={() => run(async () => { await post(`/admin/returns/${r._id}/note`, { note, resolve }); onDone(); })}>{t('addNote')}</Button>
    </Modal>
  );
}
