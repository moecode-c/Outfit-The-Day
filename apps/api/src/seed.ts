/**
 * Seeds a local OTD database with reference data + demo content.
 *   pnpm seed            (from repo root)  — safe to re-run: wipes and recreates demo data.
 *
 * Demo accounts (local development only — change before any deployment):
 *   admin@otd.test     / Admin123!      (super admin)
 *   atelier@otd.test   / Seller123!     (seller: Atelier Nour)
 *   kemet@otd.test     / Seller123!     (seller: Kemet Studio)
 *   mini@otd.test      / Seller123!     (seller: Mini Nile — kids)
 *   customer@otd.test  / Customer123!   (customer)
 *
 * Product photos are grayscale placeholders from picsum.photos — replace with real photography.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import mongoose, { Types } from 'mongoose';
import { productDerived } from './common/pricing';
import { normalizeSearch } from './common/util';
import { MODELS } from './db/schemas';

const M: Record<string, mongoose.Model<any>> = {};
for (const { name, schema } of MODELS) M[name] = mongoose.model(name, schema);

const img = (seed: string, w = 900, h = 1200) => `https://picsum.photos/seed/${seed}/${w}/${h}?grayscale`;
const us = (id: string, w = 900, h = 1200) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&crop=faces,center&auto=format&q=80`;

const GOVS: [string, string, number, number][] = [
  ['Cairo', 'القاهرة', 5000, 2], ['Giza', 'الجيزة', 5000, 2], ['Alexandria', 'الإسكندرية', 6000, 3], ['Qalyubia', 'القليوبية', 5500, 2],
  ['Sharqia', 'الشرقية', 6500, 3], ['Dakahlia', 'الدقهلية', 6500, 3], ['Gharbia', 'الغربية', 6500, 3], ['Monufia', 'المنوفية', 6500, 3],
  ['Beheira', 'البحيرة', 6500, 3], ['Kafr El Sheikh', 'كفر الشيخ', 7000, 4], ['Damietta', 'دمياط', 7000, 4], ['Port Said', 'بورسعيد', 7000, 3],
  ['Ismailia', 'الإسماعيلية', 7000, 3], ['Suez', 'السويس', 7000, 3], ['Faiyum', 'الفيوم', 7000, 4], ['Beni Suef', 'بني سويف', 7500, 4],
  ['Minya', 'المنيا', 8000, 4], ['Asyut', 'أسيوط', 8500, 5], ['Sohag', 'سوهاج', 8500, 5], ['Qena', 'قنا', 9000, 5],
  ['Luxor', 'الأقصر', 9000, 5], ['Aswan', 'أسوان', 9500, 6], ['Red Sea', 'البحر الأحمر', 9500, 5], ['Matrouh', 'مطروح', 9500, 6],
  ['North Sinai', 'شمال سيناء', 10000, 6], ['South Sinai', 'جنوب سيناء', 10000, 6], ['New Valley', 'الوادي الجديد', 11000, 7],
];
const CITIES: Record<string, string[]> = {
  Cairo: ['Nasr City', 'Heliopolis', 'Maadi', 'Zamalek', 'New Cairo', 'Downtown', 'Shubra', 'Mokattam'],
  Giza: ['Dokki', 'Mohandessin', '6th of October', 'Sheikh Zayed', 'Haram', 'Agouza'],
  Alexandria: ['Smouha', 'Sidi Gaber', 'Stanley', 'Miami', 'Agami', 'Gleem'],
};

type Cat = { slug: string; en: string; ar: string; deps: string[]; children?: Cat[]; returnable?: boolean };
const CATEGORIES: Cat[] = [
  { slug: 'clothing', en: 'Clothing', ar: 'ملابس', deps: ['WOMEN', 'MEN', 'KIDS'], children: [
    { slug: 'dresses', en: 'Dresses', ar: 'فساتين', deps: ['WOMEN', 'KIDS'] },
    { slug: 'tops', en: 'Tops & Shirts', ar: 'بلوزات وقمصان', deps: ['WOMEN', 'MEN', 'KIDS'] },
    { slug: 'knitwear', en: 'Knitwear', ar: 'تريكو', deps: ['WOMEN', 'MEN'] },
    { slug: 'trousers', en: 'Trousers', ar: 'بناطيل', deps: ['WOMEN', 'MEN', 'KIDS'] },
    { slug: 'outerwear', en: 'Coats & Jackets', ar: 'معاطف وجواكت', deps: ['WOMEN', 'MEN', 'KIDS'] },
    { slug: 'modest', en: 'Modest Wear', ar: 'ملابس محتشمة', deps: ['WOMEN'] },
    { slug: 'swimwear', en: 'Swimwear', ar: 'ملابس سباحة', deps: ['WOMEN', 'MEN'], returnable: false },
    { slug: 'underwear', en: 'Underwear & Lingerie', ar: 'ملابس داخلية', deps: ['WOMEN', 'MEN'], returnable: false },
  ] },
  { slug: 'shoes', en: 'Shoes', ar: 'أحذية', deps: ['WOMEN', 'MEN', 'KIDS'], children: [
    { slug: 'sneakers', en: 'Sneakers', ar: 'سنيكرز', deps: ['WOMEN', 'MEN', 'KIDS'] },
    { slug: 'heels', en: 'Heels', ar: 'كعب عالي', deps: ['WOMEN'] },
    { slug: 'loafers', en: 'Loafers', ar: 'لوفر', deps: ['WOMEN', 'MEN'] },
  ] },
  { slug: 'bags', en: 'Bags', ar: 'حقائب', deps: ['WOMEN', 'MEN'] },
  { slug: 'accessories', en: 'Accessories', ar: 'إكسسوارات', deps: ['WOMEN', 'MEN', 'KIDS'], children: [
    { slug: 'jewellery', en: 'Jewellery', ar: 'مجوهرات', deps: ['WOMEN', 'MEN'] },
    { slug: 'scarves', en: 'Scarves & Hijabs', ar: 'أوشحة وطرح', deps: ['WOMEN'] },
    { slug: 'belts', en: 'Belts', ar: 'أحزمة', deps: ['WOMEN', 'MEN'] },
  ] },
];

const SIZES = { apparel: ['XS', 'S', 'M', 'L', 'XL'], shoes: ['38', '39', '40', '41', '42', '43'], kids: ['2Y', '4Y', '6Y', '8Y', '10Y'], one: ['ONE SIZE'] };

async function main() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/otd');
  console.log('Connected. Resetting collections…');
  for (const m of Object.values(M)) await m.deleteMany({});
  for (const m of Object.values(M)) await m.syncIndexes();

  // Governorates
  const govs = await M.Governorate.insertMany(
    GOVS.map(([en, ar, fee, eta], i) => ({ name: { en, ar }, cities: CITIES[en] ?? [], shippingFee: fee, etaDays: eta, sort: i })),
  );

  // Categories
  const cats: Record<string, any> = {};
  let sort = 0;
  const insertCat = async (c: Cat, parent: any = null) => {
    const doc = await M.Category.create({ slug: c.slug, name: { en: c.en, ar: c.ar }, departments: c.deps, parent, sort: sort++, returnable: c.returnable !== false, image: img(`cat-${c.slug}`, 800, 1000) });
    cats[c.slug] = doc;
    for (const ch of c.children ?? []) await insertCat(ch, doc._id);
  };
  for (const c of CATEGORIES) await insertCat(c);

  // Users
  const hash = (p: string) => argon2.hash(p);
  const verified = new Date();
  const admin = await M.User.create({ name: 'OTD Admin', email: 'admin@otd.test', phone: '01000000001', passwordHash: await hash('Admin123!'), role: 'ADMIN', adminPerms: ['*'], emailVerifiedAt: verified });
  const customer = await M.User.create({
    name: 'Salma Hassan', email: 'customer@otd.test', phone: '01000000009', passwordHash: await hash('Customer123!'), emailVerifiedAt: verified,
    addresses: [{ label: 'Home', fullName: 'Salma Hassan', phone: '01000000009', governorate: govs[0]._id, city: 'Zamalek', area: 'Zamalek', street: '26th of July St, 12', building: 'Apt 4', notes: 'Ring twice', isDefault: true }],
  });

  const brandDefs = [
    { email: 'atelier@otd.test', phone: '01000000002', en: 'Atelier Nour', ar: 'أتيليه نور', slug: 'atelier-nour', dEn: 'Quiet tailoring and modest silhouettes, cut in Cairo.', dAr: 'تفصيل هادئ وقصّات محتشمة، مصنوعة في القاهرة.' },
    { email: 'kemet@otd.test', phone: '01000000003', en: 'Kemet Studio', ar: 'كيميت ستوديو', slug: 'kemet-studio', dEn: 'Contemporary menswear and unisex essentials in Egyptian cotton.', dAr: 'ملابس رجالية معاصرة وأساسيات للجنسين من القطن المصري.' },
    { email: 'mini@otd.test', phone: '01000000004', en: 'Mini Nile', ar: 'ميني نايل', slug: 'mini-nile', dEn: 'Soft, durable clothing for little ones.', dAr: 'ملابس ناعمة ومتينة للصغار.' },
  ];
  const sellers: any[] = [];
  for (const b of brandDefs) {
    const u = await M.User.create({ name: `${b.en} Owner`, email: b.email, phone: b.phone, passwordHash: await hash('Seller123!'), role: 'SELLER', emailVerifiedAt: verified });
    sellers.push(
      await M.Seller.create({
        user: u._id, storeName: { en: b.en, ar: b.ar }, slug: b.slug, ownerName: u.name, phone: b.phone, email: b.email, businessAddress: 'Cairo, Egypt',
        instapayHandle: `${b.slug.replace('-', '')}@instapay`, status: 'APPROVED', logo: img(`${b.slug}-logo`, 400, 400), banner: img(`${b.slug}-banner`, 1800, 800),
        description: { en: b.dEn, ar: b.dAr },
        returnPolicy: { en: 'Returns accepted within 14 days, unworn with tags.', ar: 'نقبل الإرجاع خلال ١٤ يومًا بشرط عدم الاستخدام ووجود البطاقات.' },
        shipping: { flatFee: null, freeAbove: 300000, perGovernorate: [] },
      }),
    );
  }
  const [nour, kemet, mini] = sellers;

  const guides = {
    nour: await M.SizeGuide.create({ seller: nour._id, name: 'Women apparel', unit: 'cm', columns: ['Size', 'Bust', 'Waist', 'Hips'], rows: [['XS', '80', '62', '88'], ['S', '84', '66', '92'], ['M', '88', '70', '96'], ['L', '94', '76', '102'], ['XL', '100', '82', '108']] }),
    kemet: await M.SizeGuide.create({ seller: kemet._id, name: 'Men apparel', unit: 'cm', columns: ['Size', 'Chest', 'Waist', 'Length'], rows: [['S', '96', '80', '70'], ['M', '102', '86', '72'], ['L', '108', '92', '74'], ['XL', '114', '98', '76']] }),
    mini: await M.SizeGuide.create({ seller: mini._id, name: 'Kids', unit: 'cm', columns: ['Age', 'Height', 'Chest'], rows: [['2Y', '92', '52'], ['4Y', '104', '56'], ['6Y', '116', '60'], ['8Y', '128', '64'], ['10Y', '140', '68']] }),
  };

  const C = (en: string, ar: string, hex: string, family: string) => ({ name: { en, ar }, hex, family });
  const BLACK = C('Black', 'أسود', '#0a0a0a', 'black');
  const WHITE = C('Ivory', 'عاجي', '#f5f1e8', 'white');
  const SAND = C('Sand', 'رملي', '#c8b8a6', 'beige');
  const GREY = C('Charcoal', 'فحمي', '#4a4a4a', 'grey');
  const NAVY = C('Navy', 'كحلي', '#1f2a44', 'navy');
  const OLIVE = C('Olive', 'زيتي', '#5b5e3c', 'green');
  const RED = C('Red', 'أحمر', '#b3261e', 'red');
  const EMERALD = C('Emerald', 'زمردي', '#1f6b4f', 'green');
  const BLUSH = C('Blush', 'وردي', '#e3a1b4', 'pink');
  const MUSTARD = C('Mustard', 'خردلي', '#d4a017', 'yellow');
  const SKY = C('Sky', 'سماوي', '#7fa7d6', 'blue');
  const RUST = C('Rust', 'صدئي', '#c4572a', 'orange');
  const SUN = C('Sunshine', 'أصفر مشمس', '#f2c230', 'yellow');
  // Real photos for the colored options, keyed by color name; other colors keep the placeholders.
  const PHOTOS: Record<string, string[]> = {
    'dress:Red': ['1595777457583-95e059d581b8', '1612336307429-8a898d10e223', '1622460432096-f6b772409e1f'],
    'dress:Emerald': ['1631084675579-20db768ae08a', '1685703203919-0c2cfc893c60', '1645626331099-71776e7b31a0'],
    'hijab:Blush': ['1601869610377-0ccf555ed20c', '1617183835731-2d5b33be9f2a', '1772625717865-a6300f44543e'],
    'cardigan:Mustard': ['1618372053850-875650e03ade', '1618371995692-2b001101c97d', '1765650114231-e1ffa17ed3ce'],
    'heel:Red': ['1670607231621-c00fd76d2387', '1654077813634-9ff6b843caab', '1611233299310-f6276ff55307'],
    'oxford:Sky': ['1624835567150-0c530a20d8cc', '1589310243389-96a5483213a8', '1620012253295-c15cc3e65df4'],
    'crew:Rust': ['1611246164691-97f352683561', '1542735128-a1eb57a8fa0c', '1637868994502-ac06e6f1dbec'],
    'kidsdress:Sunshine': ['1611003967145-fb3960072424', '1700751616240-e1faf79c2877', '1700751615484-6b4427a1dacd'],
  };

  type PDef = { key?: string; s: any; cat: string; dep: string; en: string; ar: string; price: number; colors: any[]; sizes: string[]; guide?: any; disc?: any; material?: [string, string] };
  const defs: PDef[] = [
    { key: 'dress', s: nour, cat: 'dresses', dep: 'WOMEN', en: 'Pleated Column Dress', ar: 'فستان طويل بكسرات', price: 189000, colors: [RED, EMERALD, BLACK, SAND], sizes: SIZES.apparel, guide: guides.nour, material: ['100% viscose', '١٠٠٪ فسكوز'] },
    { s: nour, cat: 'modest', dep: 'WOMEN', en: 'Linen Abaya Coat', ar: 'معطف عباية من الكتان', price: 245000, colors: [WHITE, BLACK], sizes: SIZES.apparel, guide: guides.nour, disc: { type: 'PERCENT', value: 20 }, material: ['Linen blend', 'مزيج كتان'] },
    { s: nour, cat: 'tops', dep: 'WOMEN', en: 'Silk-Touch Shirt', ar: 'قميص بملمس الحرير', price: 99000, colors: [WHITE, GREY], sizes: SIZES.apparel, guide: guides.nour },
    { s: nour, cat: 'trousers', dep: 'WOMEN', en: 'Wide-Leg Tailored Trousers', ar: 'بنطال واسع مفصّل', price: 139000, colors: [BLACK, SAND], sizes: SIZES.apparel, guide: guides.nour },
    { key: 'hijab', s: nour, cat: 'scarves', dep: 'WOMEN', en: 'Modal Hijab', ar: 'طرحة مودال', price: 32000, colors: [BLUSH, BLACK, SAND, WHITE], sizes: SIZES.one },
    { s: nour, cat: 'bags', dep: 'WOMEN', en: 'Structured Leather Tote', ar: 'حقيبة جلد منظّمة', price: 329000, colors: [BLACK], sizes: SIZES.one, disc: { type: 'FIXED_PRICE', value: 279000 } },
    { key: 'heel', s: nour, cat: 'heels', dep: 'WOMEN', en: 'Square-Toe Slingback', ar: 'حذاء بكعب ومقدمة مربعة', price: 175000, colors: [RED, BLACK, WHITE], sizes: ['36', '37', '38', '39', '40', '41'] },
    { key: 'cardigan', s: nour, cat: 'knitwear', dep: 'WOMEN', en: 'Ribbed Merino Cardigan', ar: 'كارديجان صوف ميرينو', price: 155000, colors: [MUSTARD, GREY, SAND], sizes: SIZES.apparel, guide: guides.nour },
    { key: 'oxford', s: kemet, cat: 'tops', dep: 'MEN', en: 'Egyptian Cotton Oxford Shirt', ar: 'قميص أكسفورد قطن مصري', price: 89000, colors: [SKY, WHITE, NAVY], sizes: SIZES.apparel.slice(1), guide: guides.kemet, material: ['100% Egyptian cotton', '١٠٠٪ قطن مصري'] },
    { s: kemet, cat: 'outerwear', dep: 'MEN', en: 'Unstructured Wool Overcoat', ar: 'معطف صوف غير مبطّن', price: 459000, colors: [GREY, BLACK], sizes: SIZES.apparel.slice(1), guide: guides.kemet },
    { s: kemet, cat: 'trousers', dep: 'MEN', en: 'Pleated Chino', ar: 'بنطال تشينو بكسرات', price: 115000, colors: [SAND, OLIVE, BLACK], sizes: SIZES.apparel.slice(1), guide: guides.kemet, disc: { type: 'PERCENT', value: 15 } },
    { key: 'crew', s: kemet, cat: 'knitwear', dep: 'MEN', en: 'Heavyweight Crewneck', ar: 'سويتر رقبة دائرية ثقيل', price: 125000, colors: [RUST, GREY, NAVY], sizes: SIZES.apparel.slice(1), guide: guides.kemet },
    { s: kemet, cat: 'sneakers', dep: 'UNISEX', en: 'Court Leather Sneaker', ar: 'سنيكرز جلد كلاسيك', price: 199000, colors: [WHITE, BLACK], sizes: SIZES.shoes },
    { s: kemet, cat: 'loafers', dep: 'MEN', en: 'Penny Loafer', ar: 'حذاء لوفر', price: 219000, colors: [BLACK], sizes: SIZES.shoes },
    { s: kemet, cat: 'belts', dep: 'MEN', en: 'Bridle Leather Belt', ar: 'حزام جلد طبيعي', price: 45000, colors: [BLACK], sizes: ['90', '95', '100', '105'] },
    { s: kemet, cat: 'jewellery', dep: 'UNISEX', en: 'Sterling Signet Ring', ar: 'خاتم فضة', price: 85000, colors: [C('Silver', 'فضي', '#c0c0c0', 'silver')], sizes: ['7', '8', '9', '10'] },
    { key: 'kidsdress', s: mini, cat: 'dresses', dep: 'KIDS', en: 'Smocked Cotton Dress', ar: 'فستان قطن مزموم', price: 59000, colors: [SUN, WHITE, SAND], sizes: SIZES.kids, guide: guides.mini },
    { s: mini, cat: 'tops', dep: 'KIDS', en: 'Organic Tee Pack', ar: 'طقم تيشيرتات عضوي', price: 45000, colors: [WHITE, GREY], sizes: SIZES.kids, guide: guides.mini, disc: { type: 'PERCENT', value: 10 } },
    { s: mini, cat: 'outerwear', dep: 'KIDS', en: 'Quilted Puffer', ar: 'جاكيت منفوخ', price: 99000, colors: [NAVY, BLACK], sizes: SIZES.kids, guide: guides.mini },
    { s: mini, cat: 'sneakers', dep: 'KIDS', en: 'Velcro Canvas Sneaker', ar: 'سنيكرز كانفاس بلاصق', price: 52000, colors: [WHITE], sizes: ['26', '28', '30', '32', '34'] },
  ];

  const products: any[] = [];
  let n = 0;
  for (const d of defs) {
    n++;
    const colors = d.colors.map((c, ci) => ({ _id: new Types.ObjectId(), ...c, images: PHOTOS[`${d.key}:${c.name.en}`]?.map((id) => us(id)) ?? [0, 1, 2].map((k) => img(`otd-${n}-${ci}-${k}`)) }));
    const variants = colors.flatMap((c) =>
      d.sizes.map((size, si) => ({ _id: new Types.ObjectId(), color: c._id, size, sku: `${d.s.slug.slice(0, 4).toUpperCase()}-${n}-${si}`, stock: (n * 7 + si * 3) % 11 })),
    );
    const now = new Date();
    const p: any = {
      seller: d.s._id, category: cats[d.cat]._id, department: d.dep, title: { en: d.en, ar: d.ar },
      slug: d.en.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: {
        en: `${d.en} from ${d.s.storeName.en}. Designed and made in Egypt with considered materials and a precise, timeless cut.`,
        ar: `${d.ar} من ${d.s.storeName.ar}. مصمم ومصنوع في مصر بخامات مختارة وقصّة دقيقة لا تبطل موضتها.`,
      },
      specs: [{ label: { en: 'Fit', ar: 'المقاس' }, value: { en: 'True to size', ar: 'مطابق للمقاس' } }, { label: { en: 'Origin', ar: 'بلد الصنع' }, value: { en: 'Made in Egypt', ar: 'صنع في مصر' } }],
      material: d.material ? { en: d.material[0], ar: d.material[1] } : { en: 'See label', ar: 'انظر البطاقة' },
      care: { en: 'Cold wash, dry flat.', ar: 'غسيل بارد، تجفيف مفرود.' },
      price: d.price, colors, variants, sizeGuide: d.guide?._id,
      discount: d.disc ? { ...d.disc, startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 30 * 86_400_000) } : undefined,
      status: 'LIVE', publishedAt: new Date(now.getTime() - n * 3_600_000), soldCount: (n * 13) % 40,
      rating: 0, ratingCount: 0,
    };
    Object.assign(p, productDerived(p));
    p.searchText = normalizeSearch([d.en, d.ar, d.s.storeName.en, d.s.storeName.ar, cats[d.cat].name.en, cats[d.cat].name.ar, ...d.colors.flatMap((c) => [c.name.en, c.name.ar, c.family])].join(' '));
    products.push(await M.Product.create(p));
  }

  await M.Look.insertMany([
    { seller: nour._id, title: { en: 'The Quiet Office', ar: 'إطلالة المكتب الهادئة' }, description: { en: 'Soft tailoring for long days.', ar: 'تفصيل ناعم لأيام طويلة.' }, cover: img('look-office', 1200, 1500), products: [products[2]._id, products[3]._id, products[5]._id, products[6]._id], featured: true },
    { seller: kemet._id, title: { en: 'Weekend in Zamalek', ar: 'عطلة في الزمالك' }, description: { en: 'Easy layers, good shoes.', ar: 'طبقات مريحة وحذاء جيد.' }, cover: img('look-zamalek', 1200, 1500), products: [products[8]._id, products[10]._id, products[12]._id], featured: true },
    { seller: nour._id, title: { en: 'Evening, Simply', ar: 'المساء ببساطة' }, cover: us('1527189919029-aeb3d997547d', 1200, 1500), products: [products[0]._id, products[6]._id, products[5]._id] },
  ]);

  await M.Banner.insertMany([
    { placement: 'HERO', kicker: { en: 'Autumn / Winter 2026', ar: 'خريف / شتاء ٢٠٢٦' }, title: { en: 'Dress the day.', ar: 'تأنّق ليومك.' }, subtitle: { en: 'Egypt’s independent fashion houses, curated in one place.', ar: 'دور الأزياء المصرية المستقلة، في مكان واحد.' }, image: us('1662532577856-e8ee8b138a8b', 2000, 1300), link: '/women', cta: { en: 'Shop Women', ar: 'تسوّقي للنساء' } },
    { placement: 'EDIT', title: { en: 'New In', ar: 'وصل حديثًا' }, image: us('1590343104492-972a3169bc98', 1200, 1500), link: '/search?sort=newest' },
    { placement: 'EDIT', title: { en: 'Complete the Look', ar: 'أكمل الإطلالة' }, image: img('edit-looks', 1200, 1600), link: '/looks' },
    { placement: 'EDIT', title: { en: 'Designers to Know', ar: 'مصممون يجب أن تعرفهم' }, image: img('edit-brands', 1600, 1000), link: '/brands' },
  ]);

  await M.Coupon.insertMany([
    { code: 'WELCOME10', type: 'PERCENT', value: 10, maxDiscount: 30000, newCustomersOnly: true, perCustomerLimit: 1, scope: 'GLOBAL' },
    { code: 'NOUR15', type: 'PERCENT', value: 15, scope: 'SELLERS', sellers: [nour._id], excludesDiscounted: true },
  ]);

  const placeholder = (en: string, ar: string) => ({
    en: `<p>${en}</p><p><em>Placeholder text — to be replaced with copy reviewed by an Egyptian lawyer before launch.</em></p>`,
    ar: `<p>${ar}</p><p><em>نص مؤقت — سيتم استبداله بنص يراجعه محامٍ مصري قبل الإطلاق.</em></p>`,
  });
  await M.Page.insertMany([
    { slug: 'about', title: { en: 'About OTD', ar: 'عن OTD' }, body: placeholder('Outfit The Day brings Egypt’s independent fashion houses together in one curated destination.', 'يجمع Outfit The Day دور الأزياء المصرية المستقلة في وجهة واحدة مختارة بعناية.') },
    { slug: 'contact', title: { en: 'Contact', ar: 'تواصل معنا' }, body: placeholder('Email hello@otd.eg — we reply within one working day.', 'راسلنا على hello@otd.eg — نرد خلال يوم عمل.') },
    { slug: 'terms', title: { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, body: placeholder('These terms govern your use of OTD.', 'تحكم هذه الشروط استخدامك لـ OTD.') },
    { slug: 'privacy', title: { en: 'Privacy Policy', ar: 'سياسة الخصوصية' }, body: placeholder('How we collect and protect your data.', 'كيف نجمع بياناتك ونحميها.') },
    { slug: 'returns', title: { en: 'Return Policy', ar: 'سياسة الإرجاع' }, body: placeholder('Return within 14 days of delivery. The brand covers return shipping for faulty or wrong items; otherwise the customer does. Underwear and swimwear are final sale.', 'يمكنك الإرجاع خلال ١٤ يومًا من الاستلام. تتحمل الماركة تكلفة الشحن للمنتجات المعيبة أو الخاطئة، وفيما عدا ذلك يتحملها العميل. الملابس الداخلية وملابس السباحة غير قابلة للإرجاع.') },
    { slug: 'faq', title: { en: 'FAQ', ar: 'الأسئلة الشائعة' }, body: placeholder('How does InstaPay work? Send the exact amount to the brand’s InstaPay handle and upload the screenshot.', 'كيف يعمل إنستاباي؟ أرسل المبلغ بالضبط إلى حساب الماركة وارفع صورة التحويل.') },
    { slug: 'seller-agreement', title: { en: 'Seller Agreement', ar: 'اتفاقية البائع' }, body: placeholder('Commission, billing cycle, late payment and suspension terms for brands selling on OTD.', 'شروط العمولة ودورة الفواتير والتأخر في السداد والإيقاف للماركات على OTD.') },
  ]);

  console.log(`Seeded: ${govs.length} governorates, ${Object.keys(cats).length} categories, ${sellers.length} brands, ${products.length} products, admin ${admin.email}, customer ${customer.email}.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
