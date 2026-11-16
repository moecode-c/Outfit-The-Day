'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { fromEgp, Section, Stat, Stats, Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { AnyStatus } from '@/components/shop/Status';
import { Button, ErrorText, Field, FileInput, Input, Loading, Modal, Select, toast, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { date, money } from '@/lib/format';

export default function SellerFinance() {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data: d, loading, reload } = useLoad<any>(() => api('/seller/finance'), []);
  const [tab, setTab] = useState<'invoices' | 'statement' | 'payments'>('invoices');
  const [paying, setPaying] = useState(false);
  if (loading && !d) return <Loading />;
  if (!d) return null;
  const owed = d.balance > 0;
  return (
    <>
      <PageTitle actions={owed && <Button size="sm" onClick={() => setPaying(true)}>{t('payCommission')}</Button>}>{t('finance')}</PageTitle>
      <Stats>
        <Stat label={d.balance < 0 ? t('credit') : t('balance')} value={money(Math.abs(d.balance), locale)} />
        <Stat label={t('commissionTotal')} value={money(d.totals.commission, locale)} />
        <Stat label={t('couponCredits')} value={money(d.totals.couponCredits, locale)} />
        <Stat label={t('paid')} value={money(d.totals.paid, locale)} hint={`${t('reversals')}: ${money(d.totals.reversals, locale)}`} />
      </Stats>

      <Section title="">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'invoices', label: t('invoices') }, { value: 'statement', label: t('statement') }, { value: 'payments', label: t('payments') }]} />
        {tab === 'invoices' && (
          <Table head={['#', t('period'), t('amountDue'), t('paid'), t('due'), tc('status'), '']} empty={!d.invoices.length}>
            {d.invoices.map((i: any) => (
              <tr key={i._id}>
                <td>{i.number}</td>
                <td className="text-muted">{date(i.periodStart, locale)} – {date(i.periodEnd, locale)}</td>
                <td>{money(i.amountDue, locale)}</td>
                <td>{money(i.paid, locale)}</td>
                <td>{date(i.dueAt, locale)}</td>
                <td><AnyStatus s={i.status} /></td>
                <td><Link href={`/seller/finance/invoices/${i._id}`} className="label underline underline-offset-4">{tc('details')}</Link></td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'statement' && (
          <Table head={[tc('date'), tc('details'), '#', tc('total')]} empty={!d.entries.length}>
            {d.entries.map((e: any) => (
              <tr key={e._id}>
                <td className="text-muted">{date(e.createdAt, locale)}</td>
                <td>{t(`entry.${e.type}` as any)}{e.note && <span className="text-muted"> — {e.note}</span>}</td>
                <td>{e.subOrder?.number}</td>
                <td className={e.amount < 0 ? 'text-muted' : ''}>{e.amount < 0 ? '−' : ''}{money(Math.abs(e.amount), locale)}</td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'payments' && (
          <Table head={[tc('date'), t('amount'), 'Ref', tc('status')]} empty={!d.payments.length}>
            {d.payments.map((p: any) => (
              <tr key={p._id}>
                <td className="text-muted">{date(p.createdAt, locale)}</td>
                <td>{money(p.amount, locale)}</td>
                <td dir="ltr">{p.referenceNo || p.receiptNo} {p.method === 'CASH' && '(cash)'}</td>
                <td>{t(`paymentStatus.${p.status}` as any)}{p.reason && <span className="text-muted"> — {p.reason}</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {paying && <PayModal d={d} onClose={() => setPaying(false)} onDone={() => { setPaying(false); toast(tc('done')); reload(); }} />}
    </>
  );
}

function PayModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const open = d.invoices.filter((i: any) => ['DUE', 'OVERDUE'].includes(i.status));
  const [invoice, setInvoice] = useState(open[0]?._id ?? '');
  const inv = open.find((i: any) => i._id === invoice);
  const [amount, setAmount] = useState(String(((inv ? inv.amountDue - inv.paid : d.balance) || 0) / 100));
  const [file, setFile] = useState('');
  const [ref, setRef] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('payCommission')}>
      <p className="text-sm text-muted">{t('payInstructions', { handle: d.platformInstapay || '—' })}</p>
      <div className="mt-6 space-y-5">
        {!!open.length && (
          <Field label={t('invoice')}>
            <Select value={invoice} onChange={(e) => { setInvoice(e.target.value); const i = open.find((x: any) => x._id === e.target.value); if (i) setAmount(String((i.amountDue - i.paid) / 100)); }}>
              <option value="">—</option>
              {open.map((i: any) => <option key={i._id} value={i._id}>{i.number} · {money(i.amountDue - i.paid, locale)}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('amount')}><Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Screenshot"><FileInput value={file} onChange={setFile} accept="image/jpeg,image/png,image/webp" /></Field>
        <Field label="Reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" /></Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={busy} disabled={!file || ref.trim().length < 4} onClick={() => run(async () => { await post('/seller/finance/payments', { invoice: invoice || undefined, amount: fromEgp(amount), file, referenceNo: ref.trim() }); onDone(); })}>{tc('submit')}</Button>
        </div>
      </div>
    </Modal>
  );
}
