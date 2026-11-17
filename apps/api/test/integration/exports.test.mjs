// Generated documents: PDF invoices and statements, XLSX statements and reports, and who may fetch them.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { API, as, client, freshCustomer } from './client.mjs';

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Raw download (the JSON client would mangle binary bodies). */
async function download(c, path) {
  const cookie = [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(API + path, { headers: cookie ? { cookie } : {} });
  return { status: r.status, type: r.headers.get('content-type') ?? '', disposition: r.headers.get('content-disposition') ?? '', body: Buffer.from(await r.arrayBuffer()) };
}
const isPdf = (d) => d.type.startsWith(PDF) && d.body.subarray(0, 5).toString() === '%PDF-' && d.body.subarray(-6).toString().includes('%%EOF');
const isXlsx = (d) => d.type.startsWith(XLSX) && d.body.subarray(0, 2).toString() === 'PK';

let admin, nour, customer, orderNumber, nourId;

before(async () => {
  [admin, nour, customer] = await Promise.all([as('admin'), as('nour'), as('customer')]);
  // Place a fresh order so the customer has one to download.
  const g = client();
  const list = (await g.get('/products?seller=atelier-nour&facets=false&limit=48')).data.items;
  const p = (await g.get('/products/' + list.find((x) => x.totalStock > 3).slug)).data;
  const v = p.variants.find((x) => x.stock >= 1);
  const gov = (await g.get('/geo/governorates')).data[0]._id;
  await customer.ok('POST', '/account/addresses', { label: 'Home', fullName: 'Test Shopper', phone: '01001234567', governorate: gov, city: 'Nasr City', street: '1 Test St', building: '1' });
  const addressId = (await customer.ok('GET', '/account/addresses')).at(-1)._id;
  const o = await customer.ok('POST', '/orders', { items: [{ product: p._id, variant: v._id, qty: 1 }], addressId, paymentMethod: 'COD' });
  orderNumber = o.number ?? o.order?.number;
  nourId = (await nour.ok('GET', '/sellers/me'))._id;
});

describe('customer invoice PDF', () => {
  it('downloads a valid PDF for the customer’s own order', async () => {
    const d = await download(customer, `/orders/${orderNumber}/invoice/pdf`);
    assert.equal(d.status, 200);
    assert.ok(isPdf(d), `content-type ${d.type}`);
    assert.match(d.disposition, new RegExp(`attachment; filename="otd-invoice-${orderNumber}\\.pdf"`));
  });

  it('is not available to other customers or guests', async () => {
    assert.equal((await download(await freshCustomer(), `/orders/${orderNumber}/invoice/pdf`)).status, 404);
    assert.equal((await download(client(), `/orders/${orderNumber}/invoice/pdf`)).status, 401);
  });
});

describe('seller statements', () => {
  it('exports the seller’s own statement as PDF and XLSX', async () => {
    assert.ok(isPdf(await download(nour, '/seller/finance/statement/pdf')));
    assert.ok(isXlsx(await download(nour, '/seller/finance/statement/xlsx')));
  });

  it('rejects unknown formats and non-sellers', async () => {
    assert.equal((await download(nour, '/seller/finance/statement/docx')).status, 400);
    assert.equal((await download(customer, '/seller/finance/statement/pdf')).status, 403);
  });

  it('lets admins export any seller’s statement', async () => {
    assert.ok(isPdf(await download(admin, `/admin/finance/sellers/${nourId}/statement/pdf`)));
    assert.ok(isXlsx(await download(admin, `/admin/finance/sellers/${nourId}/statement/xlsx`)));
    assert.equal((await download(nour, `/admin/finance/sellers/${nourId}/statement/pdf`)).status, 403);
  });
});

describe('commission invoice PDF', () => {
  it('downloads for the owning seller and admins only', async (t) => {
    await admin.ok('POST', '/admin/finance/run-billing');
    const inv = (await admin.ok('GET', '/admin/finance/invoices')).find((i) => String(i.seller?._id ?? i.seller) === String(nourId));
    if (!inv) return t.skip('no commission invoice for this seller in the test data');
    assert.ok(isPdf(await download(nour, `/seller/finance/invoices/${inv._id}/pdf`)));
    assert.ok(isPdf(await download(admin, `/admin/finance/invoices/${inv._id}/pdf`)));
    assert.equal((await download(await as('kemet'), `/seller/finance/invoices/${inv._id}/pdf`)).status, 404);
  });
});

describe('admin reports', () => {
  for (const kind of ['sales', 'commission', 'coupons', 'returns']) {
    it(`exports the ${kind} report as XLSX`, async () => {
      const d = await download(admin, `/admin/reports/${kind}?format=xlsx`);
      assert.equal(d.status, 200);
      assert.ok(isXlsx(d), `content-type ${d.type}`);
      assert.match(d.disposition, /filename="otd-\w+-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx"/);
    });
  }

  it('keeps CSV and JSON working', async () => {
    const csv = await download(admin, '/admin/reports/sales?format=csv');
    assert.match(csv.type, /text\/csv/);
    assert.ok((await admin.get('/admin/reports/sales')).data.header.length > 0);
  });
});
