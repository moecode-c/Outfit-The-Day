import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';

/** Validate a body/query with zod. */
export class Zod<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export const zI18n = z.object({ en: z.string().max(5000).default(''), ar: z.string().max(5000).default('') });
export const zId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
/** Egyptian mobile: 010/011/012/015 + 8 digits, optional +20 / 0020. */
export const zEgPhone = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, '').replace(/^(\+20|0020)/, '0'))
  .refine((s) => /^01[0125]\d{8}$/.test(s), 'Invalid Egyptian mobile number');

/** Arabic + Latin normalization used for search. */
export function normalizeSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // diacritics + tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function slugify(s: string): string {
  const base = (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'item';
}

export const randomCode = (n = 6) =>
  Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export function paginate(q: { page?: any; limit?: any }, max = 60) {
  const page = Math.max(1, parseInt(q.page) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(q.limit) || 24));
  return { page, limit, skip: (page - 1) * limit };
}

export const egp = (piasters: number) => `EGP ${(piasters / 100).toLocaleString('en-EG', { maximumFractionDigits: 2 })}`;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
