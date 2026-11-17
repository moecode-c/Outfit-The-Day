import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { AdminPerm, AuthUser, CurrentUser, Roles } from '../common/auth';
import { addDays, egp, randomCode, Zod, zId } from '../common/util';
import { sendDownload } from '../common/exports';
import { SettingsService } from '../db/settings.service';
import { commissionInvoicePdf, statementPdf, statementXlsx } from './documents';
import { FilesService } from './files';
import { NotifyService } from './notify';

/**
 * Commission model: the seller collects the customer's money and owes the platform its commission.
 * Ledger amounts: + = seller owes platform, − = platform owes seller (coupon credits, reversals, payments).
 */
@Injectable()
export class FinanceService {
  private readonly log = new Logger('Finance');

  constructor(
    @InjectModel('Ledger') readonly ledger: Model<any>,
    @InjectModel('Invoice') readonly invoices: Model<any>,
    @InjectModel('SellerPayment') readonly payments: Model<any>,
    @InjectModel('Seller') readonly sellers: Model<any>,
    @InjectModel('Category') readonly categories: Model<any>,
    @InjectModel('Product') readonly products: Model<any>,
    @InjectModel('PaymentRef') readonly refs: Model<any>,
    @InjectModel('User') readonly users: Model<any>,
    readonly settings: SettingsService,
    readonly notify: NotifyService,
    readonly files: FilesService,
  ) {}

  /** Priority: seller override → category (walking up parents) → platform default. */
  async commissionRate(seller: any, categoryId: any): Promise<number> {
    if (seller.commissionRate != null) return seller.commissionRate;
    let cat = await this.categories.findById(categoryId).lean<any>();
    while (cat) {
      if (cat.commissionRate != null) return cat.commissionRate;
      cat = cat.parent ? await this.categories.findById(cat.parent).lean<any>() : null;
    }
    return this.settings.get('commissionRate');
  }

  async balance(sellerId: any): Promise<number> {
    const r = await this.ledger.aggregate([{ $match: { seller: new Types.ObjectId(String(sellerId)) } }, { $group: { _id: null, t: { $sum: '$amount' } } }]);
    return r[0]?.t ?? 0;
  }

  /** Called when a sub-order becomes DELIVERED. */
  async onDelivered(sub: any) {
    const commission = sub.items.reduce((s: number, i: any) => s + Math.round((i.lineTotal * (i.commissionRate ?? 0)) / 100), 0);
    sub.commissionAmount = commission;
    const entries: any[] = [{ seller: sub.seller, subOrder: sub._id, type: 'COMMISSION', amount: commission, note: `Order ${sub.number}` }];
    if (sub.couponShare > 0) {
      entries.push({ seller: sub.seller, subOrder: sub._id, type: 'COUPON_CREDIT', amount: -sub.couponShare, note: `Platform-funded coupon on ${sub.number}` });
    }
    await this.ledger.insertMany(entries);
  }

  /** Called when a return is refunded: reverse commission on returned items and the coupon credit portion. */
  async onRefund(sub: any, returned: { item: any; qty: number }[]) {
    let commissionBack = 0;
    let couponBack = 0;
    for (const r of returned) {
      const it = sub.items.find((i: any) => String(i._id) === String(r.item));
      if (!it) continue;
      const share = r.qty / it.qty;
      commissionBack += Math.round(it.lineTotal * share * (it.commissionRate ?? 0) / 100);
      couponBack += Math.round((it.couponShare ?? 0) * share);
    }
    const amount = -commissionBack + couponBack;
    if (amount !== 0) {
      await this.ledger.create({ seller: sub.seller, subOrder: sub._id, type: 'RETURN_REVERSAL', amount, note: `Return on ${sub.number}` });
    }
  }

