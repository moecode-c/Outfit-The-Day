'use client';
import { useTranslations } from 'next-intl';
import { PageTitle } from '@/components/shop/PanelShell';
import { ProductGrid } from '@/components/shop/ProductCard';
import { Empty, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useWish } from '@/lib/store';

export default function WishlistPage() {
  const t = useTranslations('account');
  const tn = useTranslations('nav');
  const { ids } = useWish();
  const { data, loading } = useLoad<any[]>(() => api('/account/wishlist'), []);
  // Hearts toggled on this page remove the card immediately.
  const items = (data ?? []).filter((p) => ids.has(p._id));
  return (
    <>
      <PageTitle>{t('wishlist')}</PageTitle>
      {loading ? <Loading /> : !items.length ? (
        <Empty>{t('emptyWishlist')} <Link href="/women" className="ms-2 underline underline-offset-4">{tn('women')} →</Link></Empty>
      ) : (
        <ProductGrid items={items} cols={3} />
      )}
    </>
  );
}
