import { Schema, Types } from 'mongoose';

const { ObjectId } = Schema.Types;
const I18n = { en: { type: String, default: '' }, ar: { type: String, default: '' } };
const opts = { timestamps: true };

/* ───────── Users ───────── */
const AddressSchema = new Schema({
  label: String,
  fullName: String,
  phone: String,
  governorate: { type: ObjectId, ref: 'Governorate' },
  city: String,
  area: String,
  street: String,
  building: String,
  notes: String,
  isDefault: { type: Boolean, default: false },
});

export const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true },
    passwordHash: String,
    role: { type: String, enum: ['CUSTOMER', 'SELLER', 'ADMIN'], default: 'CUSTOMER' },
    adminPerms: { type: [String], default: [] }, // e.g. ['*'] or ['orders','sellers']
    locale: { type: String, default: 'en' },
    emailVerifiedAt: Date,
    verifyToken: String,
    verifySentAt: Date,
    resetToken: String,
    resetExpires: Date,
    refreshHash: String,
    blockedAt: Date,
    codFailures: { type: Number, default: 0 },
    addresses: [AddressSchema],
    wishlist: [{ type: ObjectId, ref: 'Product' }],
    cart: [{ product: { type: ObjectId, ref: 'Product' }, variant: ObjectId, qty: Number }],
    ordersCount: { type: Number, default: 0 },
  },
  opts,
);

/* ───────── Geo / shipping zones ───────── */
export const GovernorateSchema = new Schema({
  name: I18n,
  cities: [{ type: String }],
  shippingFee: { type: Number, default: 6000 }, // piasters
  etaDays: { type: Number, default: 3 },
  active: { type: Boolean, default: true },
  sort: { type: Number, default: 0 },
});

export const SettingSchema = new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed });

/* ───────── Files (private access control) ───────── */
export const FileSchema = new Schema(
  {
    key: { type: String, unique: true },
    owner: { type: ObjectId, ref: 'User' },
    visibility: { type: String, enum: ['public', 'private'] },
    visibleTo: [{ type: ObjectId, ref: 'User' }],
    mime: String,
    size: Number,
  },
  opts,
);

/* ───────── Sellers (seller = brand) ───────── */
export const SellerSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    storeName: I18n,
    slug: { type: String, unique: true },
    ownerName: String,
    phone: String,
    email: String,
    businessAddress: String,
    nationalIdFile: String,
    commercialRegisterFile: String,
    taxNumber: String,
    instapayHandle: String,
    logo: String,
    banner: String,
    description: I18n,
    returnPolicy: I18n,
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'], default: 'PENDING' },
    statusReason: String,
    suspendedForOverdue: { type: Boolean, default: false },
    commissionRate: Number, // % override
    approvedProductsCount: { type: Number, default: 0 },
    shipping: {
      flatFee: Number, // piasters, falls back to governorate fee
      freeAbove: Number,
      perGovernorate: [{ governorate: { type: ObjectId, ref: 'Governorate' }, fee: Number, etaDays: Number }],
    },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    warnedAt: Date,
  },
  opts,
);

/* ───────── Catalog ───────── */
export const CategorySchema = new Schema(
  {
    parent: { type: ObjectId, ref: 'Category', default: null },
    departments: [{ type: String, enum: ['WOMEN', 'MEN', 'KIDS', 'UNISEX'] }],
    name: I18n,
    slug: { type: String, unique: true },
    image: String,
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    commissionRate: Number,
    returnable: { type: Boolean, default: true },
  },
  opts,
);

export const SizeGuideSchema = new Schema(
  {
    seller: { type: ObjectId, ref: 'Seller', required: true },
    name: String,
    unit: { type: String, default: 'cm' },
    columns: [String],
    rows: [[String]],
    notes: I18n,
  },
  opts,
);

export const COLOR_FAMILIES = [
  'black', 'white', 'grey', 'beige', 'brown', 'red', 'pink', 'orange',
  'yellow', 'green', 'blue', 'navy', 'purple', 'gold', 'silver', 'multi',
] as const;

const ColorSchema = new Schema({
  name: I18n,
  hex: String,
  family: { type: String, enum: COLOR_FAMILIES },
  images: [String],
});

const VariantSchema = new Schema({
  color: ObjectId, // ColorSchema _id
  size: String,
  sku: String,
  stock: { type: Number, default: 0, min: 0 },
  price: Number, // optional override (piasters)
});