  async statement(sellerId: any) {
    const [entries, invoices, payments, balance] = await Promise.all([
      this.ledger.find({ seller: sellerId }).sort({ createdAt: -1 }).limit(500).populate('subOrder', 'number').lean(),
      this.invoices.find({ seller: sellerId }).sort({ createdAt: -1 }).lean(),
      this.payments.find({ seller: sellerId }).sort({ createdAt: -1 }).lean(),
      this.balance(sellerId),
    ]);
    const sum = (t: string) => entries.filter((e: any) => e.type === t).reduce((s: number, e: any) => s + e.amount, 0);
    return {
      balance,
      totals: { commission: sum('COMMISSION'), couponCredits: -sum('COUPON_CREDIT'), reversals: sum('RETURN_REVERSAL'), paid: -sum('PAYMENT') },
      entries,
      invoices,
      payments,
      platformInstapay: await this.settings.get('platformInstapay'),
    };
  }

  /** Statement download as PDF or XLSX. */
  async sendStatement(res: Response, seller: any, format: string) {
    if (format !== 'pdf' && format !== 'xlsx') throw new BadRequestException('Format must be pdf or xlsx');
    const st = await this.statement(seller._id);
    const body = format === 'pdf' ? await statementPdf(seller, st) : await statementXlsx(seller, st);
    sendDownload(res, body, format, `otd-statement-${seller.slug ?? seller._id}-${new Date().toISOString().slice(0, 10)}`);
  }

  /* ───────── billing cycle ───────── */
  async runBilling(force = false) {
    const s = await this.settings.all();
    const now = new Date();
    const last = s.lastInvoiceRun ? new Date(s.lastInvoiceRun) : null;
    if (!force && last) {
      const due =
        s.billingCycle === 'MONTHLY'
          ? now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear()
          : now.getTime() - last.getTime() >= 7 * 86_400_000;
      if (!due) return { created: 0, skipped: true };
    }
    const periodStart = last ?? new Date(0);
    const sellerIds: any[] = await this.ledger.distinct('seller', { invoice: null, type: { $ne: 'PAYMENT' } });
    let created = 0;
    for (const sellerId of sellerIds) {
      const entries = await this.ledger.find({ seller: sellerId, invoice: null, type: { $ne: 'PAYMENT' } }).lean<any[]>();
      if (!entries.length) continue;
      const periodTotal = entries.reduce((t, e) => t + e.amount, 0);
      const prior = (await this.balance(sellerId)) - periodTotal; // everything except this period
      const amountDue = Math.max(0, periodTotal + Math.min(0, prior));
      const inv = await this.invoices.create({
        seller: sellerId,
        number: `INV-${now.toISOString().slice(2, 10).replace(/-/g, '')}-${randomCode(5)}`,
        periodStart,
        periodEnd: now,
        openingBalance: prior,
        periodTotal,
        amountDue,
        dueAt: addDays(now, s.invoiceDueDays),
        status: amountDue > 0 ? 'DUE' : 'CREDIT',
      });
      await this.ledger.updateMany({ _id: { $in: entries.map((e) => e._id) } }, { invoice: inv._id });
      const seller = await this.sellers.findById(sellerId).lean<any>();
      await this.notify.notify(
        seller.user,
        'COMMISSION_INVOICE',
        { en: `Commission invoice ${inv.number}`, ar: `فاتورة العمولة ${inv.number}` },
        '/seller/finance',
        {
          body: {
            en: `Amount due: <b>${egp(amountDue)}</b>, due by ${inv.dueAt.toDateString()}. Pay by InstaPay to ${s.platformInstapay} and upload the screenshot.`,
            ar: `المبلغ المستحق: <b>${egp(amountDue)}</b> قبل ${inv.dueAt.toDateString()}. ادفع عبر إنستاباي إلى ${s.platformInstapay} وارفع صورة التحويل.`,
          },
        },
      );
      created++;
    }
    await this.settings.set({ lastInvoiceRun: now.toISOString() });
    this.log.log(`Billing run: ${created} invoices`);
    return { created };
  }

