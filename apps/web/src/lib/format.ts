export type L = { en?: string; ar?: string } | null | undefined;
export type Locale = 'en' | 'ar';

/** Pick the localized string, falling back to the other language. */
export const tx = (v: L, locale: string) => (locale === 'ar' ? v?.ar || v?.en : v?.en || v?.ar) || '';

/** Piasters → "EGP 1,890" / "١٬٨٩٠ ج.م.". */
export function money(piasters: number | null | undefined, locale: string = 'en') {
  const v = (piasters ?? 0) / 100;
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: v % 1 ? 2 : 0,
  }).format(v);
}

export const date = (d: string | Date | null | undefined, locale: string = 'en', withTime = false) =>
  d
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(d))
    : '—';

export const toPiasters = (egp: string | number) => Math.round(Number(egp || 0) * 100);
export const toEgp = (p: number | null | undefined) => (p == null ? '' : String(p / 100));

export const cx = (...c: (string | number | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const firstImage = (p: any) => p?.colors?.[0]?.images?.[0] ?? '';
export const secondImage = (p: any) => p?.colors?.[0]?.images?.[1] ?? p?.colors?.[1]?.images?.[0] ?? '';
