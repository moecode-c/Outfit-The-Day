import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import type { Response } from 'express';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { AdminPerm, AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { escapeRegex, paginate, Zod, zI18n, zId } from '../common/util';
import { SettingsService } from '../db/settings.service';

const CouponDto = z.object({
  code: z.string().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().positive(),
  maxDiscount: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  minOrder: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  newCustomersOnly: z.boolean().default(false),
  excludesDiscounted: z.boolean().default(false),
  scope: z.enum(['GLOBAL', 'SELLERS']),
  sellers: z.array(zId).default([]),
  active: z.boolean().default(true),
});
const BannerDto = z.object({
  placement: z.enum(['HERO', 'EDIT']),
  kicker: zI18n.optional(),
  title: zI18n,
  subtitle: zI18n.optional(),
  image: z.string().optional(),
  link: z.string().max(300).optional(),
  cta: zI18n.optional(),
  sort: z.number().int().default(0),
  active: z.boolean().default(true),
});
const PageDto = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), title: zI18n, body: zI18n });
const GovDto = z.object({
  name: zI18n,
  cities: z.array(z.string().min(1)).default([]),
  shippingFee: z.number().int().min(0),
  etaDays: z.number().int().min(0).max(30),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});

const csv = (rows: any[][]) => '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

@Controller()
export class ContentController {
  constructor(
    @InjectModel('Banner') private readonly banners: Model<any>,
    @InjectModel('Page') private readonly pages: Model<any>,
    @InjectModel('Product') private readonly products: Model<any>,
    @InjectModel('Look') private readonly looks: Model<any>,
    @InjectModel('Seller') private readonly sellers: Model<any>,
    @InjectModel('Category') private readonly categories: Model<any>,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @Get('content/home')
  async home() {
    const s = await this.settings.all();
    const live = { status: 'LIVE', sellerActive: true };
    const card = 'title slug price effectivePrice onSale colors.images colors.hex colors.name colors._id rating ratingCount seller totalStock';
    const pop = { path: 'seller', select: 'storeName slug' };
    const [banners, newIn, best, sale, looks, brands, categories] = await Promise.all([
      this.banners.find({ active: true }).sort({ sort: 1 }).lean(),
      this.products.find(live).sort({ publishedAt: -1 }).limit(12).select(card).populate(pop).lean(),
      this.products.find(live).sort({ soldCount: -1 }).limit(12).select(card).populate(pop).lean(),
      this.products.find({ ...live, onSale: true }).sort({ updatedAt: -1 }).limit(12).select(card).populate(pop).lean(),
      this.looks.find({ active: true }).sort({ featured: -1, createdAt: -1 }).limit(6).populate('seller', 'storeName slug').lean(),
      this.sellers.find({ status: 'APPROVED' }).sort({ rating: -1 }).limit(12).select('storeName slug logo banner').lean(),
      s.home.featuredCategories?.length
        ? this.categories.find({ _id: { $in: s.home.featuredCategories }, active: true }).lean()
        : this.categories.find({ parent: null, active: true }).sort({ sort: 1 }).limit(8).lean(),
    ]);
    return { banners, newIn, best, sale, looks, brands, categories, ticker: { en: s.home.tickerEn, ar: s.home.tickerAr } };
  }

  @Public()
  @Get('content/config')
  async config() {
    const s = await this.settings.all();
    return { returnWindowDays: s.returnWindowDays, codMaxOrder: s.codMaxOrder, instapayProofHours: s.instapayProofHours, ticker: { en: s.home.tickerEn, ar: s.home.tickerAr } };
  }

  @Public()
  @Get('pages/:slug')
  async page(@Param('slug') slug: string) {
    const p = await this.pages.findOne({ slug }).lean();
    if (!p) throw new NotFoundException();
    return p;
  }
}

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Seller') private readonly sellers: Model<any>,
    @InjectModel('Product') private readonly products: Model<any>,
    @InjectModel('SubOrder') private readonly subs: Model<any>,
    @InjectModel('Order') private readonly orders: Model<any>,
    @InjectModel('Return') private readonly returns: Model<any>,
    @InjectModel('Ledger') private readonly ledger: Model<any>,
    @InjectModel('Invoice') private readonly invoices: Model<any>,
    @InjectModel('SellerPayment') private readonly payments: Model<any>,
    @InjectModel('Coupon') private readonly coupons: Model<any>,
    @InjectModel('CouponRedemption') private readonly redemptions: Model<any>,
    @InjectModel('Banner') private readonly banners: Model<any>,
    @InjectModel('Page') private readonly pages: Model<any>,
    @InjectModel('Governorate') private readonly govs: Model<any>,
    @InjectModel('Mail') private readonly mails: Model<any>,
    @InjectModel('Category') private readonly categories: Model<any>,
    private readonly settings: SettingsService,
  ) {}

  /* ── dashboard ── */
  @Get('dashboard')
  async dashboard() {
    const valid = { status: { $nin: ['CANCELLED', 'AWAITING_PAYMENT'] } };
    const [sales, commission, unpaid, sellers, customers, orders, topSellers, topProducts, alerts] = await Promise.all([
      this.subs.aggregate([{ $match: valid }, { $group: { _id: null, t: { $sum: '$itemsTotal' } } }]),
      this.ledger.aggregate([{ $match: { type: { $ne: 'PAYMENT' } } }, { $group: { _id: '$type', t: { $sum: '$amount' } } }]),
      this.ledger.aggregate([{ $group: { _id: '$seller', b: { $sum: '$amount' } } }, { $match: { b: { $gt: 0 } } }, { $group: { _id: null, t: { $sum: '$b' } } }]),
      this.sellers.countDocuments({ status: 'APPROVED' }),
      this.users.countDocuments({ role: 'CUSTOMER' }),
      this.orders.countDocuments(),
      this.subs.aggregate([
        { $match: { status: 'DELIVERED' } },
        { $group: { _id: '$seller', total: { $sum: '$itemsTotal' }, n: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 's' } },
        { $project: { total: 1, n: 1, name: { $arrayElemAt: ['$s.storeName', 0] } } },
      ]),
      this.products.find({ soldCount: { $gt: 0 } }).sort({ soldCount: -1 }).limit(5).select('title slug soldCount').lean(),
      Promise.all([
        this.sellers.countDocuments({ status: 'PENDING' }),
        this.products.countDocuments({ status: 'PENDING' }),
        this.invoices.countDocuments({ status: 'OVERDUE' }),
        this.returns.countDocuments({ flagged: true }),
        this.payments.countDocuments({ status: 'SUBMITTED' }),
      ]),
    ]);
    const byType = (t: string) => commission.find((c: any) => c._id === t)?.t ?? 0;
    return {
      totalSales: sales[0]?.t ?? 0,
      commissionGross: byType('COMMISSION'),
      couponCost: -byType('COUPON_CREDIT'),
      commissionEarned: commission.reduce((s: number, c: any) => s + c.t, 0), // net of coupons, reversals, adjustments
      commissionUnpaid: unpaid[0]?.t ?? 0,
      sellers,
      customers,
      orders,
      topSellers,
      topProducts,
      alerts: { pendingSellers: alerts[0], pendingProducts: alerts[1], overdueInvoices: alerts[2], disputes: alerts[3], pendingPayments: alerts[4] },
    };
  }

  /* ── users ── */
  @AdminPerm('users')
  @Get('users')
  async usersList(@Query() q: any) {
    const { page, limit, skip } = paginate(q, 100);
    const f: any = {};
    if (q.role) f.role = q.role;
    if (q.q) f.$or = ['name', 'email', 'phone'].map((k) => ({ [k]: { $regex: escapeRegex(q.q), $options: 'i' } }));
    const [items, total] = await Promise.all([
      this.users.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).select('name email phone role adminPerms blockedAt codFailures ordersCount createdAt emailVerifiedAt').lean(),
      this.users.countDocuments(f),
    ]);
    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  @AdminPerm('users')
  @Get('users/:id')
  async userDetail(@Param('id') id: string) {
    const u = await this.users.findById(id).select('-passwordHash -refreshHash -verifyToken -resetToken').lean();
    if (!u) throw new NotFoundException();
    const orders = await this.subs.find({ customer: id }).sort({ createdAt: -1 }).limit(50).populate('seller', 'storeName').lean();
    return { user: u, orders };
  }

  @AdminPerm('users')
  @Post('users/:id/block')
  async block(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new Zod(z.object({ blocked: z.boolean(), resetCod: z.boolean().optional() }))) b: any) {
    if (id === me.id) throw new BadRequestException('You cannot block yourself');
    const patch: any = { blockedAt: b.blocked ? new Date() : null };
    if (b.blocked) patch.refreshHash = null;
    if (b.resetCod) patch.codFailures = 0;
    await this.users.updateOne({ _id: id }, patch);
    return { ok: true };
  }

  /* ── admin accounts ── */
  @AdminPerm('*')
  @Post('admins')
  async createAdmin(
    @Body(new Zod(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), perms: z.array(z.string()).min(1) }))) b: any,
  ) {
    const existing = await this.users.findOne({ email: b.email.toLowerCase() });
    if (existing) {
      existing.role = 'ADMIN';
      existing.adminPerms = b.perms;
      await existing.save();
      return { ok: true, promoted: true };
    }
    await this.users.create({ name: b.name, email: b.email, passwordHash: await argon2.hash(b.password), role: 'ADMIN', adminPerms: b.perms, emailVerifiedAt: new Date() });
    return { ok: true };
  }

  @AdminPerm('*')
  @Patch('admins/:id')
  async updateAdmin(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new Zod(z.object({ perms: z.array(z.string()), revoke: z.boolean().default(false) }))) b: any) {
    if (id === me.id) throw new BadRequestException('You cannot change your own permissions');
    await this.users.updateOne({ _id: id, role: 'ADMIN' }, b.revoke ? { role: 'CUSTOMER', adminPerms: [] } : { adminPerms: b.perms });
    return { ok: true };
  }

  /* ── coupons ── */
  @AdminPerm('coupons')
  @Get('coupons')
  couponsList() {
    return this.coupons.find().sort({ createdAt: -1 }).populate('sellers', 'storeName').lean();
  }

  @AdminPerm('coupons')
  @Post('coupons')
  async createCoupon(@Body(new Zod(CouponDto)) b: z.infer<typeof CouponDto>) {
    this.checkCoupon(b);
    if (await this.coupons.exists({ code: b.code.toUpperCase() })) throw new BadRequestException('Code already exists');
    return this.coupons.create(b);
  }

  @AdminPerm('coupons')
  @Put('coupons/:id')
  async updateCoupon(@Param('id') id: string, @Body(new Zod(CouponDto)) b: z.infer<typeof CouponDto>) {
    this.checkCoupon(b);
    if (await this.coupons.exists({ code: b.code.toUpperCase(), _id: { $ne: id } })) throw new BadRequestException('Code already exists');
    return this.coupons.findByIdAndUpdate(id, { ...b, code: b.code.toUpperCase() }, { new: true });
  }

  @AdminPerm('coupons')
  @Delete('coupons/:id')
  async deleteCoupon(@Param('id') id: string) {
    if (await this.redemptions.exists({ coupon: id })) {
      await this.coupons.updateOne({ _id: id }, { active: false });
      return { ok: true, deactivated: true };
    }
    await this.coupons.deleteOne({ _id: id });
    return { ok: true };
  }

  private checkCoupon(b: z.infer<typeof CouponDto>) {
    if (b.type === 'PERCENT' && b.value > 100) throw new BadRequestException('Percent cannot exceed 100');
    if (b.scope === 'SELLERS' && !b.sellers.length) throw new BadRequestException('Pick at least one brand');
    if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt) throw new BadRequestException('End must be after start');
  }

  /* ── settings ── */
  @AdminPerm('settings')
  @Get('settings')
  getSettings() {
    return this.settings.all();
  }

  @AdminPerm('settings')
  @Put('settings')
  putSettings(@Body() b: any) {
    const n = z
      .object({
        commissionRate: z.number().min(0).max(100),
        billingCycle: z.enum(['WEEKLY', 'MONTHLY']),
        invoiceDueDays: z.number().int().min(1).max(60),
        overdueWarningDays: z.number().int().min(1).max(90),
        overdueSuspendDays: z.number().int().min(1).max(180),
        returnWindowDays: z.number().int().min(0).max(90),
        sellerReturnResponseDays: z.number().int().min(1).max(30),
        instapayProofHours: z.number().int().min(1).max(168),
        codMaxOrder: z.number().int().min(0),
        codMaxFailures: z.number().int().min(1).max(20),
        productModeration: z.enum(['ALL', 'OFF']),
        platformInstapay: z.string().min(3),
        defaultShippingFee: z.number().int().min(0),
        home: z.object({ featuredCategories: z.array(zId), tickerEn: z.array(z.string()), tickerAr: z.array(z.string()) }),
      })
      .partial()
      .safeParse(b);
    if (!n.success) throw new BadRequestException(n.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return this.settings.set(n.data);
  }

  /* ── content ── */
  @AdminPerm('content')
  @Get('banners')
  bannerList() {
    return this.banners.find().sort({ placement: 1, sort: 1 }).lean();
  }
  @AdminPerm('content')
  @Post('banners')
  bannerCreate(@Body(new Zod(BannerDto)) b: any) {
    return this.banners.create(b);
  }
  @AdminPerm('content')
  @Put('banners/:id')
  bannerUpdate(@Param('id') id: string, @Body(new Zod(BannerDto)) b: any) {
    return this.banners.findByIdAndUpdate(id, b, { new: true });
  }
  @AdminPerm('content')
  @Delete('banners/:id')
  async bannerDelete(@Param('id') id: string) {
    await this.banners.deleteOne({ _id: id });
    return { ok: true };
  }

  @AdminPerm('content')
  @Get('pages')
  pageList() {
    return this.pages.find().sort({ slug: 1 }).lean();
  }
  @AdminPerm('content')
  @Put('pages')
  pageUpsert(@Body(new Zod(PageDto)) b: any) {
    return this.pages.findOneAndUpdate({ slug: b.slug }, b, { upsert: true, new: true });
  }
  @AdminPerm('content')
  @Delete('pages/:slug')
  async pageDelete(@Param('slug') slug: string) {
    await this.pages.deleteOne({ slug });
    return { ok: true };
  }

  @AdminPerm('settings')
  @Get('governorates')
  govList() {
    return this.govs.find().sort({ sort: 1 }).lean();
  }
  @AdminPerm('settings')
  @Post('governorates')
  govCreate(@Body(new Zod(GovDto)) b: any) {
    return this.govs.create(b);
  }
  @AdminPerm('settings')
  @Put('governorates/:id')
  govUpdate(@Param('id') id: string, @Body(new Zod(GovDto)) b: any) {
    return this.govs.findByIdAndUpdate(id, b, { new: true });
  }

  @AdminPerm('settings')
  @Get('outbox')
  outbox() {
    return this.mails.find().sort({ createdAt: -1 }).limit(100).lean();
  }

  /* ── reports ── */
  @AdminPerm('reports')
  @Get('reports/:kind')
  async report(@Param('kind') kind: string, @Query() q: any, @Res({ passthrough: true }) res: Response) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = q.to ? new Date(new Date(q.to).getTime() + 86_399_999) : new Date();
    const range = { createdAt: { $gte: from, $lte: to } };
    let rows: any[] = [];
    let header: string[] = [];

    if (kind === 'sales') {
      const by = ['seller', 'category', 'day'].includes(q.by) ? q.by : 'seller';
      const pipeline: any[] = [{ $match: { ...range, status: { $nin: ['CANCELLED', 'AWAITING_PAYMENT'] } } }];
      if (by === 'category') pipeline.push({ $unwind: '$items' }, { $group: { _id: '$items.category', sales: { $sum: '$items.lineTotal' }, units: { $sum: '$items.qty' }, orders: { $addToSet: '$_id' } } });
      else if (by === 'day') pipeline.push({ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Cairo' } }, sales: { $sum: '$itemsTotal' }, coupon: { $sum: '$couponShare' }, shipping: { $sum: '$shippingFee' }, orders: { $sum: 1 }, commission: { $sum: '$commissionAmount' } } });
      else pipeline.push({ $group: { _id: '$seller', sales: { $sum: '$itemsTotal' }, coupon: { $sum: '$couponShare' }, shipping: { $sum: '$shippingFee' }, orders: { $sum: 1 }, commission: { $sum: '$commissionAmount' } } });
      pipeline.push({ $sort: by === 'day' ? { _id: 1 } : { sales: -1 } });
      const data = await this.subs.aggregate(pipeline);
      const names: Record<string, string> = {};
      if (by === 'seller') (await this.sellers.find({ _id: { $in: data.map((d) => d._id) } }).lean<any[]>()).forEach((s) => (names[String(s._id)] = s.storeName.en));
      if (by === 'category') (await this.categories.find({ _id: { $in: data.map((d) => d._id) } }).lean<any[]>()).forEach((c) => (names[String(c._id)] = c.name.en));
      header = by === 'category' ? ['Category', 'Sales (EGP)', 'Units', 'Orders'] : [by === 'day' ? 'Day' : 'Brand', 'Sales (EGP)', 'Coupons (EGP)', 'Shipping (EGP)', 'Orders', 'Commission (EGP)'];
      rows = data.map((d) =>
        by === 'category'
          ? [names[String(d._id)] ?? '—', d.sales / 100, d.units, d.orders.length]
          : [by === 'day' ? d._id : (names[String(d._id)] ?? '—'), d.sales / 100, d.coupon / 100, d.shipping / 100, d.orders, d.commission / 100],
      );
    } else if (kind === 'commission') {
      const data = await this.ledger.aggregate([{ $match: range }, { $group: { _id: { seller: '$seller', type: '$type' }, t: { $sum: '$amount' } } }]);
      const sellers = await this.sellers.find({ _id: { $in: data.map((d) => d._id.seller) } }).lean<any[]>();
      header = ['Brand', 'Commission', 'Coupon credits', 'Return reversals', 'Adjustments', 'Payments', 'Net'];
      rows = sellers.map((s) => {
        const g = (t: string) => (data.find((d) => String(d._id.seller) === String(s._id) && d._id.type === t)?.t ?? 0) / 100;
        const vals = ['COMMISSION', 'COUPON_CREDIT', 'RETURN_REVERSAL', 'ADJUSTMENT', 'PAYMENT'].map(g);
        return [s.storeName.en, ...vals, vals.reduce((a, b) => a + b, 0)];
      });
    } else if (kind === 'coupons') {
      const data = await this.redemptions.aggregate([{ $match: range }, { $group: { _id: '$coupon', uses: { $sum: 1 }, amount: { $sum: '$amount' } } }]);
      const cs = await this.coupons.find({ _id: { $in: data.map((d) => d._id) } }).lean<any[]>();
      header = ['Code', 'Scope', 'Uses', 'Discount given (EGP)'];
      rows = data.map((d) => {
        const c = cs.find((x) => String(x._id) === String(d._id));
        return [c?.code, c?.scope, d.uses, d.amount / 100];
      });
    } else if (kind === 'returns') {
      const data = await this.returns.find(range).populate('seller', 'storeName').lean<any[]>();
      header = ['Return', 'Brand', 'Reason', 'Status', 'Refund (EGP)', 'Flagged', 'Created'];
      rows = data.map((r) => [r.number, r.seller?.storeName?.en, r.reason, r.status, (r.refundAmount ?? 0) / 100, r.flagged ? 'yes' : '', new Date(r.createdAt).toISOString().slice(0, 10)]);
    } else throw new BadRequestException('Unknown report');

    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="otd-${kind}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
      return csv([header, ...rows]);
    }
    return { header, rows };
  }
}

@Module({ controllers: [ContentController, AdminController] })
export class AdminModule {}

export { Types };
