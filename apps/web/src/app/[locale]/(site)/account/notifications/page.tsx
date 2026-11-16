'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, Empty, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, post } from '@/lib/api';
import { cx, date, tx } from '@/lib/format';

export default function NotificationsPage() {
  const t = useTranslations('account');
  const locale = useLocale();
  const { data, loading, reload } = useLoad<{ items: any[]; unread: number }>(() => api('/notifications'), []);
  return (
    <>
      <PageTitle actions={data?.unread ? <Button size="sm" variant="outline" onClick={async () => { await post('/notifications/read-all'); reload(); }}>{t('markAllRead')}</Button> : null}>
        {t('notifications')}
      </PageTitle>
      {loading ? <Loading /> : !data?.items.length ? <Empty>{t('noNotifications')}</Empty> : (
        <ul className="divide-y divide-line border-y border-line">
          {data.items.map((n) => {
            const body = (
              <div className="flex items-start gap-4 py-5">
                <span className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-ink')} />
                <div className="flex-1">
                  <p className={cx('text-sm', !n.readAt && 'font-medium')}>{tx(n.title, locale)}</p>
                  <p className="mt-1 text-xs text-muted">{date(n.createdAt, locale, true)}</p>
                </div>
              </div>
            );
            const onClick = () => !n.readAt && post(`/notifications/${n._id}/read`);
            return (
              <li key={n._id}>
                {n.link ? <Link href={n.link} onClick={onClick} className="block hover:bg-wash">{body}</Link> : <div onClick={onClick}>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
