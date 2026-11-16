// Cart pricing, checkout guards and order ownership (the full money flow lives in scripts/e2e.mjs).
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { as, client, freshCustomer } from './client.mjs';

const g = client();
let A, B, gov;

before(async () => {
  const pick = async (seller) => {
    const list = (await g.get(`/products?seller=${seller}&facets=false&limit=48`)).data.items;
    const p = (await g.get('/products/' + list.find((x) => x.totalStock > 3).slug)).data;
    return { p, v: p.variants.find((v) => v.stock >= 2) };
  };
  A = await pick('atelier-nour');
  B = await pick('kemet-studio');
  gov = (await g.get('/geo/governorates')).data[0]._id;
});

async function shopperWithAddress() {
  const c = await freshCustomer();
  const r = await c.post('/account/addresses', {
    label: 'Home', fullName: 'Test Shopper', phone: '01001234567', governorate: gov, city: 'Nasr City', street: '12 Abbas El Akkad', building: '4', floor: '2', apartment: '8',
  });
  assert.ok(r.status < 300, 'address: ' + JSON.stringify(r.data));
  const list = (await c.get('/account/addresses')).data;
  return Object.assign(c, { addressId: list[0]._id });
}

describe('cart pricing', () => {
  it('groups by brand and the totals add up', async () => {
    const r = await g.post('/cart/price', {
      items: [{ product: A.p._id, variant: A.v._id, qty: 2 }, { product: B.p._id, variant: B.v._id, qty: 1 }],
      governorate: gov,
    });
    assert.ok(r.status < 300, 'status ' + r.status);
    const t = r.data.totals;
    assert.equal(r.data.groups.length, 2);
    assert.equal(t.total, t.items - t.coupon + t.shipping);
    const groupItems = r.data.groups.reduce((s, x) => s + x.items.reduce((a, i) => a + i.lineTotal, 0), 0);
    assert.equal(groupItems, t.items, 'line totals sum to items total');
  });

  it('reports unknown coupons without failing the request', async () => {
    const r = await g.post('/cart/price', { items: [{ product: A.p._id, variant: A.v._id, qty: 1 }], couponCode: 'NOT-A-CODE' });
    assert.ok(r.status < 300, 'status ' + r.status);
    assert.ok(r.data.couponError);
    assert.equal(r.data.totals.coupon, 0);
  });

  it('applies the welcome coupon for a brand-new customer', async () => {
    const c = await freshCustomer();
    const r = await c.post('/cart/price', { items: [{ product: A.p._id, variant: A.v._id, qty: 1 }], couponCode: 'WELCOME10' });
    assert.ok(r.status < 300, 'status ' + r.status);
    assert.ok(!r.data.couponError, String(r.data.couponError));
    assert.ok(r.data.totals.coupon > 0);
  });

  it('rejects malformed cart lines', async () => {
    assert.equal((await g.post('/cart/price', { items: [{ product: 'x', variant: 'y', qty: 1 }] })).status, 400);
    assert.equal((await g.post('/cart/price', { items: [{ product: A.p._id, variant: A.v._id, qty: 0 }] })).status, 400);
  });
});

describe('checkout', () => {
  it('requires login', async () => {
    const r = await g.post('/orders', { items: [{ product: A.p._id, variant: A.v._id, qty: 1 }], addressId: '64b7f0c2a1b2c3d4e5f60718', paymentMethod: 'COD' });
    assert.equal(r.status, 401);
  });

  it('refuses more than the available stock', async () => {
    const c = await shopperWithAddress();
    const r = await c.post('/orders', { items: [{ product: A.p._id, variant: A.v._id, qty: A.v.stock + 50 }], addressId: c.addressId, paymentMethod: 'COD' });
    assert.ok(r.status >= 400 && r.status < 500, 'status ' + r.status);
    const after = (await g.get('/products/' + A.p.slug)).data.variants.find((v) => v._id === A.v._id);
    assert.equal(after.stock, A.v.stock, 'stock untouched by a failed order');
  });

  it("refuses someone else's address", async () => {
    const owner = await shopperWithAddress();
    const thief = await shopperWithAddress();
    const r = await thief.post('/orders', { items: [{ product: A.p._id, variant: A.v._id, qty: 1 }], addressId: owner.addressId, paymentMethod: 'COD' });
    assert.ok(r.status >= 400 && r.status < 500, 'status ' + r.status);
  });

  it('places a COD order, reserves stock, and keeps it private to the buyer', async () => {
    const c = await shopperWithAddress();
    const before = (await g.get('/products/' + B.p.slug)).data.variants.find((v) => v._id === B.v._id).stock;
    const r = await c.post('/orders', { items: [{ product: B.p._id, variant: B.v._id, qty: 1 }], addressId: c.addressId, paymentMethod: 'COD' });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    const number = r.data.number;
    const after = (await g.get('/products/' + B.p.slug)).data.variants.find((v) => v._id === B.v._id).stock;
    assert.equal(after, before - 1);

    const mine = await c.get('/orders');
    assert.ok((mine.data.items ?? mine.data).some((o) => o.number === number));
    const other = await freshCustomer();
    assert.ok([403, 404].includes((await other.get('/orders/' + number)).status), 'other customers cannot read it');

    // The other brand never sees this sub-order; the right brand does.
    const order = (await c.get('/orders/' + number)).data;
    const sub = order.subOrders[0];
    const nour = await as('nour');
    assert.ok([403, 404].includes((await nour.get('/seller/orders/' + sub._id)).status));
    const kemet = await as('kemet');
    assert.equal((await kemet.get('/seller/orders/' + sub._id)).status, 200);

    // Customer can cancel before shipping; stock comes back.
    assert.ok((await c.post(`/orders/sub/${sub._id}/cancel`, { reason: 'Changed my mind' })).status < 300);
    const restored = (await g.get('/products/' + B.p.slug)).data.variants.find((v) => v._id === B.v._id).stock;
    assert.equal(restored, before);
  });

  it('InstaPay proof must be uploaded by the buyer', async () => {
    const c = await shopperWithAddress();
    const r = await c.post('/orders', { items: [{ product: B.p._id, variant: B.v._id, qty: 1 }], addressId: c.addressId, paymentMethod: 'INSTAPAY' });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    const sub = (await c.get('/orders/' + r.data.number)).data.subOrders[0];
    assert.equal(sub.status, 'AWAITING_PAYMENT');
    // A file owned by someone else cannot be attached as proof.
    const stranger = await freshCustomer();
    const foreign = (await stranger.upload('private')).data;
    assert.equal((await c.post(`/orders/sub/${sub._id}/proof`, { file: foreign.url, referenceNo: 'REF' + Date.now() })).status, 400);
    const own = (await c.upload('private')).data;
    assert.ok((await c.post(`/orders/sub/${sub._id}/proof`, { file: own.url, referenceNo: 'REF' + Date.now() })).status < 300);
    await c.post(`/orders/sub/${sub._id}/cancel`, { reason: 'Test cleanup' });
  });
});