  /** Reminders, warnings and auto-suspension for unpaid invoices. */
  async enforceLatePayments() {
    const s = await this.settings.all();
    const now = new Date();
    const open = await this.invoices.find({ status: { $in: ['DUE', 'OVERDUE'] } });
    for (const inv of open) {
      if (inv.paid >= inv.amountDue) continue;
      const daysLate = Math.floor((now.getTime() - inv.dueAt.getTime()) / 86_400_000);
      const seller = await this.sellers.findById(inv.seller);
      if (!seller) continue;
      const send = async (key: string, title: { en: string; ar: string }, body: { en: string; ar: string }) => {
        if (inv.remindersSent.includes(key)) return;
        inv.remindersSent.push(key);
        await this.notify.notify(seller.user, 'COMMISSION_REMINDER', title, '/seller/finance', { body });
      };
      const left = egp(inv.amountDue - inv.paid);
      if (daysLate >= -1 && daysLate < 0) await send('before', { en: `Invoice ${inv.number} is due tomorrow`, ar: `فاتورة ${inv.number} مستحقة غدًا` }, { en: `Remaining: ${left}`, ar: `المتبقي: ${left}` });
      if (daysLate >= 0) await send('due', { en: `Invoice ${inv.number} is due today`, ar: `فاتورة ${inv.number} مستحقة اليوم` }, { en: `Remaining: ${left}`, ar: `المتبقي: ${left}` });
      if (daysLate > 0) inv.status = 'OVERDUE';
      if (daysLate >= s.overdueWarningDays) {
        await send(
          'warning',
          { en: `Warning: invoice ${inv.number} is overdue`, ar: `تحذير: فاتورة ${inv.number} متأخرة` },
          { en: `Your store will be suspended after ${s.overdueSuspendDays} days overdue. Remaining: ${left}`, ar: `سيتم إيقاف متجرك بعد ${s.overdueSuspendDays} يومًا من التأخير. المتبقي: ${left}` },
        );
        seller.warnedAt = now;
      }
      if (daysLate >= s.overdueSuspendDays && seller.status === 'APPROVED') {
        seller.status = 'SUSPENDED';
        seller.suspendedForOverdue = true;
        seller.statusReason = `Unpaid commission invoice ${inv.number}`;
        await this.products.updateMany({ seller: seller._id }, { sellerActive: false });
        await send('suspended', { en: 'Your store is suspended for unpaid commission', ar: 'تم إيقاف متجرك بسبب عمولة غير مدفوعة' }, { en: `Pay ${left} to reactivate.`, ar: `ادفع ${left} لإعادة التفعيل.` });
      }
      await seller.save();
      await inv.save();
    }
  }

  /** Allocate a confirmed payment to the chosen invoice first, then oldest open ones. */
  async applyPayment(payment: any) {
    await this.ledger.create({ seller: payment.seller, type: 'PAYMENT', amount: -payment.amount, note: `${payment.method} payment ${payment.referenceNo ?? payment.receiptNo ?? ''}`.trim() });
    let left = payment.amount;
    const open = await this.invoices.find({ seller: payment.seller, status: { $in: ['DUE', 'OVERDUE'] } }).sort({ createdAt: 1 });
    open.sort((a: any, b: any) => (String(a._id) === String(payment.invoice) ? -1 : String(b._id) === String(payment.invoice) ? 1 : 0));
    for (const inv of open) {
      if (left <= 0) break;
      const take = Math.min(left, inv.amountDue - inv.paid);
      inv.paid += take;
      left -= take;
      if (inv.paid >= inv.amountDue) inv.status = 'PAID';
      await inv.save();
    }
    const seller = await this.sellers.findById(payment.seller);
    if (seller?.suspendedForOverdue) {
      const s = await this.settings.all();
      const stillLate = await this.invoices.exists({ seller: seller._id, status: 'OVERDUE', dueAt: { $lt: addDays(new Date(), -s.overdueSuspendDays) } });
      if (!stillLate) {
        seller.status = 'APPROVED';
        seller.suspendedForOverdue = false;
        seller.statusReason = undefined;
        await seller.save();
        await this.products.updateMany({ seller: seller._id }, { sellerActive: true });
      }
    }
  }

  @Cron('0 1 * * *')
  async billingCron() {
    await this.runBilling().catch((e) => this.log.error(e));
  }

