'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Table, Tabs } from '@/components/panel';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, Loading, Stars, useLoad } from '@/components/ui';
import { api, post } from '@/lib/api';
import { date, tx } from '@/lib/format';

export default function AdminReviews() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [hidden, setHidden] = useState('false');
  const { data, loading, reload } = useLoad<any[]>(() => api(`/admin/reviews?hidden=${hidden}`), [hidden]);
  return (
    <>
      <PageTitle>{t('reviews')}</PageTitle>
      <Tabs value={hidden} onChange={setHidden} options={[{ value: 'false', label: 'Visible' }, { value: 'true', label: t('hide') }]} />
      {loading && !data ? <Loading /> : (
        <Table head={[tc('date'), 'Product', 'Customer', '★', '', '']} empty={!data?.length}>
          {data?.map((r) => (
            <tr key={r._id}>
              <td className="whitespace-nowrap text-muted">{date(r.createdAt, locale)}</td>
              <td><a className="hover:underline" href={`/${locale}/p/${r.product?.slug}`} target="_blank" rel="noreferrer">{tx(r.product?.title, locale)}</a></td>
              <td>{r.user?.name}</td>
              <td><Stars value={r.rating} /></td>
              <td className="max-w-md">{r.text}</td>
              <td className="text-end"><Button size="sm" variant="outline" onClick={async () => { await post(`/admin/reviews/${r._id}/visibility`, { hidden: !r.hidden }); reload(); }}>{r.hidden ? t('unhide') : t('hide')}</Button></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
