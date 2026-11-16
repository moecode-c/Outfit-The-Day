'use client';
import { useTranslations } from 'next-intl';
import { ProductEditor } from '@/components/seller/ProductEditor';
import { PageTitle } from '@/components/shop/PanelShell';

export default function NewProduct() {
  const t = useTranslations('seller');
  return (
    <>
      <PageTitle>{t('newProduct')}</PageTitle>
      <ProductEditor />
    </>
  );
}