  @Cron('0 9 * * *')
  async lateCron() {
    await this.enforceLatePayments().catch((e) => this.log.error(e));
  }
}

const PayDto = z.object({ invoice: zId.optional(), amount: z.number().int().min(100), file: z.string().min(1), referenceNo: z.string().min(4).max(60) });

@Roles('SELLER')
@Controller('seller/finance')
export class SellerFinanceController {
  constructor(private readonly f: FinanceService) {}

  private async seller(u: AuthUser) {
    const s = await this.f.sellers.findOne({ user: u.id }).lean<any>();
    if (!s) throw new NotFoundException();
    return s;
  }

  @Get()
  async statement(@CurrentUser() u: AuthUser) {
    return this.f.statement((await this.seller(u))._id);
  }

  @Post('payments')
  async pay(@CurrentUser() u: AuthUser, @Body(new Zod(PayDto)) b: z.infer<typeof PayDto>) {
    const s = await this.seller(u);
    await this.f.files.assertOwned(b.file, u.id);
    try {
      await this.f.refs.create({ ref: b.referenceNo.trim().toUpperCase(), kind: 'SELLER_PAYMENT', owner: s._id });
    } catch {
      throw new BadRequestException('This reference number was already used');
    }
    const p = await this.f.payments.create({ ...b, seller: s._id, method: 'INSTAPAY' });
    const admins = await this.f.users.find({ role: 'ADMIN' }).select('_id').lean();
    for (const a of admins) await this.f.notify.notify(a._id, 'SELLER_PAYMENT', { en: `Commission payment from ${s.storeName.en}`, ar: `دفعة عمولة من ${s.storeName.ar || s.storeName.en}` }, '/admin/finance');
    return p;
  }

  @Get('statement/:format')
  async statementFile(@CurrentUser() u: AuthUser, @Param('format') format: string, @Res() res: Response) {
    await this.f.sendStatement(res, await this.seller(u), format);
  }

  @Get('invoices/:id')
  async invoice(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.seller(u);
    const inv = await this.f.invoices.findOne({ _id: id, seller: s._id }).lean();
    if (!inv) throw new NotFoundException();
    const entries = await this.f.ledger.find({ invoice: id }).populate('subOrder', 'number deliveredAt itemsTotal').lean();
    return { invoice: inv, entries, seller: s };
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const data = await this.invoice(u, id);
    sendDownload(res, await commissionInvoicePdf(data), 'pdf', `otd-commission-${(data.invoice).number}`);
  }
}