export const ProductSchema = new Schema(
  {
    seller: { type: ObjectId, ref: 'Seller', required: true, index: true },
    category: { type: ObjectId, ref: 'Category', required: true, index: true },
    department: { type: String, enum: ['WOMEN', 'MEN', 'KIDS', 'UNISEX'], index: true },
    title: I18n,
    slug: { type: String, unique: true },
    description: I18n,
    specs: [{ label: I18n, value: I18n }],
    material: I18n,
    care: I18n,
    price: { type: Number, required: true }, // base price, piasters
    colors: [ColorSchema],
    variants: [VariantSchema],
    discount: {
      type: { type: String, enum: ['PERCENT', 'FIXED_PRICE'] },
      value: Number,
      startsAt: Date,
      endsAt: Date,
    },
    sizeGuide: { type: ObjectId, ref: 'SizeGuide' },
    status: { type: String, enum: ['DRAFT', 'PENDING', 'LIVE', 'REJECTED', 'HIDDEN'], default: 'PENDING', index: true },
    statusReason: String,
    // denormalized for filtering / sorting
    effectivePrice: { type: Number, index: true },
    onSale: { type: Boolean, default: false },
    totalStock: { type: Number, default: 0 },
    sizes: [String],
    colorFamilies: [String],
    searchText: String,
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    sellerActive: { type: Boolean, default: true },
    publishedAt: Date,
  },
  opts,
);
ProductSchema.index({ status: 1, sellerActive: 1, createdAt: -1 });

export const LookSchema = new Schema(
  {
    seller: { type: ObjectId, ref: 'Seller', required: true },
    title: I18n,
    description: I18n,
    cover: String,
    products: [{ type: ObjectId, ref: 'Product' }],
    active: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
  },
  opts,
);

/* ───────── Coupons ───────── */
export const CouponSchema = new Schema(
  {
    code: { type: String, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['PERCENT', 'FIXED'] },
    value: Number, // percent or piasters
    maxDiscount: Number,
    startsAt: Date,
    endsAt: Date,
    minOrder: Number,
    usageLimit: Number,
    perCustomerLimit: Number,
    newCustomersOnly: { type: Boolean, default: false },
    excludesDiscounted: { type: Boolean, default: false },
    scope: { type: String, enum: ['GLOBAL', 'SELLERS'], default: 'GLOBAL' },
    sellers: [{ type: ObjectId, ref: 'Seller' }],
    active: { type: Boolean, default: true },
    usedCount: { type: Number, default: 0 },
  },
  opts,
);

export const CouponRedemptionSchema = new Schema(
  { coupon: { type: ObjectId, ref: 'Coupon' }, user: { type: ObjectId, ref: 'User' }, order: { type: ObjectId, ref: 'Order' }, amount: Number },
  opts,
);

/* ───────── Orders ───────── */
const EventSchema = new Schema({ status: String, by: { type: ObjectId, ref: 'User' }, note: String, at: { type: Date, default: Date.now } });

export const OrderSchema = new Schema(
  {
    number: { type: String, unique: true },
    customer: { type: ObjectId, ref: 'User', index: true },
    address: Schema.Types.Mixed,
    coupon: { id: ObjectId, code: String },
    totals: { items: Number, coupon: Number, shipping: Number, total: Number },
    subOrders: [{ type: ObjectId, ref: 'SubOrder' }],
    locale: String,
  },
  opts,
);

const OrderItemSchema = new Schema({
  product: { type: ObjectId, ref: 'Product' },
  variant: ObjectId,
  title: I18n,
  colorName: I18n,
  size: String,
  sku: String,
  image: String,
  originalPrice: Number,
  unitPrice: Number, // after seller discount
  qty: Number,
  lineTotal: Number,
  couponShare: { type: Number, default: 0 },
  commissionRate: Number,
  category: ObjectId,
  returnable: Boolean,
  returnedQty: { type: Number, default: 0 },
  reviewed: { type: Boolean, default: false },
});

const ProofSchema = new Schema({
  file: String,
  referenceNo: String,
  status: { type: String, enum: ['SUBMITTED', 'CONFIRMED', 'REJECTED'], default: 'SUBMITTED' },
  reason: String,
  at: { type: Date, default: Date.now },
});

export const SubOrderSchema = new Schema(
  {
    order: { type: ObjectId, ref: 'Order', index: true },
    number: { type: String, unique: true },
    customer: { type: ObjectId, ref: 'User', index: true },
    seller: { type: ObjectId, ref: 'Seller', index: true },
    items: [OrderItemSchema],
    itemsTotal: Number,
    couponShare: { type: Number, default: 0 },
    shippingFee: Number,
    total: Number,
    paymentMethod: { type: String, enum: ['COD', 'INSTAPAY'] },
    paymentStatus: {
      type: String,
      enum: ['COD_PENDING', 'COLLECTED', 'AWAITING_PROOF', 'PROOF_SUBMITTED', 'CONFIRMED', 'REJECTED'],
    },
    instapayHandle: String,
    proofs: [ProofSchema],
    proofDeadline: Date,
    status: {
      type: String,
      enum: ['AWAITING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED'],
      index: true,
    },
    events: [EventSchema],
    courier: String,
    trackingNo: String,
    shippingNote: String,
    cancelReason: String,
    commissionAmount: { type: Number, default: 0 },
    deliveredAt: Date,
    address: Schema.Types.Mixed,
  },
  opts,
);

export const PaymentRefSchema = new Schema({ ref: { type: String, unique: true }, kind: String, owner: ObjectId }, opts);

