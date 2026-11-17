// End-to-end API smoke test against a freshly seeded DB:  pnpm seed && node scripts/e2e.mjs
// Drives: auth → cart pricing → coupon → multi-brand checkout (COD + InstaPay) → seller fulfilment
// → InstaPay proof → delivery → commission → review → return/refund → billing → seller payment → admin.
const API = process.env.API ?? 'http://localhost:4000/api';
let pass = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error('FAIL: ' + msg);
  pass++;
  console.log('  ✓', msg);
};

function client() {
  let cookie = '';
  const call = async (method, path, body, raw) => {
    if (method !== 'GET' && !/otd_csrf=/.test(cookie)) await call('GET', '/auth/csrf');
    const csrf = method !== 'GET' ? { 'x-csrf-token': cookie.match(/otd_csrf=([a-f0-9]+)/)?.[1] ?? '' } : {};
    const r = await fetch(API + path, {
      method,
      headers: { cookie, ...(raw ? {} : { 'content-type': 'application/json' }), ...csrf },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const set = r.headers.getSetCookie?.() ?? [];
    if (set.length) {
      const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((c) => c.split('=')));
      for (const s of set) {
        const [kv] = s.split(';');
        const [k, v] = kv.split('=');
        jar[k] = v;
      }
      cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) {
      const e = new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b),
    upload: async (visibility = 'private') => {
      // 1x1 PNG
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
      const fd = new FormData();
      fd.append('file', new Blob([png], { type: 'image/png' }), 'proof.png');
      return call('POST', `/files?visibility=${visibility}`, null, fd);
    },
    expectFail: async (fn, msg) => {
      try { await fn(); } catch (e) { ok(true, msg + ` (${e.status})`); return e; }
      throw new Error('FAIL (expected error): ' + msg);
    },
  };
}

const customer = client(), admin = client(), nour = client(), kemet = client(), guest = client();

console.log('Auth');
await customer.post('/auth/login', { identifier: 'customer@otd.test', password: 'Customer123!' });
await admin.post('/auth/login', { identifier: 'admin@otd.test', password: 'Admin123!' });
await nour.post('/auth/login', { identifier: 'atelier@otd.test', password: 'Seller123!' });
await kemet.post('/auth/login', { identifier: 'kemet@otd.test', password: 'Seller123!' });
ok((await customer.get('/auth/me')).role === 'CUSTOMER', 'customer logged in');
await customer.expectFail(() => customer.get('/admin/dashboard'), 'customer cannot open admin API');
await customer.expectFail(() => customer.get('/seller/orders'), 'customer cannot open seller API');
await guest.expectFail(() => guest.post('/auth/login', { identifier: 'customer@otd.test', password: 'nope' }), 'wrong password rejected');

console.log('Catalog');
const home = await guest.get('/content/home');
ok(home.newIn.length > 0 && home.banners.length > 0, 'home content');
const search = await guest.get('/products?q=' + encodeURIComponent('فستان'));
ok(search.total >= 1, 'Arabic search finds dresses');
const searchAlef = await guest.get('/products?q=' + encodeURIComponent('اتيليه'));
ok(searchAlef.total >= 1, 'Arabic alef-normalized brand search');
const women = await guest.get('/products?department=women&sort=price_asc');
ok(women.items.length > 1 && women.items[0].effectivePrice <= women.items[1].effectivePrice, 'department filter + price sort');
const sale = await guest.get('/products?onSale=true');
ok(sale.items.every((p) => p.onSale), 'on-sale filter');

const nourList = await guest.get('/products?seller=atelier-nour&facets=false&limit=48');
const kemetList = await guest.get('/products?seller=kemet-studio&facets=false&limit=48');
const pickVariant = async (slug) => {
  const p = await guest.get('/products/' + slug);
  const v = p.variants.find((x) => x.stock >= 2);
  return { p, v };
};
const A = await pickVariant(nourList.items.find((p) => !p.onSale && p.totalStock > 5).slug);
const B = await pickVariant(kemetList.items.find((p) => p.totalStock > 5).slug);
ok(A.v && B.v, 'picked in-stock variants from two brands');

console.log('Cart & coupon');
const items = [
  { product: A.p._id, variant: A.v._id, qty: 2 },
  { product: B.p._id, variant: B.v._id, qty: 1 },
];
const me = await customer.get('/auth/me');
const addresses = await customer.get('/account/addresses');
const priced = await customer.post('/cart/price', { items, couponCode: 'NOUR15', governorate: addresses[0].governorate._id });
ok(priced.groups.length === 2, 'cart grouped by brand');
const nourGroup = priced.groups.find((g) => g.seller.slug === 'atelier-nour');
const kemetGroup = priced.groups.find((g) => g.seller.slug === 'kemet-studio');
ok(nourGroup.couponShare > 0 && kemetGroup.couponShare === 0, 'local (brand) coupon only discounts that brand');
ok(priced.totals.total === priced.totals.items - priced.totals.coupon + priced.totals.shipping, 'totals add up');
const bad = await customer.post('/cart/price', { items, couponCode: 'NOPE' });
ok(bad.couponError, 'invalid coupon reported');

console.log('Checkout (COD)');
const order1 = await customer.post('/orders', { items, addressId: addresses[0]._id, paymentMethod: 'COD', couponCode: 'NOUR15' });
ok(order1.number, 'COD order placed ' + order1.number);
const o1 = await customer.get('/orders/' + order1.number);
ok(o1.subOrders.length === 2, 'one main order, two sub-orders');
const afterA = await guest.get('/products/' + A.p.slug);
ok(afterA.variants.find((x) => x._id === A.v._id).stock === A.v.stock - 2, 'stock reserved');

console.log('Seller fulfilment');
const nourSub = o1.subOrders.find((s) => s.seller.slug === 'atelier-nour');
const nourOrders = await nour.get('/seller/orders');
ok(nourOrders.items.some((s) => s._id === nourSub._id), 'seller sees own sub-order');
await kemet.expectFail(() => kemet.get('/seller/orders/' + nourSub._id), 'other seller cannot see it');
await nour.expectFail(() => nour.post(`/seller/orders/${nourSub._id}/status`, { status: 'DELIVERED' }), 'invalid status jump blocked');
await nour.post(`/seller/orders/${nourSub._id}/status`, { status: 'CONFIRMED' });
await nour.post(`/seller/orders/${nourSub._id}/status`, { status: 'PROCESSING' });
await nour.expectFail(() => nour.post(`/seller/orders/${nourSub._id}/status`, { status: 'SHIPPED' }), 'shipping needs courier');
await nour.post(`/seller/orders/${nourSub._id}/status`, { status: 'SHIPPED', courier: 'Bosta', trackingNo: 'BST123' });
await customer.expectFail(() => customer.post(`/orders/sub/${nourSub._id}/cancel`, { reason: 'changed mind' }), 'cannot cancel after shipping');
const delivered = await nour.post(`/seller/orders/${nourSub._id}/status`, { status: 'DELIVERED' });
ok(delivered.paymentStatus === 'COLLECTED' && delivered.commissionAmount > 0, 'delivered, COD collected, commission calculated');

const kemetSub = o1.subOrders.find((s) => s.seller.slug === 'kemet-studio');
await customer.post(`/orders/sub/${kemetSub._id}/cancel`, { reason: 'Ordered wrong size' });
const afterB = await guest.get('/products/' + B.p.slug);
ok(afterB.variants.find((x) => x._id === B.v._id).stock === B.v.stock, 'cancel released stock');

console.log('Commission ledger');
let stmt = await nour.get('/seller/finance');
const expectedCommission = delivered.items.reduce((s, i) => s + Math.round((i.lineTotal * i.commissionRate) / 100), 0);
ok(stmt.totals.commission === expectedCommission, 'commission = rate × items after seller discount');
ok(stmt.totals.couponCredits === nourSub.couponShare, 'platform-funded coupon credited to seller');
ok(stmt.balance === expectedCommission - nourSub.couponShare, 'balance = commission − coupon credit');

console.log('Review');
const item = delivered.items[0];
await customer.post('/reviews', { subOrder: nourSub._id, item: item._id, rating: 5, text: 'Beautiful cut.' });
await customer.expectFail(() => customer.post('/reviews', { subOrder: nourSub._id, item: item._id, rating: 4 }), 'one review per product per order');
ok((await guest.get('/products/' + A.p.slug)).rating === 5, 'product rating updated');

console.log('Return & refund');
const photo = await customer.upload('private');
const ret = await customer.post('/returns', { subOrder: nourSub._id, items: [{ item: item._id, qty: 1 }], reason: 'SIZE', photos: [photo.url] });
ok(ret.returnShippingPaidBy === 'CUSTOMER', 'size return: customer pays return shipping');
await kemet.expectFail(() => kemet.get('/files/private/' + photo.key), 'unrelated seller cannot open private photo');
await nour.get('/files/private/' + photo.key).then(() => ok(true, 'brand can view return photo'));
await nour.post(`/seller/returns/${ret._id}/approve`, {});
await nour.post(`/seller/returns/${ret._id}/received`, { restock: true });
const refunded = await nour.post(`/seller/returns/${ret._id}/refunded`, {});
ok(refunded.refundAmount > 0, 'refund recorded ' + refunded.refundAmount);
stmt = await nour.get('/seller/finance');
const expRev = -Math.round((item.lineTotal / item.qty) * (item.commissionRate / 100)) + Math.round(item.couponShare / item.qty);
ok(stmt.totals.reversals === expRev, `return reverses commission and coupon credit for returned qty (${expRev})`);

console.log('Checkout (InstaPay)');
const order2 = await customer.post('/orders', { items: [{ product: B.p._id, variant: B.v._id, qty: 1 }], addressId: addresses[0]._id, paymentMethod: 'INSTAPAY' });
const o2 = await customer.get('/orders/' + order2.number);
const ip = o2.subOrders[0];
ok(ip.status === 'AWAITING_PAYMENT' && ip.instapayHandle, 'awaiting InstaPay proof, handle shown');
await kemet.expectFail(() => kemet.post(`/seller/orders/${ip._id}/status`, { status: 'CONFIRMED' }), 'cannot confirm before payment');
const proof = await customer.upload('private');
const ref = 'IPN' + Date.now();
await customer.post(`/orders/sub/${ip._id}/proof`, { file: proof.url, referenceNo: ref });
await kemet.post(`/seller/orders/${ip._id}/payment/reject`, { reason: 'Amount not received' });
const proof2 = await customer.upload('private');
await customer.expectFail(() => customer.post(`/orders/sub/${ip._id}/proof`, { file: proof2.url, referenceNo: ref }), 'duplicate reference number blocked');
await customer.post(`/orders/sub/${ip._id}/proof`, { file: proof2.url, referenceNo: ref + 'B' });
const conf = await kemet.post(`/seller/orders/${ip._id}/payment/confirm`, {});
ok(conf.status === 'CONFIRMED' && conf.paymentStatus === 'CONFIRMED', 'InstaPay confirmed → order confirmed');
await kemet.post(`/seller/orders/${ip._id}/status`, { status: 'SHIPPED', courier: 'Own rider' });
await kemet.post(`/seller/orders/${ip._id}/status`, { status: 'DELIVERED' });

console.log('Coupon rules');
await customer.post('/cart/price', { items, couponCode: 'WELCOME10' }).then((r) => ok(r.couponError, 'new-customers-only coupon refused for returning customer'));

console.log('Billing & commission payment');
const run = await admin.post('/admin/finance/run-billing');
ok(run.created >= 2, 'invoices generated: ' + run.created);
stmt = await kemet.get('/seller/finance');
const inv = stmt.invoices[0];
ok(inv && inv.amountDue > 0, 'kemet invoice due ' + inv.amountDue);
ok(String(await kemet.get(`/seller/finance/invoices/${inv._id}/pdf`)).startsWith('%PDF-'), 'commission invoice downloads as PDF (seller)');
ok(String(await admin.get(`/admin/finance/invoices/${inv._id}/pdf`)).startsWith('%PDF-'), 'commission invoice downloads as PDF (admin)');
await nour.expectFail(() => nour.get(`/seller/finance/invoices/${inv._id}/pdf`), 'another brand cannot download that invoice');
const payProof = await kemet.upload('private');
const pay = await kemet.post('/seller/finance/payments', { invoice: inv._id, amount: inv.amountDue, file: payProof.url, referenceNo: 'KMT' + Date.now() });
await admin.post(`/admin/finance/payments/${pay._id}/confirm`, {});
stmt = await kemet.get('/seller/finance');
ok(stmt.invoices[0].status === 'PAID' && stmt.balance === 0, 'invoice paid, balance zero');

console.log('Admin');
const dash = await admin.get('/admin/dashboard');
ok(dash.orders >= 2 && dash.commissionGross > 0 && dash.couponCost > 0, 'admin dashboard figures (gross commission, coupon cost, net)');
const report = await admin.get('/admin/reports/sales?by=seller');
ok(report.rows.length >= 1, 'sales report');
const users = await admin.get('/admin/users?q=salma');
ok(users.total === 1, 'user search');
const coupon = await admin.post('/admin/coupons', { code: 'E2E' + Date.now().toString().slice(-5), type: 'FIXED', value: 5000, scope: 'GLOBAL', sellers: [] });
ok(coupon._id, 'coupon created');
const pending = await admin.get('/admin/products?status=PENDING');
ok(Array.isArray(pending.items), 'moderation queue');

console.log('Seller onboarding & moderation');
const newbie = client();
const stamp = Date.now().toString().slice(-7);
await newbie.post('/auth/register', { name: 'New Brand', email: `brand${stamp}@otd.test`, phone: `012${stamp.padStart(8, '0')}`, password: 'Brand123!x' });
const idDoc = await newbie.upload('private');
const app = await newbie.post('/sellers/apply', {
  storeName: { en: `Maison ${stamp}`, ar: '' }, ownerName: 'Owner', phone: `012${stamp.padStart(8, '0')}`, email: `brand${stamp}@otd.test`,
  businessAddress: 'Heliopolis, Cairo', nationalIdFile: idDoc.url, instapayHandle: 'maison@instapay',
});
ok(app.status === 'PENDING', 'seller application pending');
await newbie.expectFail(() => newbie.get('/seller/products'), 'pending seller cannot list products');
await admin.post(`/admin/sellers/${app._id}/approve`, {});
await newbie.post('/auth/refresh'); // pick up SELLER role
const cats = await guest.get('/categories');
const img1 = await newbie.upload('public');
const product = await newbie.post('/seller/products', {
  category: cats.find((c) => c.slug === 'dresses')._id, department: 'WOMEN',
  title: { en: `Test Slip Dress ${stamp}`, ar: 'فستان تجريبي' }, description: { en: 'Bias-cut satin.', ar: '' },
  price: 120000, colors: [{ key: 'c1', name: { en: 'Black', ar: 'أسود' }, hex: '#000000', family: 'black', images: [img1.url] }],
  variants: [{ colorKey: 'c1', size: 'S', stock: 3 }, { colorKey: 'c1', size: 'M', stock: 0 }],
});
ok(product.status === 'PENDING', 'new product awaits approval');
ok((await guest.get(`/products?q=${stamp}`)).total === 0, 'pending product hidden from shop');
await admin.post(`/admin/products/${product._id}/approve`, {});
const found = await guest.get(`/products?q=${stamp}`);
ok(found.total === 1 && found.items[0].totalStock === 3, 'approved product live and searchable');
const disc = await newbie.put(`/seller/products/${product._id}/discount`, { type: 'PERCENT', value: 25 });
ok(disc.onSale && disc.effectivePrice === 90000, 'seller discount applied (25% → EGP 900)');
await admin.post(`/admin/sellers/${app._id}/suspend`, { reason: 'test' });
ok((await guest.get(`/products?q=${stamp}`)).total === 0, 'suspended brand products hidden');

console.log(`\nAll ${pass} checks passed.`);