@Roles('ADMIN')
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(private readonly f: FinanceService) {}

  @AdminPerm('finance')
  @Get('overview')
  async overview() {
    const balances = await this.f.ledger.aggregate([{ $group: { _id: '$seller', balance: { $sum: '$amount' } } }]);
    const sellers = await this.f.sellers.find({ _id: { $in: balances.map((b) => b._id) } }).select('storeName slug status').lean<any[]>();
    const overdue = await this.f.invoices.find({ status: 'OVERDUE' }).populate('seller', 'storeName').lean();
    return {
      balances: balances.map((b) => ({ ...b, seller: sellers.find((s) => String(s._id) === String(b._id)) })).sort((a, b) => b.balance - a.balance),
      overdue,
      pendingPayments: await this.f.payments.find({ status: 'SUBMITTED' }).populate('seller', 'storeName').sort({ createdAt: 1 }).lean(),
      lastRun: await this.f.settings.get('lastInvoiceRun'),
    };
  }

  @AdminPerm('finance')
  @Get('sellers/:id')
  statement(@Param('id') id: string) {
    return this.f.statement(id);
  }

  @AdminPerm('finance')
  @Get('sellers/:id/statement/:format')
  async statementFile(@Param('id') id: string, @Param('format') format: string, @Res() res: Response) {
    const s = await this.f.sellers.findById(id).lean<any>();
    if (!s) throw new NotFoundException();
    await this.f.sendStatement(res, s, format);
  }

  @AdminPerm('finance')
  @Get('invoices')
  invoices(@Query('status') status?: string) {
    return this.f.invoices.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(300).populate('seller', 'storeName').lean();
  }

  @AdminPerm('finance')
  @Get('invoices/:id')
  async invoice(@Param('id') id: string) {
    const inv = await this.f.invoices.findById(id).populate('seller').lean();
    if (!inv) throw new NotFoundException();
    const entries = await this.f.ledger.find({ invoice: id }).populate('subOrder', 'number deliveredAt itemsTotal').lean();
    return { invoice: inv, entries, seller: inv.seller };
  }

  @AdminPerm('finance')
  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') id: string, @Res() res: Response) {
    const data = await this.invoice(id);
    sendDownload(res, await commissionInvoicePdf(data), 'pdf', `otd-commission-${(data.invoice).number}`);
  }

  @AdminPerm('finance')
  @Post('payments/:id/:action')
  async review(@Param('id') id: string, @Param('action') action: string, @Body(new Zod(z.object({ reason: z.string().max(300).optional() }))) b: any) {
    const p = await this.f.payments.findById(id);
    if (!p || p.status !== 'SUBMITTED') throw new BadRequestException('Payment not pending');
    const seller = await this.f.sellers.findById(p.seller).lean<any>();
    if (action === 'confirm') {
      p.status = 'CONFIRMED';
      await p.save();
      await this.f.applyPayment(p);
      await this.f.notify.notify(seller.user, 'PAYMENT_CONFIRMED', { en: `Payment of ${egp(p.amount)} confirmed`, ar: `تم تأكيد دفعة ${egp(p.amount)}` }, '/seller/finance', { body: { en: 'Thank you.', ar: 'شكرًا لك.' } });
    } else if (action === 'reject') {
      if (!b.reason) throw new BadRequestException('Reason required');
      p.status = 'REJECTED';
      p.reason = b.reason;
      await p.save();
      await this.f.notify.notify(seller.user, 'PAYMENT_REJECTED', { en: 'Commission payment rejected', ar: 'تم رفض دفعة العمولة' }, '/seller/finance', { body: { en: `Reason: ${b.reason}`, ar: `السبب: ${b.reason}` } });
    } else throw new BadRequestException();
    return p;
  }

  @AdminPerm('finance')
  @Post('cash')
  async cash(
    @CurrentUser() u: AuthUser,
    @Body(new Zod(z.object({ seller: zId, invoice: zId.optional(), amount: z.number().int().min(1), receiptNo: z.string().min(1).max(60) }))) b: any,
  ) {
    const p = await this.f.payments.create({ ...b, method: 'CASH', status: 'CONFIRMED', recordedBy: u.id });
    await this.f.applyPayment(p);
    return p;
  }

  /** Waive (negative) or charge (positive) a manual amount. */
  @AdminPerm('finance')
  @Post('adjust')
  adjust(@Body(new Zod(z.object({ seller: zId, amount: z.number().int(), note: z.string().min(2).max(300) }))) b: any) {
    return this.f.ledger.create({ ...b, type: 'ADJUSTMENT' });
  }

  @AdminPerm('finance')
  @Post('invoices/:id/extend')
  async extend(@Param('id') id: string, @Body(new Zod(z.object({ days: z.number().int().min(1).max(60) }))) b: { days: number }) {
    const inv = await this.f.invoices.findById(id);
    if (!inv) throw new NotFoundException();
    inv.dueAt = addDays(inv.dueAt, b.days);
    if (inv.dueAt > new Date() && inv.status === 'OVERDUE') inv.status = 'DUE';
    inv.remindersSent = [];
    await inv.save();
    return inv;
  }

  @AdminPerm('finance')
  @Post('run-billing')
  run() {
    return this.f.runBilling(true);
  }

  @AdminPerm('finance')
  @Post('enforce')
  enforce() {
    return this.f.enforceLatePayments().then(() => ({ ok: true }));
  }
}

@Module({ providers: [FinanceService], controllers: [SellerFinanceController, AdminFinanceController], exports: [FinanceService] })
export class FinanceModule {}
