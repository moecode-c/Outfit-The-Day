import { addDays, addHours, egp, escapeRegex, normalizeSearch, paginate, randomCode, slugify, zEgPhone, zId } from './util';

describe('normalizeSearch', () => {
  it('folds Arabic letter variants and strips diacritics/tatweel', () => {
    expect(normalizeSearch('أتيليه')).toBe(normalizeSearch('اتيليه'));
    expect(normalizeSearch('إآٱ')).toBe('ااا');
    expect(normalizeSearch('مدرسة')).toBe('مدرسه');
    expect(normalizeSearch('مستشفى')).toBe('مستشفي');
    expect(normalizeSearch('فُسْتَان')).toBe('فستان');
    expect(normalizeSearch('فـــستان')).toBe('فستان');
  });
  it('lowercases Latin, removes punctuation and collapses spaces', () => {
    expect(normalizeSearch('  Slip-Dress!!  BLACK ')).toBe('slip dress black');
    expect(normalizeSearch('')).toBe('');
    expect(normalizeSearch(undefined as any)).toBe('');
  });
});

describe('slugify', () => {
  it('makes URL-safe slugs and keeps Arabic', () => {
    expect(slugify('Atelier Nour — Café!')).toBe('atelier-nour-cafe');
    expect(slugify('فستان سهرة')).toBe('فستان-سهرة');
    expect(slugify('***')).toBe('item');
    expect(slugify('a'.repeat(100))).toHaveLength(60);
  });
});

describe('paginate', () => {
  it('clamps page and limit', () => {
    expect(paginate({})).toEqual({ page: 1, limit: 24, skip: 0 });
    expect(paginate({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
    expect(paginate({ page: '-4', limit: '1000' })).toEqual({ page: 1, limit: 60, skip: 0 });
    expect(paginate({ page: 'x', limit: 'y' }, 100)).toEqual({ page: 1, limit: 24, skip: 0 });
  });
});

describe('validators', () => {
  it('normalizes Egyptian mobile numbers', () => {
    expect(zEgPhone.parse('+20 100 123 4567')).toBe('01001234567');
    expect(zEgPhone.parse('0020-112-345-6789')).toBe('01123456789');
    expect(zEgPhone.safeParse('01312345678').success).toBe(false);
    expect(zEgPhone.safeParse('0100123').success).toBe(false);
  });
  it('accepts only Mongo ObjectIds', () => {
    expect(zId.safeParse('64b7f0c2a1b2c3d4e5f60718').success).toBe(true);
    expect(zId.safeParse('not-an-id').success).toBe(false);
  });
});

describe('small helpers', () => {
  it('escapes regex metacharacters', () => {
    expect(new RegExp(escapeRegex('a+b(c)?')).test('xa+b(c)?y')).toBe(true);
  });
  it('formats piasters as EGP', () => {
    expect(egp(189_000)).toBe('EGP 1,890');
    expect(egp(150)).toBe('EGP 1.5');
  });
  it('generates unambiguous codes', () => {
    const c = randomCode(200);
    expect(c).toHaveLength(200);
    expect(c).not.toMatch(/[IO01]/);
  });
  it('adds days and hours', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(addDays(d, 14).toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(addHours(d, 48).toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });
});
