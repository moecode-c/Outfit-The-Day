import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import { AdminPerm, AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { productDerived, variantPricing } from '../common/pricing';
import { escapeRegex, normalizeSearch, paginate, randomCode, slugify, Zod, zEgPhone, zI18n, zId } from '../common/util';
import { COLOR_FAMILIES } from '../db/schemas';
import { SettingsService } from '../db/settings.service';
import { FilesService } from './files';
import { NotifyService } from './notify';

const PUBLIC_PRODUCT = { status: 'LIVE', sellerActive: true };
const money = z.number().int().min(0).max(100_000_000);

/* ═════════════ DTOs ═════════════ */
const ApplyDto = z.object({
  storeName: zI18n.refine((v) => v.en || v.ar, 'Store name required'),
  ownerName: z.string().min(2).max(80),
  phone: zEgPhone,
  email: z.string().email(),
  businessAddress: z.string().min(5).max(300),
  nationalIdFile: z.string().min(1),
  commercialRegisterFile: z.string().optional(),
  taxNumber: z.string().max(40).optional(),
  instapayHandle: z.string().min(3).max(80),
  description: zI18n.optional(),
});
const StoreDto = z.object({
  storeName: zI18n.optional(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  description: zI18n.optional(),
  returnPolicy: zI18n.optional(),
  phone: zEgPhone.optional(),
  email: z.string().email().optional(),
  instapayHandle: z.string().min(3).max(80).optional(),
  shipping: z
    .object({
      flatFee: money.optional().nullable(),
      freeAbove: money.optional().nullable(),
      perGovernorate: z.array(z.object({ governorate: zId, fee: money, etaDays: z.number().int().min(0).max(30).optional() })).max(30),
    })
    .optional(),
});
const CategoryDto = z.object({
  parent: zId.nullable().optional(),
  departments: z.array(z.enum(['WOMEN', 'MEN', 'KIDS', 'UNISEX'])).min(1),
  name: zI18n,
  slug: z.string().optional(),
  image: z.string().optional(),
  sort: z.number().int().default(0),
  active: z.boolean().default(true),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  returnable: z.boolean().default(true),
});
const ProductDto = z.object({
  category: zId,
  department: z.enum(['WOMEN', 'MEN', 'KIDS', 'UNISEX']),
  title: zI18n.refine((v) => v.en || v.ar, 'Title required'),
  description: zI18n,
  specs: z.array(z.object({ label: zI18n, value: zI18n })).max(30).default([]),
  material: zI18n.optional(),
  care: zI18n.optional(),
  price: money.refine((v) => v > 0, 'Price required'),
  sizeGuide: zId.nullable().optional(),
  colors: z
    .array(
      z.object({
        key: z.string(),
        name: zI18n,
        hex: z.string().regex(/^#[0-9a-f]{6}$/i),
        family: z.enum(COLOR_FAMILIES),
        images: z.array(z.string()).min(1, 'Each color needs at least one photo').max(12),
      }),
    )
    .min(1)
    .max(20),
  variants: z
    .array(
      z.object({
        key: z.string().optional(),
        colorKey: z.string(),
        size: z.string().min(1).max(20),
        sku: z.string().max(60).default(''),
        stock: z.number().int().min(0).max(100000),
        price: money.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
  submit: z.boolean().default(true), // false = save as draft
});
const DiscountDto = z.object({
  type: z.enum(['PERCENT', 'FIXED_PRICE']).nullable(),
  value: z.number().min(0).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
const StockDto = z.object({
  price: money.optional(),
  variants: z.array(z.object({ id: zId, stock: z.number().int().min(0), price: money.nullable().optional() })).default([]),
});
const SizeGuideDto = z.object({
  name: z.string().min(1).max(80),
  unit: z.enum(['cm', 'in']).default('cm'),
  columns: z.array(z.string().max(30)).min(1).max(12),
  rows: z.array(z.array(z.string().max(30))).max(30),
  notes: zI18n.optional(),
});
const LookDto = z.object({
  title: zI18n,
  description: zI18n.optional(),
  cover: z.string().min(1),
  products: z.array(zId).min(2).max(8),
  active: z.boolean().default(true),
});
const StatusDto = z.object({ reason: z.string().max(500).optional() });

/* ═════════════ Service ═════════════ */
@Injectable()
export class CatalogService {
  constructor(
    @InjectModel('Seller') readonly sellers: Model<any>,
    @InjectModel('User') readonly users: Model<any>,
    @InjectModel('Category') readonly categories: Model<any>,
    @InjectModel('Product') readonly products: Model<any>,
    @InjectModel('SizeGuide') readonly sizeGuides: Model<any>,
    @InjectModel('Look') readonly looks: Model<any>,
    @InjectModel('Review') readonly reviews: Model<any>,
    readonly settings: SettingsService,
    readonly files: FilesService,
    readonly notify: NotifyService,
  ) {}

  async sellerOf(userId: string, allowSuspended = true) {
    const s = await this.sellers.findOne({ user: userId });
    if (!s) throw new ForbiddenException('No seller account');
    if (s.status === 'PENDING' || s.status === 'REJECTED') throw new ForbiddenException('Seller account not approved');
    if (!allowSuspended && s.status === 'SUSPENDED') throw new ForbiddenException('Seller account suspended');
    return s;
  }

  async uniqueSlug(model: Model<any>, base: string, excludeId?: any) {
    let slug = slugify(base);
    while (await model.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) slug = `${slugify(base)}-${randomCode(4).toLowerCase()}`;
    return slug;
  }

  async descendantIds(id: any): Promise<Types.ObjectId[]> {
    const all = await this.categories.find().select('_id parent').lean<any[]>();
    const out: Types.ObjectId[] = [new Types.ObjectId(String(id))];
    for (let i = 0; i < out.length; i++) all.filter((c) => String(c.parent) === String(out[i])).forEach((c) => out.push(c._id));
    return out;
  }

  /** Recompute denormalized fields (price, stock, sizes, search text). */
  async refresh(p: any) {
    const [seller, cat] = await Promise.all([
      this.sellers.findById(p.seller).select('storeName status').lean<any>(),
      this.categories.findById(p.category).select('name').lean<any>(),
    ]);
    Object.assign(p, productDerived(p));
    p.sellerActive = seller?.status === 'APPROVED';
    p.searchText = normalizeSearch(
      [p.title?.en, p.title?.ar, p.description?.en, p.description?.ar, seller?.storeName?.en, seller?.storeName?.ar, cat?.name?.en, cat?.name?.ar,
        ...(p.colors ?? []).flatMap((c: any) => [c.name?.en, c.name?.ar, c.family])].filter(Boolean).join(' '),
    );
    return p;
  }

  /* ── listing / search ── */
  async list(q: any, extra: any = {}) {
    const { page, limit, skip } = paginate(q, 48);
    const f: any = { ...PUBLIC_PRODUCT, ...extra };
    if (q.q) {
      const tokens = normalizeSearch(q.q).split(' ').filter(Boolean).slice(0, 6);
      if (tokens.length) f.$and = tokens.map((t: string) => ({ searchText: { $regex: escapeRegex(t) } }));
    }
    if (q.department) f.department = { $in: [String(q.department).toUpperCase(), 'UNISEX'] };
    if (q.category) {
      const cat = await this.categories.findOne({ slug: q.category }).lean<any>();
      if (cat) f.category = { $in: await this.descendantIds(cat._id) };
    }
    if (q.seller) {
      const s = await this.sellers.findOne({ slug: q.seller }).lean<any>();
      f.seller = s?._id ?? null;
    }
    if (q.minPrice || q.maxPrice) {
      f.effectivePrice = {};
      if (q.minPrice) f.effectivePrice.$gte = Number(q.minPrice) * 100;
      if (q.maxPrice) f.effectivePrice.$lte = Number(q.maxPrice) * 100;
    }
    if (q.rating) f.rating = { $gte: Number(q.rating) };
    if (q.onSale === 'true') f.onSale = true;
    if (q.inStock === 'true') f.totalStock = { $gt: 0 };
    if (q.size) f.sizes = { $in: String(q.size).split(',') };
    if (q.color) f.colorFamilies = { $in: String(q.color).split(',') };

    const sorts: Record<string, any> = {
      newest: { publishedAt: -1, _id: -1 },
      price_asc: { effectivePrice: 1, _id: 1 },
      price_desc: { effectivePrice: -1, _id: -1 },
      rating: { rating: -1, ratingCount: -1, _id: -1 },
      best: { soldCount: -1, _id: -1 },
    };
    const [items, total, facets] = await Promise.all([
      this.products
        .find(f)
        .sort(sorts[q.sort] ?? sorts.newest)
        .skip(skip)
        .limit(limit)
        .select('title slug price effectivePrice onSale colors.name colors.hex colors.images colors._id rating ratingCount totalStock seller discount department')
        .populate('seller', 'storeName slug')
        .lean(),
      this.products.countDocuments(f),
      q.facets === 'false'
        ? null
        : this.products.aggregate([
            { $match: { ...PUBLIC_PRODUCT, ...extra, ...(f.department ? { department: f.department } : {}), ...(f.category ? { category: f.category } : {}) } },
            {
              $facet: {
                sizes: [{ $unwind: '$sizes' }, { $group: { _id: '$sizes', n: { $sum: 1 } } }, { $sort: { _id: 1 } }],
                colors: [{ $unwind: '$colorFamilies' }, { $group: { _id: '$colorFamilies', n: { $sum: 1 } } }],
                price: [{ $group: { _id: null, min: { $min: '$effectivePrice' }, max: { $max: '$effectivePrice' } } }],
                sellers: [{ $group: { _id: '$seller', n: { $sum: 1 } } }, { $limit: 50 }],
              },
            },
          ]),
    ]);
    let facetOut: any = null;
    if (facets?.[0]) {
      const sellerDocs = await this.sellers.find({ _id: { $in: facets[0].sellers.map((s: any) => s._id) } }).select('storeName slug').lean();
      facetOut = { sizes: facets[0].sizes, colors: facets[0].colors, price: facets[0].price[0] ?? null, sellers: sellerDocs };
    }
    return { items, total, page, pages: Math.ceil(total / limit), facets: facetOut };
  }

  async detail(slug: string, preview?: AuthUser) {
    const p = await this.products
      .findOne({ slug })
      .populate('seller', 'storeName slug logo rating ratingCount returnPolicy status user')
      .populate('category', 'name slug parent returnable')
      .populate('sizeGuide')
      .lean<any>();
    if (!p) throw new NotFoundException();
    const isOwner = preview && String(p.seller?.user) === preview.id;
    const isAdmin = preview?.role === 'ADMIN';
    if ((p.status !== 'LIVE' || !p.sellerActive) && !isOwner && !isAdmin) throw new NotFoundException();
    const variants = p.variants.map((v: any) => ({ ...v, ...variantPricing(p, v) }));
    const [related, looks, reviews] = await Promise.all([
      this.products
        .find({ ...PUBLIC_PRODUCT, category: p.category?._id, _id: { $ne: p._id } })
        .limit(8)
        .select('title slug price effectivePrice onSale colors.images colors.hex colors.name rating seller')
        .populate('seller', 'storeName slug')
        .lean(),
      this.looks
        .find({ products: p._id, active: true })
        .limit(3)
        .populate({ path: 'products', match: PUBLIC_PRODUCT, select: 'title slug effectivePrice price onSale colors.images colors.hex colors.name seller', populate: { path: 'seller', select: 'storeName slug' } })
        .lean(),
      this.reviews.find({ product: p._id, hidden: false }).sort({ createdAt: -1 }).limit(20).populate('user', 'name').lean(),
    ]);
    delete p.searchText;
    if (p.seller) delete p.seller.user;
    return { ...p, variants, related, looks, reviews };
  }

  /* ── seller product writes ── */
  async upsertProduct(userId: string, dto: z.infer<typeof ProductDto>, id?: string) {
    const seller = await this.sellerOf(userId, false);
    const cat = await this.categories.findOne({ _id: dto.category, active: true }).lean<any>();
    if (!cat) throw new BadRequestException('Invalid category');
    if (dto.sizeGuide && !(await this.sizeGuides.exists({ _id: dto.sizeGuide, seller: seller._id }))) throw new BadRequestException('Invalid size guide');

    const colorIds: Record<string, Types.ObjectId> = {};
    const colors = dto.colors.map((c) => {
      const _id = /^[a-f\d]{24}$/i.test(c.key) ? new Types.ObjectId(c.key) : new Types.ObjectId();
      colorIds[c.key] = _id;
      return { _id, name: c.name, hex: c.hex, family: c.family, images: c.images };
    });
    const seen = new Set<string>();
    const variants = dto.variants.map((v) => {
      const color = colorIds[v.colorKey];
      if (!color) throw new BadRequestException('Variant references unknown color');
      const k = `${String(color)}-${v.size.toUpperCase()}`;
      if (seen.has(k)) throw new BadRequestException(`Duplicate size ${v.size} for a color`);
      seen.add(k);
      return {
        _id: v.key && /^[a-f\d]{24}$/i.test(v.key) ? new Types.ObjectId(v.key) : new Types.ObjectId(),
        color,
        size: v.size,
        sku: v.sku || `${seller.slug.slice(0, 6).toUpperCase()}-${randomCode(6)}`,
        stock: v.stock,
        price: v.price ?? undefined,
      };
    });

    const moderation = await this.settings.get('productModeration');
    const fields = {
      category: dto.category,
      department: dto.department,
      title: dto.title,
      description: dto.description,
      specs: dto.specs,
      material: dto.material,
      care: dto.care,
      price: dto.price,
      sizeGuide: dto.sizeGuide || undefined,
      colors,
      variants,
    };

    let p: any;
    if (id) {
      p = await this.products.findOne({ _id: id, seller: seller._id });
      if (!p) throw new NotFoundException();
      const contentChanged =
        JSON.stringify([p.title, p.description, p.colors.map((c: any) => c.images), String(p.category)]) !==
        JSON.stringify([dto.title, dto.description, dto.colors.map((c) => c.images), dto.category]);
      p.set(fields);
      if (!dto.submit) p.status = 'DRAFT';
      else if (p.status === 'DRAFT' || p.status === 'REJECTED' || (contentChanged && p.status === 'LIVE' && moderation === 'ALL')) p.status = moderation === 'ALL' ? 'PENDING' : 'LIVE';
    } else {
      p = new this.products({
        ...fields,
        seller: seller._id,
        slug: await this.uniqueSlug(this.products, dto.title.en || dto.title.ar),
        status: !dto.submit ? 'DRAFT' : moderation === 'ALL' ? 'PENDING' : 'LIVE',
      });
    }
    if (p.status === 'LIVE' && !p.publishedAt) p.publishedAt = new Date();
    await this.refresh(p);
    await p.save();
    return p;
  }
}

/* ═════════════ Public controllers ═════════════ */
@Public()
@Controller()
export class PublicCatalogController {
  constructor(private readonly c: CatalogService) {}

  @Get('categories')
  async categories() {
    return this.c.categories.find({ active: true }).sort({ sort: 1 }).select('-commissionRate').lean();
  }

  @Get('products')
  list(@Query() q: any) {
    return this.c.list(q);
  }

  @Get('products/by-ids')
  async byIds(@Query('ids') ids = '') {
    const list = ids.split(',').filter((x) => /^[a-f\d]{24}$/i.test(x)).slice(0, 100);
    const ps = await this.c.products.find({ _id: { $in: list } }).populate('seller', 'storeName slug').lean<any[]>();
    return ps.map((p) => ({ ...p, variants: p.variants.map((v: any) => ({ ...v, ...variantPricing(p, v) })), searchText: undefined }));
  }

  @Get('products/:slug')
  detail(@Param('slug') slug: string, @CurrentUser() u?: AuthUser) {
    return this.c.detail(slug, u);
  }

  @Get('brands')
  async brands() {
    return this.c.sellers.find({ status: 'APPROVED' }).select('storeName slug logo banner description rating ratingCount').sort({ 'storeName.en': 1 }).lean();
  }

  @Get('brands/:slug')
  async brand(@Param('slug') slug: string, @Query() q: any) {
    const s = await this.c.sellers.findOne({ slug, status: 'APPROVED' }).select('storeName slug logo banner description returnPolicy rating ratingCount createdAt').lean<any>();
    if (!s) throw new NotFoundException();
    const [products, looks] = await Promise.all([
      this.c.list(q, { seller: s._id }),
      this.c.looks.find({ seller: s._id, active: true }).select('title cover').limit(6).lean(),
    ]);
    return { seller: s, products, looks };
  }

  @Get('looks')
  async looks(@Query() q: any) {
    const { limit, skip } = paginate(q, 24);
    const filter: any = { active: true };
    if (q.featured === 'true') filter.featured = true;
    return this.c.looks.find(filter).sort({ featured: -1, createdAt: -1 }).skip(skip).limit(limit).populate('seller', 'storeName slug').lean();
  }

  @Get('looks/:id')
  async look(@Param('id') id: string) {
    const l = await this.c.looks
      .findOne({ _id: id, active: true })
      .populate('seller', 'storeName slug')
      .populate({ path: 'products', match: PUBLIC_PRODUCT, select: 'title slug effectivePrice price onSale colors variants discount seller', populate: { path: 'seller', select: 'storeName slug' } })
      .lean<any>();
    if (!l) throw new NotFoundException();
    l.products = l.products.filter(Boolean).map((p: any) => ({ ...p, variants: p.variants.map((v: any) => ({ ...v, ...variantPricing(p, v) })) }));
    return l;
  }
}

/* ═════════════ Seller application & store ═════════════ */
@Controller('sellers')
export class SellerAccountController {
  constructor(private readonly c: CatalogService) {}

  @Post('apply')
  async apply(@CurrentUser() u: AuthUser, @Body(new Zod(ApplyDto)) b: z.infer<typeof ApplyDto>) {
    const existing = await this.c.sellers.findOne({ user: u.id });
    if (existing && existing.status !== 'REJECTED') throw new BadRequestException('Application already submitted');
    await this.c.files.assertOwned(b.nationalIdFile, u.id);
    if (b.commercialRegisterFile) await this.c.files.assertOwned(b.commercialRegisterFile, u.id);
    const data = { ...b, status: 'PENDING', statusReason: undefined };
    if (existing) {
      existing.set(data);
      await existing.save();
      return existing;
    }
    return this.c.sellers.create({ ...data, user: u.id, slug: await this.c.uniqueSlug(this.c.sellers, b.storeName.en || b.storeName.ar) });
  }

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    return this.c.sellers.findOne({ user: u.id }).lean();
  }

  @Roles('SELLER')
  @Patch('me')
  async update(@CurrentUser() u: AuthUser, @Body(new Zod(StoreDto)) b: z.infer<typeof StoreDto>) {
    const s = await this.c.sellerOf(u.id);
    s.set(b);
    await s.save();
    return s;
  }
}

/* ═════════════ Seller catalog management ═════════════ */
@Roles('SELLER')
@Controller('seller')
export class SellerCatalogController {
  constructor(private readonly c: CatalogService) {}

  @Get('products')
  async products(@CurrentUser() u: AuthUser, @Query() q: any) {
    const s = await this.c.sellerOf(u.id);
    const { page, limit, skip } = paginate(q, 100);
    const f: any = { seller: s._id };
    if (q.status) f.status = q.status;
    if (q.q) f.searchText = { $regex: escapeRegex(normalizeSearch(q.q)) };
    const [items, total] = await Promise.all([
      this.c.products.find(f).sort({ updatedAt: -1 }).skip(skip).limit(limit).select('-searchText').lean(),
      this.c.products.countDocuments(f),
    ]);
    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  @Get('products/:id')
  async product(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.c.sellerOf(u.id);
    const p = await this.c.products.findOne({ _id: id, seller: s._id }).select('-searchText').lean();
    if (!p) throw new NotFoundException();
    return p;
  }

  @Post('products')
  create(@CurrentUser() u: AuthUser, @Body(new Zod(ProductDto)) b: z.infer<typeof ProductDto>) {
    return this.c.upsertProduct(u.id, b);
  }

  @Put('products/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(ProductDto)) b: z.infer<typeof ProductDto>) {
    return this.c.upsertProduct(u.id, b, id);
  }

  /** Price and stock edits go live immediately (no re-moderation). */
  @Patch('products/:id/stock')
  async stock(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(StockDto)) b: z.infer<typeof StockDto>) {
    const s = await this.c.sellerOf(u.id);
    const p = await this.c.products.findOne({ _id: id, seller: s._id });
    if (!p) throw new NotFoundException();
    if (b.price) p.price = b.price;
    for (const v of b.variants) {
      const pv = p.variants.id(v.id);
      if (pv) {
        pv.stock = v.stock;
        if (v.price !== undefined) pv.price = v.price ?? undefined;
      }
    }
    await this.c.refresh(p);
    await p.save();
    return p;
  }

  @Put('products/:id/discount')
  async discount(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(DiscountDto)) b: z.infer<typeof DiscountDto>) {
    const s = await this.c.sellerOf(u.id);
    const p = await this.c.products.findOne({ _id: id, seller: s._id });
    if (!p) throw new NotFoundException();
    if (b.type === 'PERCENT' && (!b.value || b.value <= 0 || b.value >= 100)) throw new BadRequestException('Percent must be between 1 and 99');
    if (b.type === 'FIXED_PRICE' && (!b.value || b.value >= p.price)) throw new BadRequestException('Sale price must be lower than the price');
    if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt) throw new BadRequestException('End date must be after start date');
    p.discount = b.type ? b : undefined;
    await this.c.refresh(p);
    await p.save();
    return p;
  }

  @Patch('products/:id/visibility')
  async visibility(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(z.object({ hidden: z.boolean() }))) b: { hidden: boolean }) {
    const s = await this.c.sellerOf(u.id);
    const p = await this.c.products.findOne({ _id: id, seller: s._id });
    if (!p) throw new NotFoundException();
    if (b.hidden && p.status === 'LIVE') p.status = 'HIDDEN';
    else if (!b.hidden && p.status === 'HIDDEN' && p.statusReason !== 'ADMIN') p.status = 'LIVE';
    else throw new BadRequestException('Cannot change visibility in the current status');
    await p.save();
    return p;
  }

  @Delete('products/:id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.c.sellerOf(u.id);
    // Soft-delete keeps order history intact.
    await this.c.products.updateOne({ _id: id, seller: s._id }, { status: 'HIDDEN', statusReason: 'DELETED', slug: `deleted-${id}` });
    return { ok: true };
  }

  /* size guides */
  @Get('size-guides')
  async guides(@CurrentUser() u: AuthUser) {
    const s = await this.c.sellerOf(u.id);
    return this.c.sizeGuides.find({ seller: s._id }).lean();
  }

  @Post('size-guides')
  async createGuide(@CurrentUser() u: AuthUser, @Body(new Zod(SizeGuideDto)) b: z.infer<typeof SizeGuideDto>) {
    const s = await this.c.sellerOf(u.id);
    return this.c.sizeGuides.create({ ...b, seller: s._id });
  }

  @Put('size-guides/:id')
  async updateGuide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(SizeGuideDto)) b: z.infer<typeof SizeGuideDto>) {
    const s = await this.c.sellerOf(u.id);
    return this.c.sizeGuides.findOneAndUpdate({ _id: id, seller: s._id }, b, { new: true });
  }

  @Delete('size-guides/:id')
  async deleteGuide(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.c.sellerOf(u.id);
    await this.c.sizeGuides.deleteOne({ _id: id, seller: s._id });
    await this.c.products.updateMany({ sizeGuide: id }, { $unset: { sizeGuide: 1 } });
    return { ok: true };
  }

  /* looks */
  @Get('looks')
  async looks(@CurrentUser() u: AuthUser) {
    const s = await this.c.sellerOf(u.id);
    return this.c.looks.find({ seller: s._id }).populate('products', 'title colors.images').sort({ createdAt: -1 }).lean();
  }

  @Post('looks')
  async createLook(@CurrentUser() u: AuthUser, @Body(new Zod(LookDto)) b: z.infer<typeof LookDto>) {
    const s = await this.c.sellerOf(u.id, false);
    const n = await this.c.products.countDocuments({ _id: { $in: b.products }, seller: s._id });
    if (n !== b.products.length) throw new BadRequestException('Looks can only include your own products');
    return this.c.looks.create({ ...b, seller: s._id });
  }

  @Put('looks/:id')
  async updateLook(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(LookDto)) b: z.infer<typeof LookDto>) {
    const s = await this.c.sellerOf(u.id);
    const n = await this.c.products.countDocuments({ _id: { $in: b.products }, seller: s._id });
    if (n !== b.products.length) throw new BadRequestException('Looks can only include your own products');
    return this.c.looks.findOneAndUpdate({ _id: id, seller: s._id }, b, { new: true });
  }

  @Delete('looks/:id')
  async deleteLook(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.c.sellerOf(u.id);
    await this.c.looks.deleteOne({ _id: id, seller: s._id });
    return { ok: true };
  }
}

/* ═════════════ Admin: sellers, products, categories, looks ═════════════ */
@Roles('ADMIN')
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly c: CatalogService) {}

  @AdminPerm('sellers')
  @Get('sellers')
  async sellers(@Query() q: any) {
    const f: any = {};
    if (q.status) f.status = q.status;
    if (q.q) f.$or = [{ 'storeName.en': { $regex: escapeRegex(q.q), $options: 'i' } }, { 'storeName.ar': { $regex: escapeRegex(q.q) } }, { email: { $regex: escapeRegex(q.q), $options: 'i' } }];
    return this.c.sellers.find(f).sort({ createdAt: -1 }).populate('user', 'name email phone').lean();
  }

  @AdminPerm('sellers')
  @Get('sellers/:id')
  async seller(@Param('id') id: string) {
    const s = await this.c.sellers.findById(id).populate('user', 'name email phone').lean<any>();
    if (!s) throw new NotFoundException();
    const productCount = await this.c.products.countDocuments({ seller: id });
    return { ...s, productCount };
  }

  @AdminPerm('sellers')
  @Post('sellers/:id/:action')
  async sellerAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @Body(new Zod(z.object({ reason: z.string().max(500).optional(), commissionRate: z.number().min(0).max(100).nullable().optional() }))) b: any,
  ) {
    const s = await this.c.sellers.findById(id);
    if (!s) throw new NotFoundException();
    const map: Record<string, string> = { approve: 'APPROVED', reject: 'REJECTED', suspend: 'SUSPENDED', reactivate: 'APPROVED' };
    if (action === 'commission') {
      s.commissionRate = b.commissionRate ?? undefined;
      await s.save();
      return s;
    }
    const status = map[action];
    if (!status) throw new BadRequestException('Unknown action');
    if ((action === 'reject' || action === 'suspend') && !b.reason) throw new BadRequestException('A reason is required');
    s.status = status;
    s.statusReason = b.reason;
    if (action === 'reactivate') s.suspendedForOverdue = false;
    await s.save();
    if (status === 'APPROVED') await this.c.users.updateOne({ _id: s.user, role: { $ne: 'ADMIN' } }, { role: 'SELLER' });
    await this.c.products.updateMany({ seller: s._id }, { sellerActive: status === 'APPROVED' });

    const titles: Record<string, { en: string; ar: string }> = {
      APPROVED: { en: 'Your store is approved', ar: 'تمت الموافقة على متجرك' },
      REJECTED: { en: 'Your seller application was not approved', ar: 'لم تتم الموافقة على طلبك كبائع' },
      SUSPENDED: { en: 'Your store has been suspended', ar: 'تم إيقاف متجرك' },
    };
    const reason = b.reason ? `<br><br>${b.reason}` : '';
    await this.c.notify.notify(s.user, 'SELLER_STATUS', titles[status], status === 'APPROVED' ? '/seller' : '/sell', {
      body: {
        en: status === 'APPROVED' ? 'You can now add products from your seller dashboard.' : `Reason:${reason}`,
        ar: status === 'APPROVED' ? 'يمكنك الآن إضافة منتجاتك من لوحة البائع.' : `السبب:${reason}`,
      },
    });
    return s;
  }

  @AdminPerm('products')
  @Get('products')
  async products(@Query() q: any) {
    const { page, limit, skip } = paginate(q, 100);
    const f: any = {};
    if (q.status) f.status = q.status;
    if (q.seller) f.seller = q.seller;
    if (q.q) f.searchText = { $regex: escapeRegex(normalizeSearch(q.q)) };
    const [items, total] = await Promise.all([
      this.c.products.find(f).sort({ updatedAt: -1 }).skip(skip).limit(limit).select('-searchText').populate('seller', 'storeName slug').populate('category', 'name').lean(),
      this.c.products.countDocuments(f),
    ]);
    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  @AdminPerm('products')
  @Post('products/:id/:action')
  async productAction(@Param('id') id: string, @Param('action') action: string, @Body(new Zod(StatusDto)) b: z.infer<typeof StatusDto>) {
    const p = await this.c.products.findById(id);
    if (!p) throw new NotFoundException();
    const seller = await this.c.sellers.findById(p.seller).lean<any>();
    if (action === 'approve') {
      p.status = 'LIVE';
      p.statusReason = undefined;
      p.publishedAt = p.publishedAt ?? new Date();
      await this.c.sellers.updateOne({ _id: p.seller }, { $inc: { approvedProductsCount: 1 } });
    } else if (action === 'reject') {
      if (!b.reason) throw new BadRequestException('A reason is required');
      p.status = 'REJECTED';
      p.statusReason = b.reason;
    } else if (action === 'hide') {
      p.status = 'HIDDEN';
      p.statusReason = 'ADMIN';
    } else if (action === 'unhide') {
      p.status = 'LIVE';
      p.statusReason = undefined;
    } else throw new BadRequestException('Unknown action');
    await p.save();
    if (action === 'approve' || action === 'reject') {
      await this.c.notify.notify(
        seller.user,
        'PRODUCT_REVIEW',
        action === 'approve'
          ? { en: `“${p.title.en}” is live`, ar: `"${p.title.ar || p.title.en}" منشور الآن` }
          : { en: `“${p.title.en}” needs changes`, ar: `"${p.title.ar || p.title.en}" يحتاج تعديلات` },
        `/seller/products/${p._id}`,
        action === 'reject' ? { body: { en: `Reason: ${b.reason}`, ar: `السبب: ${b.reason}` } } : undefined,
      );
    }
    return p;
  }

  @AdminPerm('catalog')
  @Get('categories')
  allCategories() {
    return this.c.categories.find().sort({ sort: 1 }).lean();
  }

  @AdminPerm('catalog')
  @Post('categories')
  async createCategory(@Body(new Zod(CategoryDto)) b: z.infer<typeof CategoryDto>) {
    return this.c.categories.create({ ...b, slug: b.slug ? slugify(b.slug) : await this.c.uniqueSlug(this.c.categories, b.name.en || b.name.ar) });
  }

  @AdminPerm('catalog')
  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body(new Zod(CategoryDto)) b: z.infer<typeof CategoryDto>) {
    if (b.parent === id) throw new BadRequestException('A category cannot be its own parent');
    return this.c.categories.findByIdAndUpdate(id, { ...b, slug: b.slug ? slugify(b.slug) : undefined }, { new: true, omitUndefined: true });
  }

  @AdminPerm('catalog')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    if (await this.c.products.exists({ category: id })) throw new BadRequestException('Category has products — deactivate it instead');
    if (await this.c.categories.exists({ parent: id })) throw new BadRequestException('Category has sub-categories');
    await this.c.categories.deleteOne({ _id: id });
    return { ok: true };
  }

  @AdminPerm('content')
  @Get('looks')
  allLooks() {
    return this.c.looks.find().sort({ createdAt: -1 }).populate('seller', 'storeName').lean();
  }

  @AdminPerm('content')
  @Patch('looks/:id')
  feature(@Param('id') id: string, @Body(new Zod(z.object({ featured: z.boolean().optional(), active: z.boolean().optional() }))) b: any) {
    return this.c.looks.findByIdAndUpdate(id, b, { new: true });
  }
}

@Module({
  providers: [CatalogService],
  controllers: [PublicCatalogController, SellerAccountController, SellerCatalogController, AdminCatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
