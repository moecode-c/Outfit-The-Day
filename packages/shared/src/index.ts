export type Locale = 'en' | 'ar';
export type I18nText = { en: string; ar?: string };

export enum Role { CUSTOMER = 'CUSTOMER', SELLER = 'SELLER', ADMIN = 'ADMIN' }
export enum Department { WOMEN = 'WOMEN', MEN = 'MEN', KIDS = 'KIDS', UNISEX = 'UNISEX' }
export enum SubOrderStatus {
  PENDING = 'PENDING', AWAITING_PAYMENT = 'AWAITING_PAYMENT', CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING', SHIPPED = 'SHIPPED', DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED', RETURN_REQUESTED = 'RETURN_REQUESTED', RETURNED = 'RETURNED',
}

/** Money is stored in piasters (1 EGP = 100). */
export const toPiasters = (egp: number) => Math.round(egp * 100);
export const formatEGP = (piasters: number, locale: Locale = 'en') =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })
    .format(piasters / 100);

export const pickText = (t: I18nText, locale: Locale) => (locale === 'ar' ? t.ar || t.en : t.en || t.ar || '');
