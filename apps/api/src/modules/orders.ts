import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { AdminPerm, AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { allocateCoupon, productDerived, variantPricing } from '../common/pricing';
import { addDays, addHours, egp, escapeRegex, paginate, randomCode, Zod, zId } from '../common/util';
import { SettingsService } from '../db/settings.service';
import { FilesService } from './files';
import { FinanceModule, FinanceService } from './finance';
import { NotifyService } from './notify';

const CartItems = z.array(z.object({ product: zId, variant: zId, qty: z.number().int().min(1).max(20) })).max(100);
const PriceDto = z.object({ items: CartItems, couponCode: z.string().max(40).optional(), governorate: zId.optional() });
const CheckoutDto = z.object({ items: CartItems.min(1), addressId: zId, paymentMethod: z.enum(['COD', 'INSTAPAY']), couponCode: z.string().max(40).optional() });
const ReturnDto = z.object({
  subOrder: zId,
  items: z.array(z.object({ item: zId, qty: z.number().int().min(1) })).min(1),
  reason: z.enum(['FAULTY', 'WRONG_ITEM', 'SIZE', 'CHANGED_MIND', 'OTHER']),
  details: z.string().max(1000).default(''),
  photos: z.array(z.string()).max(6).default([]),
});
const StatusDto = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']),
  courier: z.string().max(80).optional(),
  trackingNo: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});
const Reason = z.object({ reason: z.string().min(2).max(500) });

const STATUS_TEXT: Record<string, { en: string; ar: string }> = {
  CONFIRMED: { en: 'confirmed', ar: 'تم تأكيده' },
  PROCESSING: { en: 'being prepared', ar: 'قيد التجهيز' },
  SHIPPED: { en: 'on its way', ar: 'في الطريق إليك' },
  DELIVERED: { en: 'delivered', ar: 'تم التوصيل' },
  CANCELLED: { en: 'cancelled', ar: 'تم إلغاؤه' },
};

@Injectable()
export class OrdersService {
  private readonly log = new Logger('Orders');

  constructor(
    @InjectModel('Product') readonly products: Model<any>,
    @InjectModel('Seller') readonly sellers: Model<any>,
    @InjectModel('User') readonly users: Model<any>,
    @InjectModel('Governorate') readonly govs: Model<any>,
    @InjectModel('Coupon') readonly coupons: Model<any>,
    @InjectModel('CouponRedemption') readonly redemptions: Model<any>,
    @InjectModel('Order') readonly orders: Model<any>,
    @InjectModel('SubOrder') readonly subs: Model<any>,
    @InjectModel('PaymentRef') readonly refs: Model<any>,
    @InjectModel('Return') readonly returns: Model<any>,
    @InjectModel('Review') readonly reviews: Model<any>,
    @InjectModel('Category') readonly categories: Model<any>,
    readonly settings: SettingsService,
    readonly notify: NotifyService,
    readonly files: FilesService,
    readonly finance: FinanceService,
  ) {}

  /* ═════════ Cart pricing (single source of truth for bag + checkout) ═════════ */
  async price(input: z.infer<typeof PriceDto>, user?: AuthUser) {
    const ids = [...new Set(input.items.map((i) => i.product))];
    const products = await this.products.find({ _id: { $in: ids } }).lean<any[]>();
    const sellerIds = [...new Set(products.map((p) => String(p.seller)))];
    const sellers = await this.sellers.find({ _id: { $in: sellerIds } }).lean<any[]>();
    const gov = input.governorate ? await this.govs.findById(input.governorate).lean<any>() : null;
    const issues: string[] = [];

    const lines = input.items.map((ci, idx) => {
      const p = products.find((x) => String(x._id) === ci.product);
      const v = p?.variants.find((x: any) => String(x._id) === ci.variant);
      const seller = p && sellers.find((s) => String(s._id) === String(p.seller));
      const color = v && p.colors.find((c: any) => String(c._id) === String(v.color));
      let issue: string | null = null;
      if (!p || !v || p.status !== 'LIVE' || !p.sellerActive || seller?.status !== 'APPROVED') issue = 'UNAVAILABLE';
      else if (v.stock <= 0) issue = 'OUT_OF_STOCK';
      else if (v.stock < ci.qty) issue = 'LOW_STOCK';
      if (issue) issues.push(issue);
      const pr = p && v ? variantPricing(p, v) : { original: 0, price: 0, onSale: false };
      const qty = issue === 'LOW_STOCK' ? v.stock : ci.qty;
      return {
        key: `${idx}`,
        product: ci.product,
        variant: ci.variant,
        slug: p?.slug,
        title: p?.title,
        colorName: color?.name,
        size: v?.size,
        sku: v?.sku,
        image: color?.images?.[0] ?? p?.colors?.[0]?.images?.[0],
        seller: p ? String(p.seller) : '',
        category: p?.category,
        original: pr.original,
        price: pr.price,
        onSale: pr.onSale,
        qty: ci.qty,
        stock: v?.stock ?? 0,
        lineTotal: issue === 'UNAVAILABLE' || issue === 'OUT_OF_STOCK' ? 0 : pr.price * qty,
        issue,
      };
    });
    const valid = lines.filter((l) => l.lineTotal > 0);

    // Coupon
    let coupon: any = null;
    let couponResult = { total: 0, shares: {} as Record<string, number> };
    let couponError: string | null = null;
    if (input.couponCode) {
      const r = await this.checkCoupon(input.couponCode, valid, user);
      if (r.error) couponError = r.error;
      else {
        coupon = r.coupon;
        couponResult = r.result!;
      }
    }

    const groups = sellers
      .map((s) => {
        const items = lines.filter((l) => l.seller === String(s._id));
        const itemsTotal = items.reduce((t, l) => t + l.lineTotal, 0);
        const couponShare = items.reduce((t, l) => t + (couponResult.shares[l.key] ?? 0), 0);
        const shipping = this.shippingFee(s, gov, itemsTotal);
        return {
          seller: { _id: s._id, storeName: s.storeName, slug: s.slug, instapayHandle: s.instapayHandle },
          items,
          itemsTotal,
          couponShare,
          shippingFee: itemsTotal > 0 ? shipping.fee : 0,
          etaDays: shipping.etaDays,
          total: itemsTotal - couponShare + (itemsTotal > 0 ? shipping.fee : 0),
        };
      })
      .filter((g) => g.items.length);

    const totals = {
      items: groups.reduce((t, g) => t + g.itemsTotal, 0),
      savings: valid.reduce((t, l) => t + (l.original - l.price) * l.qty, 0),
      coupon: couponResult.total,
      shipping: groups.reduce((t, g) => t + g.shippingFee, 0),
      total: groups.reduce((t, g) => t + g.total, 0),
    };
    return { groups, totals, coupon: coupon ? { code: coupon.code, discount: couponResult.total } : null, couponError, issues, shippingKnown: !!gov };
  }

