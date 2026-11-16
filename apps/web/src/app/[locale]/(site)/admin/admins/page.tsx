'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, Check, ErrorText, Field, Input, Loading, Modal, toast, useAction, useLoad } from '@/components/ui';
import { api, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/store';

const AREAS = ['sellers', 'products', 'catalog', 'orders', 'users', 'coupons', 'finance', 'settings', 'content', 'reports'];

export default function AdminAdmins() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { me } = useAuth();
  const { data, loading, reload } = useLoad<any>(() => api('/admin/users?role=ADMIN&limit=100'), []);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle actions={<Button size="sm" onClick={() => setEditing({})}>{t('newAdmin')}</Button>}>{t('admins')}</PageTitle>
      {loading && !data ? <Loading /> : (
        <Table head={['Name', 'Email', t('perms'), '']} empty={!data?.items.length}>
          {data?.items.map((u: any) => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td className="text-xs">{(u.adminPerms ?? []).join(', ')}</td>
              <td className="text-end">{u._id !== me?.id && <button className="label underline" onClick={() => setEditing(u)}>{tc('edit')}</button>}</td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <AdminModal u={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(tc('done')); reload(); }} />}
    </>
  );
}

function AdminModal({ u, onClose, onSaved }: { u: any; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const ta = useTranslations('auth');
  const [perms, setPerms] = useState<string[]>(u.adminPerms ?? []);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const { busy, error, run } = useAction();
  const all = perms.includes('*');
  return (
    <Modal open onClose={onClose} title={u._id ? u.name : t('newAdmin')}>
      <div className="space-y-5">
        {!u._id && (
          <>
            <Field label={ta('name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label={ta('email')} hint="An existing account with this email is promoted."><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label={ta('password')} hint={ta('passwordHint')}><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </>
        )}
        <div>
          <p className="label mb-3">{t('perms')}</p>
          <Check label="* (super admin)" checked={all} onChange={(v) => setPerms(v ? ['*'] : [])} />
          {!all && <div className="mt-3 grid grid-cols-2 gap-2">{AREAS.map((a) => <Check key={a} label={a} checked={perms.includes(a)} onChange={(v) => setPerms(v ? [...perms, a] : perms.filter((x) => x !== a))} />)}</div>}
        </div>
        <ErrorText error={error} />
        <div className="flex justify-between gap-3">
          {u._id ? <Button variant="ghost" onClick={() => confirm(`${t('revoke')}?`) && run(async () => { await patch(`/admin/admins/${u._id}`, { perms: [], revoke: true }); onSaved(); })}>{t('revoke')}</Button> : <span />}
          <Button loading={busy} disabled={!perms.length} onClick={() => run(async () => {
            if (u._id) await patch(`/admin/admins/${u._id}`, { perms });
            else await post('/admin/admins', { ...f, perms });
            onSaved();
          })}>{tc('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
