/** Pricing rules shared by catalog, cart and checkout. All money is in piasters. */

export interface DiscountLike {
  type?: 'PERCENT' | 'FIXED_PRICE' | null;
  value?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export function discountActive(d: DiscountLike | undefined | null, now = new Date()): boolean {
  if (!d || !d.type || d.value == null) return false;
  if (d.startsAt && now < new Date(d.startsAt)) return false;
  if (d.endsAt && now > new Date(d.endsAt)) return false;
  return true;
}

/** Price after the seller's own discount. */
export function applySellerDiscount(base: number, d: DiscountLike | undefined | null, now = new Date()): number {
  if (!discountActive(d, now)) return base;
  if (d!.type === 'PERCENT') return Math.max(0, Math.round(base * (1 - Math.min(100, d!.value!) / 100)));
  return Math.min(base, Math.max(0, Math.round(d!.value!)));
}

export function variantPricing(product: any, variant: any, now = new Date()) {
  const original = variant?.price ?? product.price;
  const price = applySellerDiscount(original, product.discount, now);
  return { original, price, onSale: price < original };
}

/** Denormalized fields stored on the product for listing/filtering. */
export function productDerived(p: any, now = new Date()) {
  const prices = (p.variants?.length ? p.variants : [{}]).map((v: any) => variantPricing(p, v, now));
  const min = prices.reduce((a: any, b: any) => (b.price < a.price ? b : a), prices[0]);
  return {
    effectivePrice: min.price,
    onSale: prices.some((x: any) => x.onSale),
    totalStock: (p.variants ?? []).reduce((s: number, v: any) => s + (v.stock || 0), 0),
    sizes: [...new Set((p.variants ?? []).filter((v: any) => v.stock > 0).map((v: any) => v.size).filter(Boolean))],
    colorFamilies: [...new Set((p.colors ?? []).map((c: any) => c.family).filter(Boolean))],
  };
}

export interface CouponLike {
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: number | null;
  scope: 'GLOBAL' | 'SELLERS';
  sellers?: any[];
  excludesDiscounted?: boolean;
}

/**
 * Coupon discount over lines. Returns total and per-line share (proportional to eligible amount).
 * Lines: { key, seller, lineTotal, onSale }.
 */
export function allocateCoupon(
  coupon: CouponLike,
  lines: { key: string; seller: string; lineTotal: number; onSale: boolean }[],
) {
  const sellerSet = new Set((coupon.sellers ?? []).map(String));
  const eligible = lines.filter(
    (l) => (coupon.scope === 'GLOBAL' || sellerSet.has(String(l.seller))) && !(coupon.excludesDiscounted && l.onSale),
  );
  const eligibleTotal = eligible.reduce((s, l) => s + l.lineTotal, 0);
  if (!eligibleTotal) return { total: 0, eligibleTotal: 0, shares: {} as Record<string, number> };

  let total = coupon.type === 'PERCENT' ? Math.round((eligibleTotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount) total = Math.min(total, coupon.maxDiscount);
  total = Math.min(total, eligibleTotal);

  const shares: Record<string, number> = {};
  let allocated = 0;
  eligible.forEach((l, i) => {
    const share = i === eligible.length - 1 ? total - allocated : Math.floor((total * l.lineTotal) / eligibleTotal);
    shares[l.key] = share;
    allocated += share;
  });
  return { total, eligibleTotal, shares };
}
