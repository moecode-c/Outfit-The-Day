'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { cx, tx } from '@/lib/format';
import { useAuth, useBag } from '@/lib/store';
import { LocaleSwitch } from '../LocaleSwitch';
import { ThemeToggle } from '../ThemeToggle';
import { Drawer } from '../ui';
import { BagDrawer } from './BagDrawer';

type Cat = { _id: string; parent: string | null; name: any; slug: string; departments: string[] };

export function SiteHeader({ ticker, categories }: { ticker: { en: string[]; ar: string[] }; categories: Cat[] }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const { me } = useAuth();
  const bag = useBag();
  const router = useRouter();
  const pathname = usePathname();
  const [mega, setMega] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    setMega(null);
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  const items = locale === 'ar' ? ticker.ar : ticker.en;
  const depts = [
    { key: 'WOMEN', href: '/women', label: t('women') },
    { key: 'MEN', href: '/men', label: t('men') },
    { key: 'KIDS', href: '/kids', label: t('kids') },
  ];
  const roots = (dep: string) => categories.filter((c) => !c.parent && c.departments.includes(dep));
  const kids = (id: string, dep: string) => categories.filter((c) => c.parent === id && c.departments.includes(dep));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <header className="sticky top-0 z-50" onMouseLeave={() => setMega(null)}>
        <div className={cx('overflow-hidden bg-ink text-canvas transition-all duration-500', scrolled ? 'max-h-0' : 'max-h-10')}>
          <div className="marquee flex w-max gap-16 py-2 whitespace-nowrap">
            {[...items, ...items, ...items].map((x, i) => (
              <span key={i} className="label text-[10px]">{x}</span>
            ))}
          </div>
        </div>
        <nav className="relative grid grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-canvas/90 px-4 py-4 backdrop-blur-md md:px-10">
          <div className="flex items-center gap-7">
            <button className="label md:hidden" onClick={() => setMenuOpen(true)} aria-label={t('menu')}>
              <span className="block h-px w-5 bg-ink" />
              <span className="mt-1.5 block h-px w-5 bg-ink" />
            </button>
            {depts.map((d) => (
              <Link key={d.key} href={d.href} onMouseEnter={() => setMega(d.key)} className={cx('label hidden transition-opacity hover:opacity-60 md:inline', pathname.startsWith(d.href) && 'underline underline-offset-8')}>
                {d.label}
              </Link>
            ))}
            <Link href="/looks" onMouseEnter={() => setMega(null)} className="label hidden transition-opacity hover:opacity-60 lg:inline">{t('looks')}</Link>
            <Link href="/brands" onMouseEnter={() => setMega(null)} className="label hidden transition-opacity hover:opacity-60 lg:inline">{t('brands')}</Link>
          </div>
          <Link href="/" className="font-display text-3xl leading-none tracking-tight md:text-[2.6rem]" aria-label="OTD">
            OTD
          </Link>
          <div className="flex items-center justify-end gap-5 md:gap-7">
            <span className="hidden lg:inline"><LocaleSwitch /></span>
            <span className="hidden lg:inline"><ThemeToggle /></span>
            <button className="label transition-opacity hover:opacity-60" onClick={() => setSearchOpen(true)}>{t('search')}</button>
            <Link href={me ? '/account' : '/login'} className="label hidden transition-opacity hover:opacity-60 sm:inline">
              {me ? t('account') : t('signIn')}
            </Link>
            <button className="label transition-opacity hover:opacity-60" onClick={() => bag.setOpen(true)}>
              {t('bag')} ({bag.count})
            </button>
          </div>

          {/* Mega menu */}
          <AnimatePresence>
            {mega && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-x-0 top-full hidden border-b border-line bg-canvas px-10 py-10 md:block"
              >
                <div className="grid grid-cols-5 gap-10">
                  {roots(mega).map((r) => (
                    <div key={r._id}>
                      <Link href={`/c/${r.slug}?department=${mega.toLowerCase()}`} className="label mb-4 block">{tx(r.name, locale)}</Link>
                      <ul className="space-y-2.5">
                        {kids(r._id, mega).map((c) => (
                          <li key={c._id}>
                            <Link href={`/c/${c.slug}?department=${mega.toLowerCase()}`} className="text-sm text-muted transition-colors hover:text-ink">{tx(c.name, locale)}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="space-y-2.5">
                    <Link href={`/${mega.toLowerCase()}?sort=newest`} className="label block">{t('new')}</Link>
                    <Link href={`/${mega.toLowerCase()}?onSale=true`} className="label block">{t('sale')}</Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      </header>

      {/* Search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div className="fixed inset-0 z-[60] bg-canvas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-end p-6">
              <button className="label" onClick={() => setSearchOpen(false)}>{t('close')} ✕</button>
            </div>
            <form onSubmit={submit} className="mx-auto mt-[12vh] max-w-4xl px-6">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full border-b border-ink bg-transparent pb-4 font-display text-4xl outline-none placeholder:text-subtle md:text-6xl"
              />
              <div className="mt-8 flex flex-wrap gap-6">
                {['Dress', 'فستان', 'Linen', 'Sneakers', 'Abaya'].map((s) => (
                  <button key={s} type="button" className="label text-muted hover:text-ink" onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}>
                    {s}
                  </button>
                ))}
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile menu */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="start" title={t('menu')}>
        <div className="space-y-8 px-6 py-8">
          {depts.map((d) => (
            <details key={d.key} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display text-3xl">
                {d.label} <span className="text-base transition-transform group-open:rotate-45">+</span>
              </summary>
              <ul className="mt-4 space-y-3 ps-1">
                <li><Link href={d.href} className="label">{t('new')}</Link></li>
                {roots(d.key).map((r) => (
                  <li key={r._id}><Link href={`/c/${r.slug}?department=${d.key.toLowerCase()}`} className="text-muted">{tx(r.name, locale)}</Link></li>
                ))}
              </ul>
            </details>
          ))}
          <Link href="/looks" className="block font-display text-3xl">{t('looks')}</Link>
          <Link href="/brands" className="block font-display text-3xl">{t('brands')}</Link>
          <div className="space-y-4 border-t border-line pt-6">
            <Link href={me ? '/account' : '/login'} className="label block">{me ? t('account') : t('signIn')}</Link>
            {me?.role === 'SELLER' && <Link href="/seller" className="label block">{t('sellerHub')}</Link>}
            {me?.role === 'ADMIN' && <Link href="/admin" className="label block">{t('adminPanel')}</Link>}
            <Link href="/sell" className="label block">{t('sell')}</Link>
            <div className="flex gap-6"><LocaleSwitch /><ThemeToggle /></div>
          </div>
        </div>
      </Drawer>

      <BagDrawer />
    </>
  );
}
