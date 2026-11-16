'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageTitle } from '@/components/shop/PanelShell';
import { SizeGuideTable } from '@/components/shop/ProductView';
import { Button, Empty, ErrorText, Field, I18nInput, Input, Loading, Modal, Select, useAction, useLoad } from '@/components/ui';
import { api, del, post, put } from '@/lib/api';

export default function SizeGuides() {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const { data, loading, reload } = useLoad<any[]>(() => api('/seller/size-guides'), []);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{t('newGuide')}</Button>}>{t('sizeGuides')}</PageTitle>
      {loading && !data ? <Loading /> : !data?.length ? <Empty>{tc('empty')}</Empty> : (
        <div className="space-y-10">
          {data.map((g) => (
            <div key={g._id}>
              <div className="mb-3 flex items-center justify-between">
                <p className="label">{g.name} · {g.unit}</p>
                <div className="flex gap-4">
                  <button className="label underline underline-offset-4" onClick={() => setEditing(g)}>{tc('edit')}</button>
                  <button className="label text-muted underline underline-offset-4" onClick={async () => { if (confirm(`${tc('delete')}?`)) { await del(`/seller/size-guides/${g._id}`); reload(); } }}>{tc('delete')}</button>
                </div>
              </div>
              <SizeGuideTable guide={g} />
            </div>
          ))}
        </div>
      )}
      {editing && <GuideModal guide={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function GuideModal({ guide, onClose, onSaved }: { guide: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const [name, setName] = useState(guide.name ?? '');
  const [unit, setUnit] = useState(guide.unit ?? 'cm');
  const [cols, setCols] = useState<string[]>(guide.columns ?? ['Size', 'Bust', 'Waist', 'Hips']);
  const [rows, setRows] = useState<string[][]>(guide.rows ?? [['S', '', '', ''], ['M', '', '', ''], ['L', '', '', '']]);
  const [notes, setNotes] = useState(guide.notes ?? { en: '', ar: '' });
  const { busy, error, run } = useAction();
  const setCell = (r: number, c: number, v: string) => setRows(rows.map((row, i) => (i === r ? row.map((x, k) => (k === c ? v : x)) : row)));
  return (
    <Modal open onClose={onClose} title={guide._id ? tc('edit') : t('newGuide')} wide>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label={t('guideName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('unit')}><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option>cm</option><option>in</option></Select></Field>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={i} className="p-1">
                    <Input value={c} onChange={(e) => setCols(cols.map((x, k) => (k === i ? e.target.value : x)))} className="min-w-20 font-medium" />
                    {cols.length > 1 && <button className="text-xs text-muted" onClick={() => { setCols(cols.filter((_, k) => k !== i)); setRows(rows.map((r) => r.filter((_, k) => k !== i))); }}>✕</button>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {cols.map((_, ci) => <td key={ci} className="p-1"><Input value={r[ci] ?? ''} onChange={(e) => setCell(ri, ci, e.target.value)} className="min-w-20" /></td>)}
                  <td><button className="px-2 text-muted" onClick={() => setRows(rows.filter((_, k) => k !== ri))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4">
          <button className="label underline underline-offset-4" onClick={() => setRows([...rows, cols.map(() => '')])}>+ {t('addRow')}</button>
          {cols.length < 12 && <button className="label underline underline-offset-4" onClick={() => { setCols([...cols, '']); setRows(rows.map((r) => [...r, ''])); }}>+ {t('addColumn')}</button>}
        </div>
        <I18nInput label={tc('notes')} value={notes} onChange={setNotes} textarea />
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} onClick={() => run(async () => {
            const body = { name, unit, columns: cols, rows, notes };
            if (guide._id) await put(`/seller/size-guides/${guide._id}`, body);
            else await post('/seller/size-guides', body);
            onSaved();
          })}>{tc('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
