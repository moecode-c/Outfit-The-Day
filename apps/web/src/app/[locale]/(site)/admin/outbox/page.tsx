'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageTitle } from '@/components/shop/PanelShell';
import { Badge, Empty, Loading, Modal, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

/** Emails are stored here (and sent too when SMTP is configured) — handy before email is set up. */
export default function Outbox() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, loading } = useLoad<any[]>(() => api('/admin/outbox'), []);
  const [open, setOpen] = useState<any>(null);
  return (
    <>
      <PageTitle>{t('outbox')}</PageTitle>
      {loading && !data ? <Loading /> : !data?.length ? <Empty>{tc('empty')}</Empty> : (
        <ul className="divide-y divide-line border-y border-line">
          {data.map((m) => (
            <li key={m._id}>
              <button className="flex w-full items-center gap-4 py-4 text-start text-sm hover:bg-wash" onClick={() => setOpen(m)}>
                <span className="w-40 shrink-0 text-muted">{date(m.createdAt, locale, true)}</span>
                <span className="w-56 shrink-0 truncate">{m.to}</span>
                <span className="flex-1 truncate">{m.subject}</span>
                {m.sent ? <Badge tone="solid">sent</Badge> : m.error ? <Badge tone="danger">error</Badge> : <Badge tone="muted">stored</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject} wide>
        {open && <iframe title="email" srcDoc={open.html} sandbox="" className="h-[70vh] w-full border border-line bg-white" />}
      </Modal>
    </>
  );
}
