'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';
import { cx, tx } from '@/lib/format';
import { useBag } from '@/lib/store';
import { Button, Modal, Price, Stars, toast } from '../ui';
import { Heart } from './ProductCard';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const sortSizes = (a: string, b: string) => {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
};

export function SizeGuideTable({ guide }: { guide: any }) {
  const locale = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink">{guide.columns.map((c: string, i: number) => <th key={i} className="label py-3 text-start">{c}</th>)}</tr>
        </thead>
        <tbody>
          {guide.rows.map((r: string[], i: number) => (
            <tr key={i} className="border-b border-line">{r.map((c, j) => <td key={j} className="py-3">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">{guide.unit} {tx(guide.notes, locale)}</p>
    </div>
  );
}

/** Gallery + buy panel. Clicking a colour swaps the gallery to that colour's photos. */
export function ProductView({ p, compact, onAdded, returnDays = 14 }: { p: any; compact?: boolean; onAdded?: () => void; returnDays?: number }) {
  const t = useTranslations('product');
  const locale = useLocale();
  const bag = useBag();
  const [colorId, setColorId] = useState<string>(p.colors[0]?._id);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [needSize, setNeedSize] = useState(false);

  const color = p.colors.find((c: any) => c._id === colorId) ?? p.colors[0];
  const variants = useMemo(() => p.variants.filter((v: any) => v.color === colorId).sort((a: any, b: any) => sortSizes(a.size, b.size)), [p, colorId]);
  const variant = variants.find((v: any) => v.size === size);
  const shown = variant ?? variants.find((v: any) => v.stock > 0) ?? variants[0];
  const images: string[] = color?.images ?? [];
  const singleSize = variants.length === 1;
  const pct = shown?.onSale ? Math.round((1 - shown.price / shown.original) * 100) : 0;

  const add = () => {
    const v = singleSize ? variants[0] : variant;
    if (!v) {
      setNeedSize(true);
      return;
    }
    bag.add({ product: p._id, variant: v._id, qty });
    toast(t('added'));
    onAdded?.();
    if (!onAdded) bag.setOpen(true);
  };

  return (
    <div className={cx('grid gap-8', compact ? 'md:grid-cols-2' : 'lg:grid-cols-[1.35fr_1fr] lg:gap-16')}>
      {/* Gallery */}
      <div className={cx(!compact && 'lg:sticky lg:top-28 lg:self-start')}>
        {compact ? (
          <div className="relative aspect-[3/4] overflow-hidden bg-wash">
            <AnimatePresence mode="wait">
              <motion.img key={images[active]} src={images[active]} alt="" className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {images.map((src, i) => (
              <motion.div key={colorId + src} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className={cx('group relative overflow-hidden bg-wash', i === 0 ? 'md:col-span-2 aspect-[4/5]' : 'aspect-[3/4]')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={tx(p.title, locale)} className="h-full w-full cursor-zoom-in object-cover transition-transform duration-[1500ms] group-hover:scale-[1.06]" loading={i < 2 ? 'eager' : 'lazy'} />
              </motion.div>
            ))}
          </div>
        )}
        {compact && images.length > 1 && (
          <div className="mt-2 flex gap-2">
            {images.map((src, i) => (
              <button key={src} onClick={() => setActive(i)} className={cx('h-16 w-12 overflow-hidden bg-wash', i === active ? 'ring-1 ring-ink' : 'opacity-60')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Buy panel */}
      <div className="space-y-7">
        <div>
          <Link href={`/brands/${p.seller?.slug}`} className="label text-muted hover:text-ink">{tx(p.seller?.storeName, locale)}</Link>
          <div className="mt-3 flex items-start justify-between gap-4">
            <h1 className={cx('font-display leading-tight', compact ? 'text-3xl' : 'text-4xl md:text-5xl')}>{tx(p.title, locale)}</h1>
            <Heart productId={p._id} className="-me-2 shrink-0" />
          </div>
          <div className="mt-4 flex items-center gap-4">
            {shown && <Price price={shown.price} original={shown.onSale ? shown.original : undefined} className="text-lg" />}
            {pct > 0 && <span className="label bg-ink px-2 py-1 text-[10px] text-canvas">{t('save', { pct })}</span>}
          </div>
          {p.ratingCount > 0 && (
            <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
              <Stars value={p.rating} /> {p.rating} ({p.ratingCount})
            </a>
          )}
        </div>

        <div>
          <p className="label mb-3">{t('colour')}: <span className="text-muted">{tx(color?.name, locale)}</span></p>
          <div className="flex flex-wrap gap-3">
            {p.colors.map((c: any) => (
              <button
                key={c._id}
                title={tx(c.name, locale)}
                onClick={() => {
                  setColorId(c._id);
                  setSize(null);
                  setActive(0);
                }}
                className={cx('h-9 w-9 rounded-full border p-0.5 transition-all', c._id === colorId ? 'border-ink' : 'border-transparent hover:border-subtle')}
              >
                <span className="block h-full w-full rounded-full border border-line" style={{ background: c.hex }} />
              </button>
            ))}
          </div>
        </div>

        {!singleSize && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className={cx('label', needSize && !size && 'text-danger')}>{needSize && !size ? t('chooseSize') : t('size')}</p>
              {p.sizeGuide && <button className="label underline underline-offset-4" onClick={() => setGuideOpen(true)}>{t('sizeGuide')}</button>}
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {variants.map((v: any) => (
                <button
                  key={v._id}
                  disabled={v.stock <= 0}
                  onClick={() => {
                    setSize(v.size);
                    setQty(1);
                  }}
                  className={cx(
                    'border py-3 text-sm transition-colors',
                    v.size === size ? 'border-ink bg-ink text-canvas' : 'border-line hover:border-ink',
                    v.stock <= 0 && 'cursor-not-allowed text-subtle line-through hover:border-line',
                  )}
                >
                  {v.size}
                </button>
              ))}
            </div>
            {variant && variant.stock > 0 && variant.stock <= 3 && <p className="mt-2 text-xs text-muted">{t('lowStock', { n: variant.stock })}</p>}
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex items-center border border-line">
            <button className="px-4 py-3" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span className="w-6 text-center text-sm">{qty}</span>
            <button className="px-4 py-3" onClick={() => setQty((q) => Math.min(variant?.stock ?? (singleSize ? variants[0]?.stock : 20) ?? 20, q + 1))}>+</button>
          </div>
          <Button size="lg" className="flex-1" onClick={add} disabled={variants.every((v: any) => v.stock <= 0)}>
            {variants.every((v: any) => v.stock <= 0) ? t('soldOut') : t('addToBag')}
          </Button>
        </div>

        {compact ? (
          <Link href={`/p/${p.slug}`} className="label inline-block underline underline-offset-4">{t('viewDetails')}</Link>
        ) : (
          <div className="divide-y divide-line border-y border-line">
            <Acc title={t('description')} open>
              <p className="leading-relaxed whitespace-pre-line text-muted">{tx(p.description, locale)}</p>
            </Acc>
            <Acc title={t('details')}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {tx(p.material, locale) && <><dt className="text-muted">{t('material')}</dt><dd>{tx(p.material, locale)}</dd></>}
                {tx(p.care, locale) && <><dt className="text-muted">{t('care')}</dt><dd>{tx(p.care, locale)}</dd></>}
                {(p.specs ?? []).map((s: any, i: number) => (
                  <Fragment key={i}>
                    <dt className="text-muted">{tx(s.label, locale)}</dt>
                    <dd>{tx(s.value, locale)}</dd>
                  </Fragment>
                ))}
              </dl>
            </Acc>
            <Acc title={t('shipping')}>
              <p className="text-sm text-muted">{t('shippingText', { brand: tx(p.seller?.storeName, locale), days: returnDays })}</p>
              {tx(p.seller?.returnPolicy, locale) && <p className="mt-2 text-sm text-muted">{tx(p.seller?.returnPolicy, locale)}</p>}
            </Acc>
          </div>
        )}
      </div>

      {p.sizeGuide && (
        <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title={t('sizeGuide')}>
          <SizeGuideTable guide={p.sizeGuide} />
        </Modal>
      )}
    </div>
  );
}

function Acc({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group py-5" open={open}>
      <summary className="label flex cursor-pointer list-none items-center justify-between">
        {title}
        <span className="transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
