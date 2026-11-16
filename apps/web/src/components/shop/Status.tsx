'use client';
import { useTranslations } from 'next-intl';
import { Badge } from '../ui';

const SOLID = new Set(['DELIVERED', 'LIVE', 'APPROVED', 'PAID', 'CONFIRMED', 'REFUNDED', 'COLLECTED']);
const DANGER = new Set(['CANCELLED', 'REJECTED', 'OVERDUE', 'SUSPENDED']);
const MUTED = new Set(['DRAFT', 'HIDDEN', 'RETURNED', 'CREDIT']);

const tone = (s: string) => (SOLID.has(s) ? 'solid' : DANGER.has(s) ? 'danger' : MUTED.has(s) ? 'muted' : 'default') as any;

export function OrderStatus({ s }: { s: string }) {
  const t = useTranslations('orders.status');
  return <Badge tone={tone(s)}>{t.has(s as any) ? t(s as any) : s}</Badge>;
}
export function PayStatus({ s }: { s: string }) {
  const t = useTranslations('orders.pay');
  return <Badge tone={tone(s)}>{t.has(s as any) ? t(s as any) : s}</Badge>;
}
export function ReturnStatus({ s }: { s: string }) {
  const t = useTranslations('returns.status');
  return <Badge tone={tone(s)}>{t.has(s as any) ? t(s as any) : s}</Badge>;
}
export function ProductStatus({ s }: { s: string }) {
  const t = useTranslations('seller.productStatus');
  return <Badge tone={tone(s)}>{t.has(s as any) ? t(s as any) : s}</Badge>;
}
export function AnyStatus({ s }: { s: string }) {
  return <Badge tone={tone(s)}>{s.replace(/_/g, ' ')}</Badge>;
}

/** Order progress line: Pending → Confirmed → Processing → Shipped → Delivered. */
export function Progress({ status }: { status: string }) {
  const t = useTranslations('orders.status');
  const steps = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
  const idx = status === 'AWAITING_PAYMENT' ? 0 : ['RETURN_REQUESTED', 'RETURNED'].includes(status) ? 4 : steps.indexOf(status);
  if (status === 'CANCELLED') return null;
  return (
    <div className="grid grid-cols-5 gap-1">
      {steps.map((s, i) => (
        <div key={s}>
          <div className={`h-0.5 ${i <= idx ? 'bg-ink' : 'bg-line'}`} />
          <p className={`label mt-2 hidden text-[9px] sm:block ${i <= idx ? '' : 'text-subtle'}`}>{t(s as any)}</p>
        </div>
      ))}
    </div>
  );
}
