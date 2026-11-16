'use client';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { cx, money } from '@/lib/format';

/** Building blocks shared by the seller hub and admin panel. */
export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <div className="h-full border border-line p-5 transition-colors hover:border-ink">
      <p className="label text-muted">{label}</p>
      <p className="mt-3 font-display text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function Stats({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink text-start">
            {head.map((h, i) => <th key={i} className="label py-3 pe-4 text-start font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&_td]:py-3 [&_td]:pe-4 [&_td]:align-middle">{children}</tbody>
      </table>
      {empty && <p className="py-12 text-center text-muted">—</p>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="no-scrollbar mb-6 flex gap-6 overflow-x-auto border-b border-line">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('label -mb-px whitespace-nowrap border-b py-3 transition-colors', value === o.value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {o.label}{o.count != null && <span className="ms-1 text-subtle">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Minimal monochrome bar chart for daily sales. */
export function BarChart({ data, days = 30 }: { data: { _id: string; total: number; orders: number }[]; days?: number }) {
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const map = new Map(data.map((d) => [d._id, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    return { key, total: map.get(key)?.total ?? 0, orders: map.get(key)?.orders ?? 0 };
  });
  const max = Math.max(1, ...series.map((s) => s.total));
  const h = hover != null ? series[hover] : null;
  return (
    <div>
      <p className="mb-3 h-5 text-sm text-muted">{h ? `${h.key} · ${money(h.total, locale)} · ${h.orders}` : ' '}</p>
      <div className="flex h-40 items-end gap-[3px]" dir="ltr" onMouseLeave={() => setHover(null)}>
        {series.map((s, i) => (
          <div key={s.key} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div className={cx('w-full transition-colors', hover === i ? 'bg-ink' : s.total ? 'bg-ink/70' : 'bg-line')} style={{ height: `${Math.max(2, (s.total / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, children, actions }: { title: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-ink pb-3">
        <h2 className="label">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export const egpInput = (v: number | null | undefined) => (v == null ? '' : String(v / 100));
export const fromEgp = (s: string) => (s === '' ? null : Math.round(Number(s) * 100));
