'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { DiscountPanel, ProductEditor } from '@/components/seller/ProductEditor';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, Loading, useLoad } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { api, patch } from '@/lib/api';
import { tx } from '@/lib/format';

export default function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('seller');
  const locale = useLocale();
  const { data: p, loading, reload } = useLoad<any>(() => api(`/seller/products/${id}`), [id]);
  if (loading && !p) return <Loading />;
  if (!p) return null;
  return (
    <>
      <PageTitle
        actions={
          <>
            {['LIVE', 'HIDDEN'].includes(p.status) && p.statusReason !== 'ADMIN' && (
              <Button size="sm" variant="outline" onClick={async () => { await patch(`/seller/products/${id}/visibility`, { hidden: p.status === 'LIVE' }); reload(); }}>
                {p.status === 'LIVE' ? t('hide') : t('unhide')}
              </Button>
            )}
            <Link href={`/p/${p.slug}`} target="_blank" className="label self-center underline underline-offset-4">↗</Link>
          </>
        }
      >
        {tx(p.title, locale) || t('editProduct')}
      </PageTitle>
      <ProductEditor key={p.updatedAt} product={p} onSaved={reload} />
      <div className="max-w-4xl"><DiscountPanel key={'d' + p.updatedAt} product={p} onSaved={reload} /></div>
    </>
  );
}