  shippingFee(seller: any, gov: any, itemsTotal: number) {
    const ship = seller.shipping ?? {};
    const rule = gov && (ship.perGovernorate ?? []).find((r: any) => String(r.governorate) === String(gov._id));
    let fee = rule?.fee ?? ship.flatFee ?? gov?.shippingFee ?? 6000;
    if (ship.freeAbove && itemsTotal >= ship.freeAbove) fee = 0;
    return { fee, etaDays: rule?.etaDays ?? gov?.etaDays ?? 3 };
  }

  async checkCoupon(code: string, lines: any[], user?: AuthUser) {
    const c = await this.coupons.findOne({ code: code.trim().toUpperCase() }).lean<any>();
    const now = new Date();
    const fail = (error: string) => ({ error, coupon: null, result: null });
    if (!c || !c.active) return fail('Invalid coupon code');
    if (c.startsAt && now < c.startsAt) return fail('This coupon is not active yet');
    if (c.endsAt && now > c.endsAt) return fail('This coupon has expired');
    if (c.usageLimit && c.usedCount >= c.usageLimit) return fail('This coupon has reached its usage limit');
    if (user) {
      if (c.perCustomerLimit && (await this.redemptions.countDocuments({ coupon: c._id, user: user.id })) >= c.perCustomerLimit) return fail('You have already used this coupon');
      if (c.newCustomersOnly && (await this.orders.exists({ customer: user.id }))) return fail('This coupon is for first orders only');
    } else if (c.newCustomersOnly || c.perCustomerLimit) {
      // checked again at checkout once logged in
    }
    const subtotal = lines.reduce((t, l) => t + l.lineTotal, 0);
    if (c.minOrder && subtotal < c.minOrder) return fail(`Minimum order for this coupon is ${egp(c.minOrder)}`);
    const result = allocateCoupon(c, lines.map((l) => ({ key: l.key, seller: l.seller, lineTotal: l.lineTotal, onSale: l.onSale })));
    if (!result.total) return fail('This coupon does not apply to the items in your bag');
    return { error: null, coupon: c, result };
  }

