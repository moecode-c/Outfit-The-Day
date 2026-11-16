'use client';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { cx } from '@/lib/format';
import { Me, useAuth } from '@/lib/store';
import { Badge, Loading } from '../ui';

/** Sidebar layout shared by account, seller hub and admin. Redirects to login when signed out. */
export function PanelShell({
  title,
  nav,
  children,
  allow,
  header,
}: {
  title: React.ReactNode;
  nav: { href: string; label: string; exact?: boolean; badge?: number }[];
  children: React.ReactNode;
  allow?: (me: Me) => boolean;
  header?: React.ReactNode;
}) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const ok = me && (!allow || allow(me));

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!ok) router.replace('/');
  }, [loading, me, ok, pathname, router]);

  if (loading || !ok) return <div className="px-10"><Loading /></div>;

  return (
    <div className="grid min-h-[70vh] lg:grid-cols-[240px_1fr]">
      <aside className="no-print border-line lg:border-e">
        <div className="sticky top-24 px-4 py-8 md:px-10 lg:px-8">
          <div className="font-display text-3xl">{title}</div>
          {header}
          <nav className="no-scrollbar -mx-4 mt-8 flex gap-6 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-3 lg:px-0">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + '/');
              return (
                <Link key={n.href} href={n.href} className={cx('label flex items-center gap-2 whitespace-nowrap transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}>
                  {active && <span className="hidden h-px w-4 bg-ink lg:inline-block" />}
                  {n.label}
                  {!!n.badge && <Badge tone="solid">{n.badge}</Badge>}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <section className="min-w-0 px-4 py-8 md:px-10">{children}</section>
    </div>
  );
}

export function PageTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-4xl md:text-5xl">{children}</h1>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function SignOut() {
  const t = useTranslations('nav');
  const { logout } = useAuth();
  const router = useRouter();
  return (
    <button className="label mt-6 text-muted underline-offset-4 hover:underline" onClick={async () => { await logout(); router.push('/'); }}>
      {t('signOut')}
    </button>
  );
}
