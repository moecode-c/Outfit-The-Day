'use client';
import { useParams } from 'next/navigation';
import { InvoiceView } from '@/components/seller/InvoiceView';
import { Loading, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

export default function AdminInvoice() {
  const { id } = useParams<{ id: string }>();
  const { data } = useLoad<any>(() => api(`/admin/finance/invoices/${id}`), [id]);
  return data ? <InvoiceView data={data} pdfUrl={`/api/admin/finance/invoices/${id}/pdf`} /> : <Loading />;
}
