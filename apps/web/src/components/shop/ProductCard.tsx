'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import { cx, firstImage, secondImage, tx } from '@/lib/format';
import { useAuth, useWish } from '@/lib/store';
import { Loading, Modal, Price, toast } from '../ui';
import { ProductView } from './ProductView';

export function Heart({ productId, className }: { productId: string; className?: string }) {
  const t = useTranslations('product');
  const { me } = useAuth();
  const wish = useWish();
  const router = useRouter();
  const on = wish.ids.has(productId);
  return (
    <button
      type="button"
      aria-label={on ? t('wishlistRemove') : t('wishlistAdd')}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!me) {
          toast(t('signInWishlist'));
          router.push('/login');
          return;
        }
        await wish.toggle(productId);
      }}
      className={cx('grid h-9 w-9 place-items-center transition-transform hover:scale-110', className)}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.7 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.5 0 5.8 3.4 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
      </svg>
    </button>
  );
}

export function ProductCard({ p, priority }: { p: any; priority?: boolean }) {
  const t = useTranslations('product');
  const locale = useLocale();
  const [qv, setQv] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const img1 = firstImage(p);
  const img2 = secondImage(p);
  const pct = p.onSale && p.price > p.effectivePrice ? Math.round((1 - p.effectivePrice / p.price) * 100) : 0;

  const openQv = async (e: React.MouseEvent) => {
    e.preventDefault();
    setQv(true);
    if (!detail) setDetail(await api(`/products/${p.slug}`).catch(() => null));
  };

  return (
    <>
      <Link href={`/p/${p.slug}`} className="group block">
        <div className="relative aspect-[3/4] overflow-hidden bg-wash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img1 && <img src={img1} alt={tx(p.title, locale)} loading={priority ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img2 && <img src={img2} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100" />}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
            <span>{pct > 0 && <span className="label bg-canvas px-2 py-1 text-[10px]">−{pct}%</span>}{p.totalStock === 0 && <span className="label bg-canvas px-2 py-1 text-[10px]">{t('soldOut')}</span>}</span>
            <Heart productId={p._id} className="bg-canvas/0" />
          </div>
          <button onClick={openQv} className="label absolute inset-x-3 bottom-3 translate-y-3 bg-canvas/95 py-3 opacity-0 backdrop-blur transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 max-md:hidden">
            {t('quickView')}
          </button>
        </div>
        <div className="mt-3 space-y-1">
          <p className="label text-[10px] text-muted">{tx(p.seller?.storeName, locale)}</p>
          <p className="truncate text-sm">{tx(p.title, locale)}</p>
          <Price price={p.effectivePrice} original={p.onSale ? p.price : undefined} className="text-sm" />
          {p.colors?.length > 1 && (
            <div className="flex gap-1.5 pt-1">
              {p.colors.slice(0, 5).map((c: any, i: number) => (
                <span key={i} className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: c.hex }} />
              ))}
            </div>
          )}
        </div>
      </Link>
      <Modal open={qv} onClose={() => setQv(false)} wide>
        {detail ? <ProductView p={detail} compact onAdded={() => setQv(false)} /> : <Loading />}
      </Modal>
    </>
  );
}

export function ProductGrid({ items, cols = 4 }: { items: any[]; cols?: 3 | 4 }) {
  return (
    <div className={cx('grid grid-cols-2 gap-x-3 gap-y-10 md:gap-x-5', cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
      {items.map((p, i) => (
        <ProductCard key={p._id} p={p} priority={i < 4} />
      ))}
    </div>
  );
}
