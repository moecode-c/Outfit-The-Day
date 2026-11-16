'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddressForm, AddressText } from '@/components/shop/AddressForm';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Button, Empty, Loading, Modal, toast, useLoad } from '@/components/ui';
import { api, del, put } from '@/lib/api';

export default function AddressesPage() {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const { data, loading, reload } = useLoad<any[]>(() => api('/account/addresses'), []);
  const [editing, setEditing] = useState<any>(null);

  const makeDefault = async (a: any) => {
    const { label, fullName, phone, city, area, street, building, notes } = a;
    await put(`/account/addresses/${a._id}`, { label, fullName, phone, city, area, street, building, notes, governorate: a.governorate?._id ?? a.governorate, isDefault: true });
    reload();
  };

  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{tc('add')}</Button>}>{t('addresses')}</PageTitle>
      {loading ? <Loading /> : !data?.length ? <Empty>{t('noAddresses')}</Empty> : (
        <div className="grid gap-6 md:grid-cols-2">
          {data.map((a) => (
            <div key={a._id} className="border border-line p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="label">{a.label || a.fullName}</p>
                {a.isDefault && <Badge tone="solid">{t('default')}</Badge>}
              </div>
              <AddressText a={a} />
              <div className="mt-6 flex flex-wrap gap-4">
                <button className="label underline underline-offset-4" onClick={() => setEditing(a)}>{tc('edit')}</button>
                {!a.isDefault && <button className="label underline underline-offset-4" onClick={() => makeDefault(a)}>{t('makeDefault')}</button>}
                <button className="label text-muted underline underline-offset-4" onClick={async () => { if (confirm(tc('delete') + '?')) { await del(`/account/addresses/${a._id}`); reload(); } }}>{tc('delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('addresses')} wide>
        {editing && (
          <AddressForm
            initial={editing._id ? editing : undefined}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); toast(t('saved')); reload(); }}
          />
        )}
      </Modal>
    </>
  );
}
