import { describe, expect, it } from 'vitest';
import { cx, date, firstImage, money, secondImage, toEgp, toPiasters, tx } from '@/lib/format';

describe('tx', () => {
  it('picks the locale and falls back to the other language', () => {
    expect(tx({ en: 'Dress', ar: 'فستان' }, 'ar')).toBe('فستان');
    expect(tx({ en: 'Dress', ar: 'فستان' }, 'en')).toBe('Dress');
    expect(tx({ en: 'Dress', ar: '' }, 'ar')).toBe('Dress');
    expect(tx({ en: '', ar: 'فستان' }, 'en')).toBe('فستان');
    expect(tx(null, 'en')).toBe('');
  });
});

describe('money', () => {
  it('formats piasters as EGP without needless decimals', () => {
    const en = money(189_000, 'en');
    expect(en).toMatch(/EGP/);
    expect(en).toMatch(/1,890/);
    expect(en).not.toMatch(/\.00/);
    expect(money(150, 'en')).toMatch(/1\.50/);
    expect(money(null)).toMatch(/0/);
  });
  it('uses Arabic digits for ar', () => {
    expect(money(189_000, 'ar')).toMatch(/[٠-٩]/);
  });
});

describe('date', () => {
  it('formats dates per locale and shows a dash when missing', () => {
    expect(date('2026-03-05T10:00:00Z', 'en')).toMatch(/5 Mar 2026/);
    expect(date('2026-03-05T10:00:00Z', 'ar')).toMatch(/[٠-٩]/);
    expect(date(null)).toBe('—');
  });
});

describe('money conversions', () => {
  it('round-trips EGP and piasters', () => {
    expect(toPiasters('1890.5')).toBe(189_050);
    expect(toPiasters('')).toBe(0);
    expect(toPiasters(0.1 + 0.2)).toBe(30);
    expect(toEgp(189_050)).toBe('1890.5');
    expect(toEgp(null)).toBe('');
  });
});

describe('helpers', () => {
  it('cx joins truthy classes', () => {
    expect(cx('a', false, null, undefined, 0, 'b')).toBe('a b');
  });
  it('picks product images safely', () => {
    const p = { colors: [{ images: ['1.jpg', '2.jpg'] }, { images: ['3.jpg'] }] };
    expect(firstImage(p)).toBe('1.jpg');
    expect(secondImage(p)).toBe('2.jpg');
    expect(secondImage({ colors: [{ images: ['1.jpg'] }, { images: ['3.jpg'] }] })).toBe('3.jpg');
    expect(firstImage(null)).toBe('');
  });
});
