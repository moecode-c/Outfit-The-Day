import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/** All business rules the admin can change. Money in piasters. */
export const DEFAULT_SETTINGS = {
  commissionRate: 10, // % (owner to confirm before launch)
  billingCycle: 'WEEKLY' as 'WEEKLY' | 'MONTHLY',
  invoiceDueDays: 5,
  overdueWarningDays: 7,
  overdueSuspendDays: 14,
  returnWindowDays: 14,
  sellerReturnResponseDays: 3,
  instapayProofHours: 24,
  codMaxOrder: 1_000_000, // 10,000 EGP
  codMaxFailures: 2,
  productModeration: 'ALL' as 'ALL' | 'OFF',
  platformInstapay: 'otd@instapay',
  defaultShippingFee: 6000,
  lastInvoiceRun: null as string | null,
  home: {
    featuredCategories: [] as string[],
    tickerEn: ['Free returns within 14 days', 'Cash on delivery across Egypt', 'New season — just landed', 'Pay with InstaPay'],
    tickerAr: ['إرجاع خلال ١٤ يومًا', 'الدفع عند الاستلام في كل مصر', 'الموسم الجديد وصل', 'ادفع بإنستاباي'],
  },
};
export type Settings = typeof DEFAULT_SETTINGS;

@Injectable()
export class SettingsService {
  private cache: { at: number; value: Settings } | null = null;
  constructor(@InjectModel('Setting') private readonly settings: Model<any>) {}

  async all(): Promise<Settings> {
    if (this.cache && Date.now() - this.cache.at < 10_000) return this.cache.value;
    const docs = await this.settings.find().lean();
    const value = { ...DEFAULT_SETTINGS } as any;
    for (const d of docs) value[d.key] = d.value;
    this.cache = { at: Date.now(), value };
    return value;
  }

  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    return (await this.all())[key];
  }

  async set(patch: Partial<Settings>) {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      await this.settings.updateOne({ key }, { $set: { value } }, { upsert: true });
    }
    this.cache = null;
    return this.all();
  }
}
