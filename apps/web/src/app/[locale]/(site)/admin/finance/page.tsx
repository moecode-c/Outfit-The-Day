'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { fromEgp, Section, Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { AnyStatus } from '@/components/shop/Status';
import { Button, ErrorText, Field, Input, Loading, Modal, ReasonDialog, toast, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

export default function AdminFinance() {
  const t = useTranslations('admin');
  const ts = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const ov = useLoad<any>(() => api('/admin/finance/overview'), []);
  const [invStatus, setInvStatus] = useState('');
  const inv = useLoad<any[]>(() => api(`/admin/finance/invoices?status=${invStatus}`), [invStatus]);
  const [rejecting, setRejecting] = useState<any>(null);
  const [action, setAction] = useState<null | { kind: 'cash' | 'adjust'; seller: any }>(null);
  const act = useAction();
  const reload = () => { ov.reload(); inv.reload(); };
  if (ov.loading && !ov.data) return <Loading />;
  const d = ov.data;

  return (
    <>
      <PageTitle
        actions={
          <>
            <Button size="sm" variant="outline" loading={act.busy} onClick={() => act.run(async () => { const r = await post('/admin/finance/run-billing'); toast(`${r.created ?? 0} invoices`); reload(); })}>{t('runBilling')}</Button>
            <Button size="sm" variant="ghost" onClick={() => act.run(async () => { await post('/admin/finance/enforce'); toast(tc('done')); reload(); })}>Enforce late rules</Button>
          </>
        }
      >
        {t('finance')}
      </PageTitle>
      <p className="-mt-6 mb-6 text-sm text-muted">{d.lastRun ? t('lastRun', { date: date(d.lastRun, locale, true) }) : '—'}</p>
      <ErrorText error={act.error} />

      <Section title={`${t('pendingPayments')} (${d.pendingPayments.length})`}>
        <Table head={[tc('date'), t('sellers'), ts('amount'), 'Ref', '']} empty={!d.pendingPayments.length}>
          {d.pendingPayments.map((p: any) => (
            <tr key={p._id}>
              <td className="text-muted">{date(p.createdAt, locale, true)}</td>
              <td>{tx(p.seller?.storeName, locale)}</td>
              <td>{money(p.amount, locale)}</td>
              <td dir="ltr">{p.file ? <a href={p.file} target="_blank" rel="noreferrer" className="underline">{p.referenceNo} ↗</a> : p.referenceNo}</td>
              <td className="text-end">
                <div className="flex justify-end gap-2">
                  <Button size="sm" loading={act.busy} onClick={() => act.run(async () => { await post(`/admin/finance/payments/${p._id}/confirm`); reload(); })}>{tc('confirm')}</Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(p)}>{tc('reject')}</Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title={t('balances')}>
        <Table head={[t('sellers'), tc('status'), 'Balance', '']} empty={!d.balances.length}>
          {d.balances.map((b: any) => (
            <tr key={b._id}>
              <td><Link href={`/admin/sellers/${b._id}`} className="hover:underline">{tx(b.seller?.storeName, locale)}</Link></td>
              <td><AnyStatus s={b.seller?.status ?? '—'} /></td>
              <td className={b.balance > 0 ? '' : 'text-muted'}>{b.balance < 0 ? '−' : ''}{money(Math.abs(b.balance), locale)}</td>
              <td className="whitespace-nowrap text-end">
                <button className="label me-4 underline underline-offset-4" onClick={() => setAction({ kind: 'cash', seller: b })}>{t('recordCash')}</button>
                <button className="label underline underline-offset-4" onClick={() => setAction({ kind: 'adjust', seller: b })}>±</button>
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title={ts('invoices')}>
        <Tabs value={invStatus} onChange={setInvStatus} options={[{ value: '', label: tc('all') }, ...['DUE', 'OVERDUE', 'PAID', 'CREDIT'].map((s) => ({ value: s, label: ts(`invoiceStatus.${s}` as any) }))]} />
        <Table head={['#', t('sellers'), ts('period'), ts('amountDue'), ts('paid'), ts('due'), tc('status'), '']} empty={!inv.data?.length}>
          {inv.data?.map((i) => (
            <tr key={i._id}>
              <td><Link href={`/admin/finance/invoices/${i._id}`} className="underline underline-offset-4">{i.number}</Link></td>
              <td>{tx(i.seller?.storeName, locale)}</td>
              <td className="text-muted">{date(i.periodStart, locale)} – {date(i.periodEnd, locale)}</td>
              <td>{money(i.amountDue, locale)}</td>
              <td>{money(i.paid, locale)}</td>
              <td>{date(i.dueAt, locale)}</td>
              <td><AnyStatus s={i.status} /></td>
              <td className="text-end">{['DUE', 'OVERDUE'].includes(i.status) && <button className="label underline" onClick={() => { const days = Number(prompt(t('extend'), '7')); if (days > 0) act.run(async () => { await post(`/admin/finance/invoices/${i._id}/extend`, { days }); reload(); }); }}>+{t('extend').split(' ')[0]}</button>}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <ReasonDialog open={!!rejecting} title={tc('reject')} onClose={() => setRejecting(null)} busy={act.busy} error={act.error} onSubmit={(reason) => act.run(async () => { await post(`/admin/finance/payments/${rejecting._id}/reject`, { reason }); setRejecting(null); reload(); })} />
      {action && <MoneyModal kind={action.kind} seller={action.seller} onClose={() => setAction(null)} onDone={() => { setAction(null); toast(tc('done')); reload(); }} />}
    </>
  );
}

function MoneyModal({ kind, seller, onClose, onDone }: { kind: 'cash' | 'adjust'; seller: any; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`${kind === 'cash' ? t('recordCash') : t('adjust')} · ${tx(seller.seller?.storeName, locale)}`}>
      <div className="space-y-5">
        <Field label={kind === 'cash' ? 'EGP' : t('adjust')}><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={kind === 'cash' ? t('receiptNo') : t('note')}><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <ErrorText error={error} />
        <Button loading={busy} disabled={!amount || !text} onClick={() => run(async () => {
          if (kind === 'cash') await post('/admin/finance/cash', { seller: seller._id, amount: fromEgp(amount), receiptNo: text });
          else await post('/admin/finance/adjust', { seller: seller._id, amount: fromEgp(amount), note: text });
          onDone();
        })}>{tc('save')}</Button>
      </div>
    </Modal>
  );
}
