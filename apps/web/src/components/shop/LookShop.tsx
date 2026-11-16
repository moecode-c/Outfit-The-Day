'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { cx, tx } from '@/lib/format';
import { useBag } from '@/lib/store';
import { Button, Price, toast } from '../ui';

/** Shop every piece of a look: pick a size per item, add each to the bag. */
export function LookShop({ products }: { products: any[] }) {
  return (
    <div className="mt-12 divide-y divide-line border-y border-line">
      {products.map((p) => <LookItem key={p._id} p={p} />)}
    </div>
  );
}

function LookItem({ p }: { p: any }) {
  const t = useTranslations('product');
  const locale = useLocale();
  const bag = useBag();
  const [colorId, setColorId] = useState(p.colors[0]?._id);
  const [variantId, setVariantId] = useState<string | null>(null);
  const color = p.colors.find((c: any) => c._id === colorId);
  const variants = p.variants.filter((v: any) => v.color === colorId);
  const v = variants.find((x: any) => x._id === variantId) ?? (variants.length === 1 ? variants[0] : null);
  const shown = v ?? variants[0];
  return (
    <div className="flex gap-5 py-6">
      <Link href={`/p/${p.slug}`} className="w-28 shrink-0 bg-wash">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={color?.images?.[0]} alt="" className="aspect-[3/4] w-full object-cover" />
      </Link>
      <div className="flex-1 space-y-3">
        <div className="flex justify-between gap-4">
          <div>
            <p className="label text-[10px] text-muted">{tx(p.seller?.storeName, locale)}</p>
            <Link href={`/p/${p.slug}`} className="mt-1 block">{tx(p.title, locale)}</Link>
          </div>
          {shown && <Price price={shown.price} original={shown.onSale ? shown.original : undefined} className="text-sm whitespace-nowrap" />}
        </div>
        <div className="flex gap-2">
          {p.colors.map((c: any) => (
            <button key={c._id} onClick={() => { setColorId(c._id); setVariantId(null); }} className={cx('h-6 w-6 rounded-full border p-0.5', c._id === colorId ? 'border-ink' : 'border-transparent')}>
              <span className="block h-full w-full rounded-full border border-line" style={{ background: c.hex }} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {variants.length > 1 &&
            variants.map((x: any) => (
              <button key={x._id} disabled={x.stock <= 0} onClick={() => setVariantId(x._id)} className={cx('min-w-10 border px-2 py-1.5 text-xs', x._id === variantId ? 'border-ink bg-ink text-canvas' : 'border-line', x.stock <= 0 && 'text-subtle line-through')}>
                {x.size}
              </button>
            ))}
          <Button size="sm" className="ms-auto" disabled={!v || v.stock <= 0} onClick={() => { bag.add({ product: p._id, variant: v._id, qty: 1 }); toast(t('added')); }}>
            {v ? t('addToBag') : t('selectSize')}
          </Button>
        </div>
      </div>
    </div>
  );
}
