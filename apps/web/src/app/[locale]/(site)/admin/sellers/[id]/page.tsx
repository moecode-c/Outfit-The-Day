'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Section, Stat, Stats } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { AnyStatus } from '@/components/shop/Status';
import { Button, ErrorText, Input, Loading, ReasonDialog, toast, useAction, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { date, money, tx } from '@/lib/format';

export default function AdminSeller() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data: s, loading, reload } = useLoad<any>(() => api(`/admin/sellers/${id}`), [id]);
  const fin = useLoad<any>(() => api(`/admin/finance/sellers/${id}`).catch(() => null), [id]);
  const [dialog, setDialog] = useState<'' | 'reject' | 'suspend'>('');
  const [rate, setRate] = useState<string | null>(null);
  const act = useAction();
  if (loading && !s) return <Loading />;
  if (!s) return null;
  const go = (action: string, body: any = {}) => act.run(async () => { await post(`/admin/sellers/${id}/${action}`, body); setDialog(''); toast(tc('done')); reload(); });

  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-6 border-b border-line py-2 text-sm"><dt className="text-muted">{k}</dt><dd className="text-end">{v || '—'}</dd></div>;

  return (
    <>
      <PageTitle
        actions={
          <>
            {s.status === 'PENDING' && <><Button size="sm" loading={act.busy} onClick={() => go('approve')}>{t('approve')}</Button><Button size="sm" variant="outline" onClick={() => setDialog('reject')}>{t('reject')}</Button></>}
            {s.status === 'REJECTED' && <Button size="sm" onClick={() => go('approve')}>{t('approve')}</Button>}
            {s.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setDialog('suspend')}>{t('suspend')}</Button>}
            {s.status === 'SUSPENDED' && <Button size="sm" onClick={() => go('reactivate')}>{t('reactivate')}</Button>}
          </>
        }
      >
        {tx(s.storeName, locale)}
      </PageTitle>
      <div className="-mt-6 mb-8 flex items-center gap-3 text-sm"><AnyStatus s={s.status} />{s.statusReason && <span className="text-muted">{s.statusReason}</span>}<Link href={`/brands/${s.slug}`} className="label ms-auto underline">↗</Link></div>
      <ErrorText error={act.error} />

      {fin.data && (
        <Stats>
          <Stat label="Balance" value={money(fin.data.balance, locale)} />
          <Stat label={t('commissionGross')} value={money(fin.data.totals.commission, locale)} />
          <Stat label={t('couponCost')} value={money(fin.data.totals.couponCredits, locale)} />
          <Stat label={t('products')} value={s.productCount} hint={`${s.rating?.toFixed?.(1) ?? 0} ★ (${s.ratingCount})`} />
        </Stats>
      )}

      <div className="grid gap-x-12 lg:grid-cols-2">
        <Section title={tc('details')}>
          <dl>
            {row('Owner', s.ownerName)}
            {row('Email', s.email)}
            {row('Phone', <span dir="ltr">{s.phone}</span>)}
            {row('Account', `${s.user?.name} · ${s.user?.email}`)}
            {row('Address', s.businessAddress)}
            {row('Tax #', s.taxNumber)}
            {row('InstaPay', s.instapayHandle)}
            {row(tc('date'), date(s.createdAt, locale))}
          </dl>
        </Section>
        <Section title={t('documents')}>
          <div className="space-y-3 text-sm">
            {s.nationalIdFile && <a href={s.nationalIdFile} target="_blank" rel="noreferrer" className="block underline underline-offset-4">National ID — {t('viewDocument')} ↗</a>}
            {s.commercialRegisterFile && <a href={s.commercialRegisterFile} target="_blank" rel="noreferrer" className="block underline underline-offset-4">Commercial register — {t('viewDocument')} ↗</a>}
          </div>
          <div className="mt-10">
            <p className="label mb-3">{t('commissionOverride')}</p>
            <div className="flex gap-3">
              <Input type="number" min={0} max={100} step="0.5" className="max-w-32" placeholder="—" value={rate ?? (s.commissionRate ?? '')} onChange={(e) => setRate(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => go('commission', { commissionRate: rate === '' || rate == null ? null : Number(rate) })}>{tc('save')}</Button>
            </div>
            <p className="mt-2 text-xs text-muted">Empty = category / platform default.</p>
          </div>
        </Section>
      </div>

      <ReasonDialog open={!!dialog} title={dialog === 'reject' ? t('reject') : t('suspend')} onClose={() => setDialog('')} busy={act.busy} error={act.error} onSubmit={(reason) => go(dialog, { reason })} />
    </>
  );
}
