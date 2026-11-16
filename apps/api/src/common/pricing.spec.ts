import { allocateCoupon, applySellerDiscount, discountActive, productDerived, variantPricing } from './pricing';

const NOW = new Date('2026-06-15T12:00:00Z');
const DAY = 86_400_000;

describe('discountActive', () => {
  it('is false for missing or incomplete discounts', () => {
    expect(discountActive(null, NOW)).toBe(false);
    expect(discountActive(undefined, NOW)).toBe(false);
    expect(discountActive({ type: null, value: 10 }, NOW)).toBe(false);
    expect(discountActive({ type: 'PERCENT', value: null }, NOW)).toBe(false);
  });
  it('respects the start and end window', () => {
    const d = { type: 'PERCENT' as const, value: 10 };
    expect(discountActive({ ...d, startsAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe(false);
    expect(discountActive({ ...d, endsAt: new Date(NOW.getTime() - DAY) }, NOW)).toBe(false);
    expect(discountActive({ ...d, startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe(true);
    expect(discountActive({ ...d, value: 0 }, NOW)).toBe(true);
  });
});

describe('applySellerDiscount', () => {
  it('applies percentage discounts with rounding, capped at 100%', () => {
    expect(applySellerDiscount(100_000, { type: 'PERCENT', value: 25 }, NOW)).toBe(75_000);
    expect(applySellerDiscount(999, { type: 'PERCENT', value: 33 }, NOW)).toBe(669);
    expect(applySellerDiscount(100_000, { type: 'PERCENT', value: 150 }, NOW)).toBe(0);
  });
  it('applies fixed sale prices but never raises the price', () => {
    expect(applySellerDiscount(100_000, { type: 'FIXED_PRICE', value: 80_000 }, NOW)).toBe(80_000);
    expect(applySellerDiscount(100_000, { type: 'FIXED_PRICE', value: 120_000 }, NOW)).toBe(100_000);
    expect(applySellerDiscount(100_000, { type: 'FIXED_PRICE', value: -5 }, NOW)).toBe(0);
  });
  it('ignores an expired discount', () => {
    expect(applySellerDiscount(100_000, { type: 'PERCENT', value: 50, endsAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(100_000);
  });
});

describe('variantPricing / productDerived', () => {
  const product = {
    price: 200_000,
    discount: { type: 'PERCENT', value: 10 },
    colors: [{ family: 'black' }, { family: 'white' }, { family: 'black' }],
    variants: [
      { size: 'S', stock: 3 },
      { size: 'M', stock: 0, price: 150_000 },
      { size: 'L', stock: 2, price: 250_000 },
    ],
  };
  it('falls back to the product price and flags sales', () => {
    expect(variantPricing(product, product.variants[0], NOW)).toEqual({ original: 200_000, price: 180_000, onSale: true });
    expect(variantPricing({ price: 1000 }, null, NOW)).toEqual({ original: 1000, price: 1000, onSale: false });
  });
  it('derives listing fields', () => {
    const d = productDerived(product, NOW);
    expect(d.effectivePrice).toBe(135_000);
    expect(d.onSale).toBe(true);
    expect(d.totalStock).toBe(5);
    expect(d.sizes).toEqual(['S', 'L']); // out-of-stock sizes are not listed
    expect(d.colorFamilies).toEqual(['black', 'white']);
  });
  it('handles products without variants', () => {
    const d = productDerived({ price: 5000 }, NOW);
    expect(d).toMatchObject({ effectivePrice: 5000, onSale: false, totalStock: 0, sizes: [], colorFamilies: [] });
  });
});

describe('allocateCoupon', () => {
  const lines = [
    { key: 'a', seller: 's1', lineTotal: 30_000, onSale: false },
    { key: 'b', seller: 's1', lineTotal: 10_000, onSale: true },
    { key: 'c', seller: 's2', lineTotal: 60_000, onSale: false },
  ];
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

  it('splits a global percent coupon proportionally and the shares add up exactly', () => {
    const r = allocateCoupon({ type: 'PERCENT', value: 10, scope: 'GLOBAL' }, lines);
    expect(r.total).toBe(10_000);
    expect(r.shares).toEqual({ a: 3000, b: 1000, c: 6000 });
    expect(sum(r.shares)).toBe(r.total);
  });
  it('never discounts more than the eligible amount and shares still add up', () => {
    const r = allocateCoupon({ type: 'FIXED', value: 1000, scope: 'GLOBAL' }, [
      { key: 'x', seller: 's', lineTotal: 1, onSale: false },
      { key: 'y', seller: 's', lineTotal: 1, onSale: false },
      { key: 'z', seller: 's', lineTotal: 1, onSale: false },
    ]);
    expect(r.total).toBe(3);
    expect(sum(r.shares)).toBe(3);
  });
  it('keeps rounding remainders on the last line', () => {
    const r = allocateCoupon({ type: 'FIXED', value: 100, scope: 'GLOBAL' }, [
      { key: 'x', seller: 's', lineTotal: 1000, onSale: false },
      { key: 'y', seller: 's', lineTotal: 1000, onSale: false },
      { key: 'z', seller: 's', lineTotal: 1000, onSale: false },
    ]);
    expect(r.shares).toEqual({ x: 33, y: 33, z: 34 });
  });
  it('limits a brand coupon to that brand', () => {
    const r = allocateCoupon({ type: 'PERCENT', value: 50, scope: 'SELLERS', sellers: ['s2'] }, lines);
    expect(r.eligibleTotal).toBe(60_000);
    expect(r.shares).toEqual({ c: 30_000 });
  });
  it('excludes discounted lines when asked', () => {
    const r = allocateCoupon({ type: 'PERCENT', value: 10, scope: 'GLOBAL', excludesDiscounted: true }, lines);
    expect(r.shares.b).toBeUndefined();
    expect(r.total).toBe(9000);
  });
  it('honours maxDiscount', () => {
    expect(allocateCoupon({ type: 'PERCENT', value: 50, scope: 'GLOBAL', maxDiscount: 2500 }, lines).total).toBe(2500);
  });
  it('returns zero when nothing is eligible', () => {
    expect(allocateCoupon({ type: 'FIXED', value: 500, scope: 'SELLERS', sellers: ['nobody'] }, lines)).toEqual({ total: 0, eligibleTotal: 0, shares: {} });
  });
});