/* ───────── Returns & reviews ───────── */
export const ReturnSchema = new Schema(
  {
    subOrder: { type: ObjectId, ref: 'SubOrder', index: true },
    number: String,
    customer: { type: ObjectId, ref: 'User', index: true },
    seller: { type: ObjectId, ref: 'Seller', index: true },
    items: [{ item: ObjectId, qty: Number }],
    reason: { type: String, enum: ['FAULTY', 'WRONG_ITEM', 'SIZE', 'CHANGED_MIND', 'OTHER'] },
    details: String,
    photos: [String],
    status: { type: String, enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED'], default: 'REQUESTED' },
    rejectReason: String,
    returnShippingPaidBy: { type: String, enum: ['SELLER', 'CUSTOMER'] },
    sellerDeadline: Date,
    refundAmount: Number,
    refundProof: String,
    restock: { type: Boolean, default: true },
    flagged: { type: Boolean, default: false },
    disputed: { type: Boolean, default: false },
    adminNote: String,
    events: [EventSchema],
  },
  opts,
);

export const ReviewSchema = new Schema(
  {
    product: { type: ObjectId, ref: 'Product', index: true },
    seller: { type: ObjectId, ref: 'Seller' },
    user: { type: ObjectId, ref: 'User' },
    subOrder: { type: ObjectId, ref: 'SubOrder' },
    rating: { type: Number, min: 1, max: 5 },
    text: String,
    hidden: { type: Boolean, default: false },
  },
  opts,
);
ReviewSchema.index({ product: 1, subOrder: 1 }, { unique: true });

/* ───────── Commission ───────── */
export const LedgerSchema = new Schema(
  {
    seller: { type: ObjectId, ref: 'Seller', index: true },
    subOrder: { type: ObjectId, ref: 'SubOrder' },
    type: { type: String, enum: ['COMMISSION', 'COUPON_CREDIT', 'RETURN_REVERSAL', 'PAYMENT', 'ADJUSTMENT'] },
    amount: Number, // + seller owes platform, − platform owes seller / paid
    note: String,
    invoice: { type: ObjectId, ref: 'Invoice', default: null },
  },
  opts,
);

export const InvoiceSchema = new Schema(
  {
    seller: { type: ObjectId, ref: 'Seller', index: true },
    number: { type: String, unique: true },
    periodStart: Date,
    periodEnd: Date,
    openingBalance: Number,
    periodTotal: Number,
    amountDue: Number,
    paid: { type: Number, default: 0 },
    dueAt: Date,
    status: { type: String, enum: ['DUE', 'PAID', 'OVERDUE', 'CREDIT'], default: 'DUE' },
    remindersSent: [String],
  },
  opts,
);

export const SellerPaymentSchema = new Schema(
  {
    seller: { type: ObjectId, ref: 'Seller', index: true },
    invoice: { type: ObjectId, ref: 'Invoice' },
    method: { type: String, enum: ['INSTAPAY', 'CASH'] },
    amount: Number,
    file: String,
    referenceNo: String,
    receiptNo: String,
    status: { type: String, enum: ['SUBMITTED', 'CONFIRMED', 'REJECTED'], default: 'SUBMITTED' },
    reason: String,
    recordedBy: { type: ObjectId, ref: 'User' },
  },
  opts,
);

/* ───────── Notifications, content ───────── */
export const NotificationSchema = new Schema(
  { user: { type: ObjectId, ref: 'User', index: true }, type: String, title: I18n, link: String, readAt: Date },
  opts,
);

export const MailSchema = new Schema({ to: String, subject: String, html: String, sent: Boolean, error: String }, opts);

export const PageSchema = new Schema({ slug: { type: String, unique: true }, title: I18n, body: I18n }, opts);

export const BannerSchema = new Schema(
  {
    placement: { type: String, enum: ['HERO', 'EDIT'], default: 'HERO' },
    kicker: I18n,
    title: I18n,
    subtitle: I18n,
    image: String,
    link: String,
    cta: I18n,
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  opts,
);

export const MODELS = [
  { name: 'User', schema: UserSchema },
  { name: 'Governorate', schema: GovernorateSchema },
  { name: 'Setting', schema: SettingSchema },
  { name: 'File', schema: FileSchema },
  { name: 'Seller', schema: SellerSchema },
  { name: 'Category', schema: CategorySchema },
  { name: 'SizeGuide', schema: SizeGuideSchema },
  { name: 'Product', schema: ProductSchema },
  { name: 'Look', schema: LookSchema },
  { name: 'Coupon', schema: CouponSchema },
  { name: 'CouponRedemption', schema: CouponRedemptionSchema },
  { name: 'Order', schema: OrderSchema },
  { name: 'SubOrder', schema: SubOrderSchema },
  { name: 'PaymentRef', schema: PaymentRefSchema },
  { name: 'Return', schema: ReturnSchema },
  { name: 'Review', schema: ReviewSchema },
  { name: 'Ledger', schema: LedgerSchema },
  { name: 'Invoice', schema: InvoiceSchema },
  { name: 'SellerPayment', schema: SellerPaymentSchema },
  { name: 'Notification', schema: NotificationSchema },
  { name: 'Mail', schema: MailSchema },
  { name: 'Page', schema: PageSchema },
  { name: 'Banner', schema: BannerSchema },
];

export const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