  /* ═════════ Checkout ═════════ */
  async checkout(user: AuthUser, dto: z.infer<typeof CheckoutDto>) {
    const u = await this.users.findById(user.id).lean<any>();
    if (u.blockedAt) throw new ForbiddenException('Account blocked');
    const address = u.addresses.find((a: any) => String(a._id) === dto.addressId);
    if (!address) throw new BadRequestException('Choose a delivery address');
    const gov = await this.govs.findById(address.governorate).lean<any>();
    if (!gov?.active) throw new BadRequestException('We do not deliver to this governorate yet');

    const priced = await this.price({ items: dto.items, couponCode: dto.couponCode, governorate: String(address.governorate) }, user);
    if (priced.issues.length) throw new ConflictException({ message: 'Some items changed. Please review your bag.', cart: priced });
    if (dto.couponCode && priced.couponError) throw new BadRequestException(priced.couponError);

    const s = await this.settings.all();
    if (dto.paymentMethod === 'COD') {
      if (u.codFailures >= s.codMaxFailures) throw new BadRequestException('Cash on delivery is unavailable for your account. Please pay with InstaPay.');
      if (priced.totals.total > s.codMaxOrder) throw new BadRequestException(`Cash on delivery is limited to ${egp(s.codMaxOrder)} per order.`);
    } else {
      const missing = priced.groups.find((g) => !g.seller.instapayHandle);
      if (missing) throw new BadRequestException(`${missing.seller.storeName.en} does not accept InstaPay`);
    }

    // 1) Reserve stock atomically, rolling back on any failure.
    const reserved: { product: string; variant: string; qty: number }[] = [];
    const rollback = async () => {
      for (const r of reserved) await this.products.updateOne({ _id: r.product, 'variants._id': r.variant }, { $inc: { 'variants.$.stock': r.qty } });
    };
    for (const g of priced.groups) {
      for (const l of g.items) {
        const r = await this.products.updateOne(
          { _id: l.product, status: 'LIVE', variants: { $elemMatch: { _id: new Types.ObjectId(l.variant), stock: { $gte: l.qty } } } },
          { $inc: { 'variants.$.stock': -l.qty } },
        );
        if (!r.modifiedCount) {
          await rollback();
          throw new ConflictException({ message: 'An item just sold out. Please review your bag.' });
        }
        reserved.push({ product: l.product, variant: l.variant, qty: l.qty });
      }
    }

    // 2) Consume coupon atomically.
    let couponDoc: any = null;
    if (priced.coupon) {
      couponDoc = await this.coupons.findOneAndUpdate(
        { code: priced.coupon.code, $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
        { $inc: { usedCount: 1 } },
        { new: true },
      );
      if (!couponDoc) {
        await rollback();
        throw new BadRequestException('This coupon has reached its usage limit');
      }
    }

    // 3) Create order + sub-orders with locked prices, coupon shares and commission rates.
    const now = new Date();
    const number = `OTD${now.toISOString().slice(2, 10).replace(/-/g, '')}${randomCode(5)}`;
    const addressSnap = { ...address, governorateName: gov.name };
    const order = await this.orders.create({
      number,
      customer: user.id,
      address: addressSnap,
      coupon: couponDoc ? { id: couponDoc._id, code: couponDoc.code } : undefined,
      totals: { items: priced.totals.items, coupon: priced.totals.coupon, shipping: priced.totals.shipping, total: priced.totals.total },
      locale: u.locale,
    });
    const couponShares: Record<string, number> = {};
    if (couponDoc) {
      const r = await this.checkCoupon(couponDoc.code, priced.groups.flatMap((g) => g.items), undefined);
      Object.assign(couponShares, r.result?.shares ?? {});
    }
    const subIds: any[] = [];
    let i = 0;
    for (const g of priced.groups) {
      i++;
      const seller = await this.sellers.findById(g.seller._id).lean<any>();
      const items: any[] = [];
      for (const l of g.items) {
        const cat = await this.categories.findById(l.category).select('returnable').lean<any>();
        items.push({
          product: l.product,
          variant: l.variant,
          title: l.title,
          colorName: l.colorName,
          size: l.size,
          sku: l.sku,
          image: l.image,
          originalPrice: l.original,
          unitPrice: l.price,
          qty: l.qty,
          lineTotal: l.lineTotal,
          couponShare: couponShares[l.key] ?? 0,
          commissionRate: await this.finance.commissionRate(seller, l.category),
          category: l.category,
          returnable: cat?.returnable !== false,
        });
      }
      const instapay = dto.paymentMethod === 'INSTAPAY';
      const sub = await this.subs.create({
        order: order._id,
        number: `${number}-${i}`,
        customer: user.id,
        seller: g.seller._id,
        items,
        itemsTotal: g.itemsTotal,
        couponShare: g.couponShare,
        shippingFee: g.shippingFee,
        total: g.total,
        paymentMethod: dto.paymentMethod,
        paymentStatus: instapay ? 'AWAITING_PROOF' : 'COD_PENDING',
        instapayHandle: instapay ? seller.instapayHandle : undefined,
        proofDeadline: instapay ? addHours(now, s.instapayProofHours) : undefined,
        status: instapay ? 'AWAITING_PAYMENT' : 'PENDING',
        events: [{ status: instapay ? 'AWAITING_PAYMENT' : 'PENDING', by: user.id }],
        address: addressSnap,
      });
      subIds.push(sub._id);
      await this.notify.notify(seller.user, 'NEW_ORDER', { en: `New order ${sub.number}`, ar: `طلب جديد ${sub.number}` }, `/seller/orders/${sub._id}`, {
        body: {
          en: `${items.length} item(s), ${egp(g.total)} · ${instapay ? 'InstaPay — wait for the customer’s transfer proof.' : 'Cash on delivery — please confirm the order.'}`,
          ar: `${items.length} منتج، ${egp(g.total)} · ${instapay ? 'إنستاباي — انتظر صورة التحويل من العميل.' : 'الدفع عند الاستلام — يرجى تأكيد الطلب.'}`,
        },
      });
    }
    order.subOrders = subIds;
    await order.save();
    if (couponDoc) await this.redemptions.create({ coupon: couponDoc._id, user: user.id, order: order._id, amount: priced.totals.coupon });
    await this.users.updateOne({ _id: user.id }, { $inc: { ordersCount: 1 }, cart: [] });
    for (const r of reserved) {
      const p = await this.products.findById(r.product);
      if (p) {
        Object.assign(p, productDerived(p));
        await p.save();
      }
    }
    await this.notify.notify(user.id, 'ORDER_PLACED', { en: `Order ${number} placed`, ar: `تم استلام طلبك ${number}` }, `/account/orders/${number}`, {
      body: {
        en: `Thank you! Total ${egp(priced.totals.total)}.${dto.paymentMethod === 'INSTAPAY' ? ` Please send the InstaPay transfer(s) and upload the screenshot within ${s.instapayProofHours} hours.` : ''}`,
        ar: `شكرًا لك! الإجمالي ${egp(priced.totals.total)}.${dto.paymentMethod === 'INSTAPAY' ? ` يرجى إرسال التحويل عبر إنستاباي ورفع الصورة خلال ${s.instapayProofHours} ساعة.` : ''}`,
      },
    });
    return { number, orderId: order._id };
  }

  /* ═════════ Shared helpers ═════════ */
  async releaseStock(sub: any, onlyItems?: { item: any; qty: number }[]) {
    const list = onlyItems
      ? onlyItems.map((r) => ({ it: sub.items.find((i: any) => String(i._id) === String(r.item)), qty: r.qty }))
      : sub.items.map((it: any) => ({ it, qty: it.qty }));
    for (const { it, qty } of list) {
      if (!it) continue;
      await this.products.updateOne({ _id: it.product, 'variants._id': it.variant }, { $inc: { 'variants.$.stock': qty } });
      const p = await this.products.findById(it.product);
      if (p) {
        Object.assign(p, productDerived(p));
        await p.save();
      }
    }
  }

  async cancel(sub: any, by: string, reason: string, who: 'customer' | 'seller' | 'system' | 'admin') {
    if (!['AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING'].includes(sub.status)) throw new BadRequestException('This order can no longer be cancelled');
    sub.status = 'CANCELLED';
    sub.cancelReason = reason;
    sub.events.push({ status: 'CANCELLED', by, note: `${who}: ${reason}` });
    await sub.save();
    await this.releaseStock(sub);
    const seller = await this.sellers.findById(sub.seller).lean<any>();
    const t = { en: `Order ${sub.number} cancelled`, ar: `تم إلغاء الطلب ${sub.number}` };
    const body = { body: { en: `Reason: ${reason}`, ar: `السبب: ${reason}` } };
    if (who !== 'customer') await this.notify.notify(sub.customer, 'ORDER_CANCELLED', t, `/account/orders/${sub.number.split('-')[0]}`, body);
    if (who !== 'seller') await this.notify.notify(seller.user, 'ORDER_CANCELLED', t, `/seller/orders/${sub._id}`, body);
    return sub;
  }

  async setStatus(sub: any, by: string, dto: z.infer<typeof StatusDto>) {
    const allowed: Record<string, string[]> = {
      PENDING: ['CONFIRMED'],
      CONFIRMED: ['PROCESSING', 'SHIPPED'],
      PROCESSING: ['SHIPPED'],
      SHIPPED: ['DELIVERED'],
    };
    if (!(allowed[sub.status] ?? []).includes(dto.status)) throw new BadRequestException(`Cannot move from ${sub.status} to ${dto.status}`);
    if (sub.paymentMethod === 'INSTAPAY' && sub.paymentStatus !== 'CONFIRMED') throw new BadRequestException('Confirm the InstaPay payment first');
    if (dto.status === 'SHIPPED') {
      if (!dto.courier) throw new BadRequestException('Courier name is required');
      sub.courier = dto.courier;
      sub.trackingNo = dto.trackingNo;
      sub.shippingNote = dto.note;
    }
    sub.status = dto.status;
    sub.events.push({ status: dto.status, by, note: dto.note });
    if (dto.status === 'DELIVERED') {
      sub.deliveredAt = new Date();
      if (sub.paymentMethod === 'COD') sub.paymentStatus = 'COLLECTED';
      await this.finance.onDelivered(sub);
      for (const it of sub.items) await this.products.updateOne({ _id: it.product }, { $inc: { soldCount: it.qty } });
    }
    await sub.save();
    const st = STATUS_TEXT[dto.status];
    const tracking = dto.status === 'SHIPPED' ? ` — ${sub.courier}${sub.trackingNo ? ` #${sub.trackingNo}` : ''}` : '';
    await this.notify.notify(
      sub.customer,
      `ORDER_${dto.status}`,
      { en: `Your order ${sub.number} is ${st.en}`, ar: `طلبك ${sub.number} ${st.ar}` },
      `/account/orders/${sub.number.split('-')[0]}`,
      ['SHIPPED', 'DELIVERED'].includes(dto.status)
        ? {
            body: {
              en: dto.status === 'SHIPPED' ? `Shipped with ${tracking.slice(3)}.` : 'We hope you love it. You can now leave a review.',
              ar: dto.status === 'SHIPPED' ? `تم الشحن مع ${tracking.slice(3)}.` : 'نتمنى أن تنال إعجابك. يمكنك الآن كتابة تقييم.',
            },
          }
        : undefined,
    );
    return sub;
  }

  async subForSeller(userId: string, id: string) {
    const seller = await this.sellers.findOne({ user: userId }).lean<any>();
    if (!seller) throw new ForbiddenException();
    const sub = await this.subs.findOne({ _id: id, seller: seller._id });
    if (!sub) throw new NotFoundException();
    return { sub, seller };
  }

  /* ═════════ Background jobs ═════════ */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireInstapay() {
    const late = await this.subs.find({ status: 'AWAITING_PAYMENT', paymentStatus: { $in: ['AWAITING_PROOF', 'REJECTED'] }, proofDeadline: { $lt: new Date() } });
    for (const sub of late) await this.cancel(sub, sub.customer, 'InstaPay payment proof not received in time', 'system').catch((e) => this.log.error(e));
  }

  @Cron(CronExpression.EVERY_HOUR)
  async flagLateReturns() {
    const late = await this.returns.find({ status: 'REQUESTED', flagged: false, sellerDeadline: { $lt: new Date() } });
    const admins = await this.users.find({ role: 'ADMIN' }).select('_id').lean();
    for (const r of late) {
      r.flagged = true;
      r.events.push({ status: 'FLAGGED', note: 'Seller did not respond in time' });
      await r.save();
      for (const a of admins) await this.notify.notify(a._id, 'RETURN_FLAGGED', { en: `Return ${r.number} needs attention`, ar: `مرتجع ${r.number} يحتاج متابعة` }, '/admin/returns');
    }
  }

  /** Keeps sale badges / prices correct when discounts start or end. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async refreshDiscounts() {
    const ps = await this.products.find({ 'discount.type': { $ne: null } });
    for (const p of ps) {
      const d = productDerived(p);
      if (d.effectivePrice !== p.effectivePrice || d.onSale !== p.onSale) {
        Object.assign(p, d);
        await p.save();
      }
    }
  }
}

/* ═════════ Customer ═════════ */
@Controller()
export class CustomerOrdersController {
  constructor(private readonly o: OrdersService) {}

  @Public()
  @Post('cart/price')
  price(@Body(new Zod(PriceDto)) b: z.infer<typeof PriceDto>, @CurrentUser() u?: AuthUser) {
    return this.o.price(b, u);
  }

  @Post('orders')
  checkout(@CurrentUser() u: AuthUser, @Body(new Zod(CheckoutDto)) b: z.infer<typeof CheckoutDto>) {
    return this.o.checkout(u, b);
  }

  @Get('orders')
  async mine(@CurrentUser() u: AuthUser, @Query() q: any) {
    const { limit, skip } = paginate(q, 50);
    return this.o.orders
      .find({ customer: u.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'subOrders', select: 'number status paymentMethod paymentStatus items.image items.title total seller', populate: { path: 'seller', select: 'storeName slug' } })
      .lean();
  }

  @Get('orders/:number')
  async one(@CurrentUser() u: AuthUser, @Param('number') number: string) {
    const order = await this.o.orders
      .findOne({ number, customer: u.id })
      .populate({ path: 'subOrders', populate: { path: 'seller', select: 'storeName slug logo phone email instapayHandle' } })
      .lean<any>();
    if (!order) throw new NotFoundException();
    const returns = await this.o.returns.find({ subOrder: { $in: order.subOrders.map((s: any) => s._id) } }).lean();
    const window = await this.o.settings.get('returnWindowDays');
    return { ...order, returns, returnWindowDays: window };
  }

  @Post('orders/sub/:id/proof')
  async proof(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(z.object({ file: z.string().min(1), referenceNo: z.string().min(4).max(60) }))) b: any) {
    const sub = await this.o.subs.findOne({ _id: id, customer: u.id });
    if (!sub) throw new NotFoundException();
    if (sub.status !== 'AWAITING_PAYMENT' || !['AWAITING_PROOF', 'REJECTED'].includes(sub.paymentStatus)) throw new BadRequestException('No payment proof needed');
    await this.o.files.assertOwned(b.file, u.id);
    try {
      await this.o.refs.create({ ref: b.referenceNo.trim().toUpperCase(), kind: 'CUSTOMER_PAYMENT', owner: sub._id });
    } catch {
      throw new BadRequestException('This transfer reference was already used on another order');
    }
    const seller = await this.o.sellers.findById(sub.seller).lean<any>();
    await this.o.files.share(b.file, [seller.user]);
    sub.proofs.push({ file: b.file, referenceNo: b.referenceNo.trim().toUpperCase() });
    sub.paymentStatus = 'PROOF_SUBMITTED';
    sub.proofDeadline = undefined;
    sub.events.push({ status: 'PROOF_SUBMITTED', by: u.id, note: b.referenceNo });
    await sub.save();
    await this.o.notify.notify(seller.user, 'PROOF_SUBMITTED', { en: `Payment proof for ${sub.number}`, ar: `إثبات دفع للطلب ${sub.number}` }, `/seller/orders/${sub._id}`, {
      body: { en: `Check ${egp(sub.total)} in your InstaPay account and confirm.`, ar: `تحقق من وصول ${egp(sub.total)} إلى حسابك على إنستاباي ثم أكّد.` },
    });
    return sub;
  }

  @Post('orders/sub/:id/cancel')
  async cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(Reason)) b: { reason: string }) {
    const sub = await this.o.subs.findOne({ _id: id, customer: u.id });
    if (!sub) throw new NotFoundException();
    if (['SHIPPED', 'DELIVERED'].includes(sub.status)) throw new BadRequestException('Shipped orders cannot be cancelled');
    return this.o.cancel(sub, u.id, b.reason, 'customer');
  }

  /* returns */
  @Get('returns')
  myReturns(@CurrentUser() u: AuthUser) {
    return this.o.returns.find({ customer: u.id }).sort({ createdAt: -1 }).populate('seller', 'storeName').populate('subOrder', 'number items').lean();
  }

  @Post('returns')
  async requestReturn(@CurrentUser() u: AuthUser, @Body(new Zod(ReturnDto)) b: z.infer<typeof ReturnDto>) {
    const sub = await this.o.subs.findOne({ _id: b.subOrder, customer: u.id });
    if (!sub) throw new NotFoundException();
    if (sub.status !== 'DELIVERED') throw new BadRequestException('Only delivered orders can be returned');
    const s = await this.o.settings.all();
    if (addDays(sub.deliveredAt, s.returnWindowDays) < new Date()) throw new BadRequestException(`The ${s.returnWindowDays}-day return window has passed`);
    if (await this.o.returns.exists({ subOrder: sub._id, status: { $in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } })) throw new BadRequestException('A return is already open for this order');
    for (const r of b.items) {
      const it = sub.items.id(r.item);
      if (!it) throw new BadRequestException('Unknown item');
      if (!it.returnable) throw new BadRequestException(`${it.title.en} is not returnable`);
      if (r.qty > it.qty - it.returnedQty) throw new BadRequestException('Quantity exceeds what can be returned');
    }
    for (const p of b.photos) await this.o.files.assertOwned(p, u.id);
    const seller = await this.o.sellers.findById(sub.seller).lean<any>();
    for (const p of b.photos) await this.o.files.share(p, [seller.user]);
    const ret = await this.o.returns.create({
      ...b,
      number: `R-${sub.number}`,
      customer: u.id,
      seller: sub.seller,
      returnShippingPaidBy: ['FAULTY', 'WRONG_ITEM'].includes(b.reason) ? 'SELLER' : 'CUSTOMER',
      sellerDeadline: addDays(new Date(), s.sellerReturnResponseDays),
      events: [{ status: 'REQUESTED', by: u.id, note: b.details }],
    });
    sub.status = 'RETURN_REQUESTED';
    sub.events.push({ status: 'RETURN_REQUESTED', by: u.id });
    await sub.save();
    await this.o.notify.notify(seller.user, 'RETURN_REQUESTED', { en: `Return requested on ${sub.number}`, ar: `طلب إرجاع على ${sub.number}` }, `/seller/returns`, {
      body: { en: `Please respond within ${s.sellerReturnResponseDays} days.`, ar: `يرجى الرد خلال ${s.sellerReturnResponseDays} أيام.` },
    });
    return ret;
  }

  @Post('returns/:id/dispute')
  async dispute(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(Reason)) b: { reason: string }) {
    const r = await this.o.returns.findOne({ _id: id, customer: u.id });
    if (!r) throw new NotFoundException();
    r.disputed = true;
    r.flagged = true;
    r.events.push({ status: 'DISPUTED', by: u.id, note: b.reason });
    await r.save();
    const admins = await this.o.users.find({ role: 'ADMIN' }).select('_id').lean();
    for (const a of admins) await this.o.notify.notify(a._id, 'RETURN_DISPUTE', { en: `Dispute on ${r.number}`, ar: `نزاع على ${r.number}` }, '/admin/returns');
    return r;
  }

  /* reviews */
  @Post('reviews')
  async review(
    @CurrentUser() u: AuthUser,
    @Body(new Zod(z.object({ subOrder: zId, item: zId, rating: z.number().int().min(1).max(5), text: z.string().max(2000).default('') }))) b: any,
  ) {
    const sub = await this.o.subs.findOne({ _id: b.subOrder, customer: u.id });
    if (!sub || !['DELIVERED', 'RETURN_REQUESTED', 'RETURNED'].includes(sub.status) || !sub.deliveredAt) throw new BadRequestException('You can review after delivery');
    const it = sub.items.id(b.item);
    if (!it) throw new NotFoundException();
    if (it.reviewed || (await this.o.reviews.exists({ product: it.product, subOrder: sub._id }))) throw new BadRequestException('Already reviewed');
    const review = await this.o.reviews.create({ product: it.product, seller: sub.seller, user: u.id, subOrder: sub._id, rating: b.rating, text: b.text });
    it.reviewed = true;
    await sub.save();
    await recomputeRatings(this.o, it.product, sub.seller);
    return review;
  }
}

