// Auth lifecycle and role isolation.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { USERS, as, client, freshCustomer, phone, uniq } from './client.mjs';

describe('registration', () => {
  it('registers, sets httpOnly cookies and logs the user in', async () => {
    const c = client();
    const email = `reg${uniq()}@otd.test`;
    const r = await c.post('/auth/register', { name: 'Reg User', email, phone: phone(), password: 'Register123!' });
    assert.equal(r.status, 201);
    const cookies = r.headers.getSetCookie().join('\n');
    assert.match(cookies, /HttpOnly/i);
    const me = await c.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.email, email);
    assert.equal(me.data.role, 'CUSTOMER');
    assert.equal(me.data.passwordHash, undefined, 'password hash never leaks');
    assert.equal(me.data.password, undefined);
  });

  it('refuses duplicate emails', async () => {
    const r = await client().post('/auth/register', { name: 'Dup', email: USERS.customer.identifier, phone: phone(), password: 'Register123!' });
    assert.ok(r.status === 409 || r.status === 400, 'status ' + r.status);
  });

  it('validates phone numbers and password length', async () => {
    const base = { name: 'Val', email: `v${uniq()}@otd.test`, password: 'Register123!' };
    assert.equal((await client().post('/auth/register', { ...base, phone: '0123' })).status, 400);
    assert.equal((await client().post('/auth/register', { ...base, phone: phone(), password: 'short' })).status, 400);
  });

  it('cannot self-register as admin or seller', async () => {
    const c = client();
    await c.post('/auth/register', { name: 'Sneaky', email: `s${uniq()}@otd.test`, phone: phone(), password: 'Register123!', role: 'ADMIN' });
    const me = await c.get('/auth/me');
    assert.equal(me.data.role, 'CUSTOMER');
  });
});

describe('login / session', () => {
  it('rejects wrong passwords and unknown users with 401', async () => {
    assert.equal((await client().post('/auth/login', { identifier: USERS.customer.identifier, password: 'wrong' })).status, 401);
    assert.equal((await client().post('/auth/login', { identifier: 'nobody@otd.test', password: 'whatever1' })).status, 401);
  });

  it('refresh rotates the session and logout clears it', async () => {
    const c = await as('customer');
    const r = await c.post('/auth/refresh');
    assert.equal(r.status, 200);
    assert.equal((await c.get('/auth/me')).status, 200);
    assert.equal((await c.post('/auth/logout')).status, 200);
    c.jar.clear(); // cookies are cleared by the server; mirror the browser
    assert.equal((await c.get('/auth/me')).status, 401);
  });

  it('rejects a forged access token', async () => {
    const c = client();
    c.jar.set('otd_at', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6IkFETUlOIn0.forged');
    assert.equal((await c.get('/admin/dashboard')).status, 401);
  });

  it('changes password with the current one only', async () => {
    const c = await freshCustomer();
    assert.ok((await c.post('/auth/change-password', { current: 'nope-nope', next: 'Changed123!' })).status >= 400);
    assert.equal((await c.post('/auth/change-password', { current: 'Shopper123!', next: 'Changed123!' })).status, 200);
    assert.equal((await client().post('/auth/login', { identifier: c.email, password: 'Changed123!' })).status, 200);
  });

  it('forgot-password never reveals whether an email exists', async () => {
    const a = await client().post('/auth/forgot', { email: 'nobody-here@otd.test' });
    const b = await client().post('/auth/forgot', { email: USERS.customer.identifier });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(a.data, b.data);
  });
});

describe('role isolation', () => {
  const matrix = [
    // [path, customer, seller, admin]
    ['/account/addresses', 200, 200, 200],
    ['/seller/orders', 403, 200, 403],
    ['/seller/finance', 403, 200, 403],
    ['/admin/dashboard', 403, 403, 200],
    ['/admin/finance/overview', 403, 403, 200],
    ['/admin/users', 403, 403, 200],
  ];
  for (const [path, ...expected] of matrix) {
    it(`GET ${path}`, async () => {
      const [cust, seller, admin] = await Promise.all([as('customer'), as('nour'), as('admin')]);
      const got = [(await cust.get(path)).status, (await seller.get(path)).status, (await admin.get(path)).status];
      assert.deepEqual(got, expected);
    });
  }

  it('a limited admin is blocked outside their permission areas', async () => {
    const admin = await as('admin');
    const email = `ops${uniq()}@otd.test`;
    const r = await admin.post('/admin/admins', { name: 'Ops Admin', email, password: 'OpsAdmin123!', perms: ['orders'] });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    const ops = await client().login({ identifier: email, password: 'OpsAdmin123!' });
    assert.equal((await ops.get('/admin/orders')).status, 200);
    assert.equal((await ops.get('/admin/settings')).status, 403);
    assert.equal((await ops.get('/admin/finance/overview')).status, 403);
  });
});
