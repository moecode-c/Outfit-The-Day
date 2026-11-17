// Side checks: health, security headers, CORS, validation, error shape, private files.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API, ORIGIN, as, client, freshCustomer } from './client.mjs';

const guest = client();

describe('platform', () => {
  it('health endpoint reports the database is up', async () => {
    const r = await guest.get('/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'ok');
    assert.equal(r.data.db, 'up');
  });

  it('sends helmet security headers', async () => {
    const r = await guest.get('/health');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('content-security-policy'), 'CSP header');
    assert.ok(r.headers.get('strict-transport-security'), 'HSTS header');
    assert.equal(r.headers.get('x-powered-by'), null, 'x-powered-by hidden');
  });

  it('allows CORS only for the web origin, with credentials', async () => {
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const ok = await fetch(API + '/health', { headers: { origin: web } });
    assert.equal(ok.headers.get('access-control-allow-origin'), web);
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    const evil = await fetch(API + '/health', { headers: { origin: 'https://evil.example' } });
    assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const r = await guest.get('/does-not-exist');
    assert.equal(r.status, 404);
    assert.equal(typeof r.data, 'object');
  });

  it('rejects malformed bodies with 400 and field details', async () => {
    const r = await guest.post('/auth/register', { name: 'x', email: 'not-an-email', phone: '123', password: 'short' });
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.data), /email|phone|password/i);
  });

  it('rejects invalid ObjectIds and unknown slugs', async () => {
    const admin = await as('admin');
    assert.equal((await admin.get('/admin/users/not-an-id')).status >= 400, true);
    assert.equal((await guest.get('/products/no-such-product-xyz')).status, 404);
  });

  it('requires auth for private routes', async () => {
    for (const p of ['/auth/me', '/account/addresses', '/orders', '/seller/orders', '/admin/dashboard']) {
      assert.equal((await guest.get(p)).status, 401, p);
    }
  });
});

describe('file uploads', () => {
  it('stores public images and serves them statically', async () => {
    const c = await freshCustomer();
    const up = await c.upload('public');
    assert.equal(up.status, 201);
    assert.match(up.data.url, /^\/uploads\/.+\.png$/);
    const img = await fetch(ORIGIN + up.data.url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
  });

  it('rejects files whose bytes do not match the declared type', async () => {
    const c = await freshCustomer();
    const r = await c.upload('public', Buffer.from('MZ fake exe'), 'image/png', 'evil.png');
    assert.equal(r.status, 400);
    const pdfAsPublic = await c.upload('public', Buffer.from('%PDF-1.4'), 'application/pdf', 'doc.pdf');
    assert.equal(pdfAsPublic.status, 400, 'PDFs are not public images');
  });

  it('rejects anonymous uploads', async () => {
    assert.equal((await guest.upload('public')).status, 401);
  });

  it('private files are visible to owner and admin only', async () => {
    const owner = await freshCustomer();
    const other = await freshCustomer();
    const admin = await as('admin');
    const up = await owner.upload('private');
    assert.equal(up.status, 201);
    assert.match(up.data.url, /^\/api\/files\/private\//);
    const key = up.data.key;
    assert.equal((await owner.get('/files/private/' + key)).status, 200);
    assert.equal((await admin.get('/files/private/' + key)).status, 200);
    assert.equal((await other.get('/files/private/' + key)).status, 403);
    assert.equal((await guest.get('/files/private/' + key)).status, 401);
    assert.equal((await owner.get('/files/private/..%2F..%2Fpackage.json')).status, 404, 'no path traversal');
  });
});

describe('csrf', () => {
  it('rejects state-changing requests without the double-submit token', async () => {
    const bare = client({ csrf: false });
    const r = await bare.post('/auth/login', { identifier: 'customer@otd.test', password: 'Customer123!' });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'CSRF');
    assert.match(r.headers.get('set-cookie') ?? '', /otd_csrf=[a-f0-9]{64}/, 'hands out a token to retry with');
  });

  it('rejects a token that does not match the cookie', async () => {
    const c = await as('customer');
    const r = await c.post('/cart/price', { items: [] }, { headers: { 'x-csrf-token': 'f'.repeat(64) } });
    assert.equal(r.status, 403);
  });

  it('accepts the matching token, and GETs never need one', async () => {
    const c = await as('customer');
    assert.ok((await c.post('/cart/price', { items: [] })).status < 400);
    const bare = client({ csrf: false });
    assert.equal((await bare.get('/products?limit=1')).status, 200);
  });

  it('serves the token at /auth/csrf, readable by page scripts', async () => {
    const c = client({ csrf: false });
    const r = await c.get('/auth/csrf');
    assert.equal(r.status, 200);
    assert.match(r.data.token, /^[a-f0-9]{64}$/);
    assert.equal(c.jar.get('otd_csrf'), r.data.token);
    assert.doesNotMatch(r.headers.get('set-cookie'), /httponly/i);
  });
});