export async function recomputeRatings(o: { reviews: Model<any>; products: Model<any>; sellers: Model<any> }, productId: any, sellerId: any) {
  const agg = async (match: any) => (await o.reviews.aggregate([{ $match: { ...match, hidden: false } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]))[0];
  const p = await agg({ product: new Types.ObjectId(String(productId)) });
  const s = await agg({ seller: new Types.ObjectId(String(sellerId)) });
  await o.products.updateOne({ _id: productId }, { rating: Math.round((p?.avg ?? 0) * 10) / 10, ratingCount: p?.n ?? 0 });
  await o.sellers.updateOne({ _id: sellerId }, { rating: Math.round((s?.avg ?? 0) * 10) / 10, ratingCount: s?.n ?? 0 });
}

/* ═════════ Seller ═════════ */
@Roles('SELLER')
@Controller('seller')
export class SellerOrdersController {
  constructor(private readonly o: OrdersService) {}

  @Get('orders')
  async list(@CurrentUser() u: AuthUser, @Query() q: any) {
    const seller = await this.o.sellers.findOne({ user: u.id }).lean<any>();
    if (!seller) throw new ForbiddenException();
    const { page, limit, skip } = paginate(q, 100);
    const f: any = { seller: seller._id };
    if (q.status) f.status = q.status;
    if (q.q) f.number = { $regex: escapeRegex(q.q), $options: 'i' };
    const [items, total] = await Promise.all([
      this.o.subs.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('customer', 'name phone').lean(),
      this.o.subs.countDocuments(f),
    ]);
    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  @Get('orders/:id')
  async one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const { sub } = await this.o.subForSeller(u.id, id);
    await sub.populate('customer', 'name phone email');
    return sub;
  }

  @Post('orders/:id/status')
  async status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(StatusDto)) b: z.infer<typeof StatusDto>) {
    const { sub } = await this.o.subForSeller(u.id, id);
    return this.o.setStatus(sub, u.id, b);
  }

  @Post('orders/:id/payment/:action')
  async payment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('action') action: string, @Body() body: any) {
    const { sub } = await this.o.subForSeller(u.id, id);
    if (sub.paymentStatus !== 'PROOF_SUBMITTED') throw new BadRequestException('No proof waiting for review');
    const proof = sub.proofs[sub.proofs.length - 1];
    if (action === 'confirm') {
      proof.status = 'CONFIRMED';
      sub.paymentStatus = 'CONFIRMED';
      sub.status = 'CONFIRMED';
      sub.events.push({ status: 'CONFIRMED', by: u.id, note: 'InstaPay payment confirmed' });
      await sub.save();
      await this.o.notify.notify(sub.customer, 'PAYMENT_CONFIRMED', { en: `Payment confirmed for ${sub.number}`, ar: `تم تأكيد الدفع للطلب ${sub.number}` }, `/account/orders/${sub.number.split('-')[0]}`, {
        body: { en: 'Your order is confirmed and will be prepared for shipping.', ar: 'تم تأكيد طلبك وسيتم تجهيزه للشحن.' },
      });
    } else if (action === 'reject') {
      const reason = Reason.parse(body).reason;
      const hours = await this.o.settings.get('instapayProofHours');
      proof.status = 'REJECTED';
      proof.reason = reason;
      sub.paymentStatus = 'REJECTED';
      sub.proofDeadline = addHours(new Date(), hours);
      sub.events.push({ status: 'PAYMENT_REJECTED', by: u.id, note: reason });
      await sub.save();
      await this.o.notify.notify(sub.customer, 'PAYMENT_REJECTED', { en: `Payment proof rejected for ${sub.number}`, ar: `تم رفض إثبات الدفع للطلب ${sub.number}` }, `/account/orders/${sub.number.split('-')[0]}`, {
        body: { en: `Reason: ${reason}. Upload a new proof within ${hours} hours or the order is cancelled.`, ar: `السبب: ${reason}. ارفع إثباتًا جديدًا خلال ${hours} ساعة وإلا سيتم إلغاء الطلب.` },
      });
    } else throw new BadRequestException();
    return sub;
  }

  @Post('orders/:id/cancel')
  async cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(Reason)) b: { reason: string }) {
    const { sub } = await this.o.subForSeller(u.id, id);
    return this.o.cancel(sub, u.id, b.reason, 'seller');
  }

  /** COD delivery refused / failed: cancels, restocks and counts against the customer's COD eligibility. */
  @Post('orders/:id/failed-delivery')
  async failed(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(Reason)) b: { reason: string }) {
    const { sub } = await this.o.subForSeller(u.id, id);
    if (sub.status !== 'SHIPPED') throw new BadRequestException('Only shipped orders');
    sub.status = 'CANCELLED';
    sub.cancelReason = `Delivery failed: ${b.reason}`;
    sub.events.push({ status: 'CANCELLED', by: u.id, note: sub.cancelReason });
    await sub.save();
    await this.o.releaseStock(sub);
    if (sub.paymentMethod === 'COD') await this.o.users.updateOne({ _id: sub.customer }, { $inc: { codFailures: 1 } });
    await this.o.notify.notify(sub.customer, 'DELIVERY_FAILED', { en: `Delivery failed for ${sub.number}`, ar: `فشل توصيل الطلب ${sub.number}` }, `/account/orders/${sub.number.split('-')[0]}`);
    return sub;
  }

  /* returns */
  @Get('returns')
  async returns(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    const seller = await this.o.sellers.findOne({ user: u.id }).lean<any>();
    return this.o.returns.find({ seller: seller._id, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).populate('customer', 'name phone').populate('subOrder', 'number items paymentMethod address').lean();
  }

  @Post('returns/:id/:action')
  async returnAction(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('action') action: string, @Body() body: any) {
    const seller = await this.o.sellers.findOne({ user: u.id }).lean<any>();
    const r = await this.o.returns.findOne({ _id: id, seller: seller._id });
    if (!r) throw new NotFoundException();
    const sub = await this.o.subs.findById(r.subOrder);
    const flow: Record<string, string> = { approve: 'REQUESTED', reject: 'REQUESTED', received: 'APPROVED', refunded: 'RECEIVED' };
    if (r.status !== flow[action]) throw new BadRequestException(`Cannot ${action} a return that is ${r.status}`);
    const link = `/account/orders/${sub.number.split('-')[0]}`;
    if (action === 'approve') {
      r.status = 'APPROVED';
    } else if (action === 'reject') {
      r.rejectReason = Reason.parse(body).reason;
      r.status = 'REJECTED';
      sub.status = 'DELIVERED';
      await sub.save();
    } else if (action === 'received') {
      r.status = 'RECEIVED';
      r.restock = body?.restock !== false;
      if (r.restock) await this.o.releaseStock(sub, r.items);
    } else if (action === 'refunded') {
      if (body?.refundProof) {
        await this.o.files.assertOwned(body.refundProof, u.id);
        await this.o.files.share(body.refundProof, [r.customer]);
        r.refundProof = body.refundProof;
      }
      let refund = 0;
      for (const ri of r.items) {
        const it = sub.items.id(ri.item);
        it.returnedQty += ri.qty;
        refund += Math.round(it.unitPrice * ri.qty - (it.couponShare * ri.qty) / it.qty);
      }
      r.refundAmount = refund;
      r.status = 'REFUNDED';
      const fully = sub.items.every((i: any) => i.returnedQty >= i.qty);
      sub.status = fully ? 'RETURNED' : 'DELIVERED';
      sub.events.push({ status: fully ? 'RETURNED' : 'PARTIALLY_RETURNED', by: u.id });
      await sub.save();
      await this.o.finance.onRefund(sub, r.items);
    } else throw new BadRequestException();
    r.events.push({ status: r.status, by: u.id, note: r.rejectReason });
    await r.save();
    const t: Record<string, { en: string; ar: string }> = {
      APPROVED: { en: 'Return approved', ar: 'تمت الموافقة على الإرجاع' },
      REJECTED: { en: 'Return rejected', ar: 'تم رفض الإرجاع' },
      RECEIVED: { en: 'Returned items received', ar: 'تم استلام المنتجات المرتجعة' },
      REFUNDED: { en: 'Refund completed', ar: 'تم رد المبلغ' },
    };
    await this.o.notify.notify(r.customer, 'RETURN_UPDATE', { en: `${t[r.status].en} · ${r.number}`, ar: `${t[r.status].ar} · ${r.number}` }, link, {
      body: {
        en: r.status === 'REJECTED' ? `Reason: ${r.rejectReason}. You can dispute this from your order page.` : r.status === 'REFUNDED' ? `Refunded: ${egp(r.refundAmount)}` : 'We will keep you updated.',
        ar: r.status === 'REJECTED' ? `السبب: ${r.rejectReason}. يمكنك الاعتراض من صفحة الطلب.` : r.status === 'REFUNDED' ? `المبلغ المرتجع: ${egp(r.refundAmount)}` : 'سنوافيك بالتحديثات.',
      },
    });
    return r;
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser) {
    const seller = await this.o.sellers.findOne({ user: u.id }).lean<any>();
    if (!seller) throw new ForbiddenException();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const since30 = addDays(dayStart, -29);
    const live = { seller: seller._id, status: { $nin: ['CANCELLED', 'AWAITING_PAYMENT'] } };
    const sum = async (from: Date) =>
      (await this.o.subs.aggregate([{ $match: { ...live, createdAt: { $gte: from } } }, { $group: { _id: null, t: { $sum: '$itemsTotal' }, n: { $sum: 1 } } }]))[0] ?? { t: 0, n: 0 };
    const [today, month, newOrders, toShip, pendingReturns, proofs, chart, recent, balance, pendingProducts] = await Promise.all([
      sum(dayStart),
      sum(monthStart),
      this.o.subs.countDocuments({ seller: seller._id, status: 'PENDING' }),
      this.o.subs.countDocuments({ seller: seller._id, status: { $in: ['CONFIRMED', 'PROCESSING'] } }),
      this.o.returns.countDocuments({ seller: seller._id, status: { $in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } }),
      this.o.subs.countDocuments({ seller: seller._id, paymentStatus: 'PROOF_SUBMITTED' }),
      this.o.subs.aggregate([
        { $match: { ...live, createdAt: { $gte: since30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Cairo' } }, total: { $sum: '$itemsTotal' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.o.subs.find({ seller: seller._id }).sort({ createdAt: -1 }).limit(8).populate('customer', 'name').lean(),
      this.o.finance.balance(seller._id),
      this.o.products.countDocuments({ seller: seller._id, status: 'PENDING' }),
    ]);
    return { seller, today, month, newOrders, toShip, pendingReturns, proofs, chart, recent, commissionDue: balance, pendingProducts };
  }
}

/* ═════════ Admin oversight ═════════ */
@Roles('ADMIN')
@Controller('admin')
export class AdminOrdersController {
  constructor(private readonly o: OrdersService) {}

  @AdminPerm('orders')
  @Get('orders')
  async list(@Query() q: any) {
    const { page, limit, skip } = paginate(q, 100);
    const f: any = {};
    if (q.status) f.status = q.status;
    if (q.seller) f.seller = q.seller;
    if (q.payment) f.paymentStatus = q.payment;
    if (q.q) f.number = { $regex: escapeRegex(q.q), $options: 'i' };
    const [items, total] = await Promise.all([
      this.o.subs.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('seller', 'storeName').populate('customer', 'name email').lean(),
      this.o.subs.countDocuments(f),
    ]);
    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  @AdminPerm('orders')
  @Get('orders/:id')
  async one(@Param('id') id: string) {
    const sub = await this.o.subs.findById(id).populate('seller').populate('customer', 'name email phone codFailures').populate('events.by', 'name role').lean();
    if (!sub) throw new NotFoundException();
    const returns = await this.o.returns.find({ subOrder: id }).lean();
    return { ...sub, returns };
  }

  @AdminPerm('orders')
  @Post('orders/:id/note')
  async note(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(z.object({ note: z.string().min(1).max(1000) }))) b: any) {
    await this.o.subs.updateOne({ _id: id }, { $push: { events: { status: 'ADMIN_NOTE', by: u.id, note: b.note } } });
    return { ok: true };
  }

  @AdminPerm('orders')
  @Post('orders/:id/cancel')
  async cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(Reason)) b: { reason: string }) {
    const sub = await this.o.subs.findById(id);
    if (!sub) throw new NotFoundException();
    return this.o.cancel(sub, u.id, b.reason, 'admin');
  }

  @AdminPerm('orders')
  @Get('returns')
  returns(@Query() q: any) {
    const f: any = {};
    if (q.flagged === 'true') f.flagged = true;
    if (q.status) f.status = q.status;
    return this.o.returns.find(f).sort({ flagged: -1, createdAt: -1 }).limit(300).populate('seller', 'storeName').populate('customer', 'name email').populate('subOrder', 'number items').lean();
  }

  @AdminPerm('orders')
  @Post('returns/:id/note')
  async returnNote(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(z.object({ note: z.string().min(1).max(1000), resolve: z.boolean().default(false) }))) b: any) {
    const r = await this.o.returns.findById(id);
    if (!r) throw new NotFoundException();
    r.adminNote = b.note;
    r.events.push({ status: 'ADMIN_NOTE', by: u.id, note: b.note });
    if (b.resolve) r.flagged = false;
    await r.save();
    const seller = await this.o.sellers.findById(r.seller).lean<any>();
    const t = { en: `OTD support note on return ${r.number}`, ar: `ملاحظة من دعم OTD على المرتجع ${r.number}` };
    const body = { body: { en: b.note, ar: b.note } };
    await this.o.notify.notify(r.customer, 'RETURN_ADMIN', t, '/account/returns', body);
    await this.o.notify.notify(seller.user, 'RETURN_ADMIN', t, '/seller/returns', body);
    return r;
  }

  @AdminPerm('products')
  @Get('reviews')
  reviews(@Query('hidden') hidden?: string) {
    return this.o.reviews.find(hidden ? { hidden: hidden === 'true' } : {}).sort({ createdAt: -1 }).limit(300).populate('product', 'title slug').populate('user', 'name').lean();
  }

  @AdminPerm('products')
  @Post('reviews/:id/visibility')
  async hideReview(@Param('id') id: string, @Body(new Zod(z.object({ hidden: z.boolean() }))) b: { hidden: boolean }) {
    const r = await this.o.reviews.findByIdAndUpdate(id, { hidden: b.hidden }, { new: true });
    if (!r) throw new NotFoundException();
    await recomputeRatings(this.o, r.product, r.seller);
    return r;
  }
}

@Module({
  imports: [FinanceModule],
  providers: [OrdersService],
  controllers: [CustomerOrdersController, SellerOrdersController, AdminOrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
