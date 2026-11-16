'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { cx, tx } from '@/lib/format';
import { Button, Check, Drawer, Input } from '../ui';

const COLOR_HEX: Record<string, string> = {
  black: '#0a0a0a', white: '#f7f7f5', grey: '#8a8a8a', beige: '#d8c9b4', brown: '#7a5a40', red: '#a83232', pink: '#e7b6c1', orange: '#d9822b',
  yellow: '#e5c84a', green: '#5b6e3c', blue: '#3b5fa3', navy: '#1f2a44', purple: '#6b4c8a', gold: '#c9a54a', silver: '#c0c0c0', multi: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
};

export function useQueryUpdate() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    if (!('page' in patch)) p.delete('page');
    const s = p.toString();
    router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
  };
}

export function SortSelect() {
  const t = useTranslations('shop');
  const sp = useSearchParams();
  const update = useQueryUpdate();
  const opts = [
    ['newest', t('sortNewest')],
    ['price_asc', t('sortPriceAsc')],
    ['price_desc', t('sortPriceDesc')],
    ['rating', t('sortRating')],
    ['best', t('sortBest')],
  ];
  return (
    <label className="label flex items-center gap-2">
      <span className="text-muted">{t('sort')}</span>
      <select value={sp.get('sort') ?? 'newest'} onChange={(e) => update({ sort: e.target.value })} className="cursor-pointer bg-transparent outline-none">
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Filters({ facets, categories, hide = [] }: { facets: any; categories?: any[]; hide?: string[] }) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const sp = useSearchParams();
  const update = useQueryUpdate();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(sp.get('minPrice') ?? '');
  const [max, setMax] = useState(sp.get('maxPrice') ?? '');

  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const toggle = (k: string, v: string) => {
    const cur = list(k);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    update({ [k]: next.join(',') || null });
  };
  const activeCount = ['size', 'color', 'seller', 'minPrice', 'maxPrice', 'onSale', 'inStock', 'rating'].filter((k) => sp.get(k)).length;

  const body = (
    <div className="space-y-9">
      {categories && categories.length > 0 && !hide.includes('category') && (
        <Section title={t('category')}>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c._id}>
                <button className={cx('text-sm transition-colors', sp.get('category') === c.slug ? 'text-ink underline underline-offset-4' : 'text-muted hover:text-ink')} onClick={() => update({ category: sp.get('category') === c.slug ? null : c.slug })}>
                  {tx(c.name, locale)}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {facets?.sizes?.length > 0 && (
        <Section title={t('size')}>
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s: any) => (
              <button key={s._id} onClick={() => toggle('size', s._id)} className={cx('min-w-11 border px-2 py-2 text-xs transition-colors', list('size').includes(s._id) ? 'border-ink bg-ink text-canvas' : 'border-line hover:border-ink')}>
                {s._id}
              </button>
            ))}
          </div>
        </Section>
      )}
      {facets?.colors?.length > 0 && (
        <Section title={t('colour')}>
          <div className="flex flex-wrap gap-2.5">
            {facets.colors.map((c: any) => (
              <button key={c._id} title={c._id} onClick={() => toggle('color', c._id)} className={cx('h-7 w-7 rounded-full border p-0.5', list('color').includes(c._id) ? 'border-ink' : 'border-transparent')}>
                <span className="block h-full w-full rounded-full border border-line" style={{ background: COLOR_HEX[c._id] ?? c._id }} />
              </button>
            ))}
          </div>
        </Section>
      )}
      {!hide.includes('seller') && facets?.sellers?.length > 1 && (
        <Section title={t('brand')}>
          <div className="space-y-2.5">
            {facets.sellers.map((s: any) => (
              <Check key={s._id} label={tx(s.storeName, locale)} checked={sp.get('seller') === s.slug} onChange={(v) => update({ seller: v ? s.slug : null })} />
            ))}
          </div>
        </Section>
      )}
      <Section title={t('price')}>
        <form className="flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); update({ minPrice: min || null, maxPrice: max || null }); }}>
          <Input inputMode="numeric" placeholder={t('min')} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
          <span className="pb-3">—</span>
          <Input inputMode="numeric" placeholder={t('max')} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
          <button className="label pb-3">→</button>
        </form>
      </Section>
      <Section title={t('rating')}>
        <div className="space-y-2.5">
          {[4, 3].map((r) => <Check key={r} label={`${r}★ ${t('andUp')}`} checked={sp.get('rating') === String(r)} onChange={(v) => update({ rating: v ? String(r) : null })} />)}
        </div>
      </Section>
      <div className="space-y-3">
        <Check label={t('onSale')} checked={sp.get('onSale') === 'true'} onChange={(v) => update({ onSale: v ? 'true' : null })} />
        <Check label={t('inStock')} checked={sp.get('inStock') === 'true'} onChange={(v) => update({ inStock: v ? 'true' : null })} />
      </div>
      {activeCount > 0 && (
        <button className="label underline underline-offset-4" onClick={() => update({ size: null, color: null, seller: null, minPrice: null, maxPrice: null, onSale: null, inStock: null, rating: null })}>
          {t('clear')}
        </button>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block">{body}</aside>
      <button className="label lg:hidden" onClick={() => setOpen(true)}>{t('filters')}{activeCount ? ` (${activeCount})` : ''}</button>
      <Drawer open={open} onClose={() => setOpen(false)} side="start" title={t('filters')}>
        <div className="p-6">{body}</div>
        <div className="sticky bottom-0 bg-canvas p-6"><Button className="w-full" onClick={() => setOpen(false)}>{t('showResults')}</Button></div>
      </Drawer>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-4">{title}</p>
      {children}
    </div>
  );
}

export function PageNav({ page, pages }: { page: number; pages: number }) {
  const update = useQueryUpdate();
  const t = useTranslations('common');
  if (pages <= 1) return null;
  return (
    <div className="mt-16 flex items-center justify-center gap-8">
      <button className="label disabled:opacity-30" disabled={page <= 1} onClick={() => { update({ page: String(page - 1) }); window.scrollTo({ top: 0 }); }}>← {t('prev')}</button>
      <span className="label text-muted">{t('page', { n: page, total: pages })}</span>
      <button className="label disabled:opacity-30" disabled={page >= pages} onClick={() => { update({ page: String(page + 1) }); window.scrollTo({ top: 0 }); }}>{t('next')} →</button>
    </div>
  );
}
