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

/** Waits for the newest outbox email to `to` with a reset link (emails are sent in the background). */
async function resetLinkFor(to, admin) {
  for (let i = 0; i < 40; i++) {
    const r = await admin.get('/admin/outbox');
    const mail = r.data.find((m) => m.to === to && /reset\?token=/.test(m.html));
    if (mail) return { mail, token: mail.html.match(/reset\?token=([a-f0-9]+)/)[1], count: r.data.filter((m) => m.to === to && /reset\?token=/.test(m.html)).length };
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('no reset email for ' + to);
}

describe('password reset', () => {
  it('emails a link that resets the password once, signs out everywhere and verifies the email', async () => {
    const c = await freshCustomer();
    const admin = await as('admin');
    assert.equal((await client().post('/auth/forgot', { email: `  ${c.email.toUpperCase()}  ` })).status, 200);
    const { mail, token } = await resetLinkFor(c.email, admin);
    assert.match(mail.subject, /Reset your password/);
    assert.match(mail.html, /\/en\/reset\?token=/);

    assert.deepEqual((await client().post('/auth/reset/check', { token })).data, { valid: true });
    assert.equal((await client().post('/auth/reset', { token, password: 'short' })).status, 400, 'password rules apply');
    assert.equal((await client().post('/auth/reset', { token, password: 'BrandNew123!' })).status, 200);

    assert.deepEqual((await client().post('/auth/reset/check', { token })).data, { valid: false }, 'link is single-use');
    assert.equal((await client().post('/auth/reset', { token, password: 'Another123!' })).status, 400);

    assert.equal((await client().post('/auth/login', { identifier: c.email, password: 'Shopper123!' })).status, 401, 'old password stops working');
    const fresh = await client().login({ identifier: c.email, password: 'BrandNew123!' });
    assert.ok((await fresh.get('/auth/me')).data.emailVerifiedAt, 'email counts as verified');

    c.jar.delete('otd_at'); // the old session's refresh token was revoked
    assert.equal((await c.post('/auth/refresh')).status, 401);
  });

  it('rejects unknown, malformed and expired-looking tokens', async () => {
    assert.deepEqual((await client().post('/auth/reset/check', { token: 'a'.repeat(48) })).data, { valid: false });
    assert.deepEqual((await client().post('/auth/reset/check', { token: 'not-a-token' })).data, { valid: false });
    assert.equal((await client().post('/auth/reset', { token: 'a'.repeat(48), password: 'Whatever123!' })).status, 400);
    assert.equal((await client().post('/auth/reset', { token: '../../etc', password: 'Whatever123!' })).status, 400);
  });

  it('sends at most one email per minute to the same account', async () => {
    const c = await freshCustomer();
    const admin = await as('admin');
    await client().post('/auth/forgot', { email: c.email });
    const first = await resetLinkFor(c.email, admin);
    await client().post('/auth/forgot', { email: c.email });
    await new Promise((res) => setTimeout(res, 400));
    const again = await resetLinkFor(c.email, admin);
    assert.equal(again.count, 1);
    assert.equal(again.token, first.token, 'the first link keeps working');
  });

  it('validates the email field', async () => {
    assert.equal((await client().post('/auth/forgot', { email: 'not-an-email' })).status, 400);
    assert.equal((await client().post('/auth/forgot', {})).status, 400);
  });
});

describe('session revocation', () => {
  it('logout revokes the refresh token on the server', async () => {
    const c = await freshCustomer();
    const stolen = c.jar.get('otd_rt');
    assert.equal((await c.post('/auth/logout')).status, 200);
    const thief = client();
    thief.jar.set('otd_rt', stolen);
    assert.equal((await thief.post('/auth/refresh')).status, 401);
  });

  it('changing the password signs out other devices but keeps this one', async () => {
    const c = await freshCustomer();
    const other = await client().login({ identifier: c.email, password: 'Shopper123!' });
    assert.equal((await c.post('/auth/change-password', { current: 'Shopper123!', next: 'Changed456!' })).status, 200);
    assert.equal((await c.post('/auth/refresh')).status, 200, 'this device stays signed in');
    other.jar.delete('otd_at');
    assert.equal((await other.post('/auth/refresh')).status, 401, 'the other device is signed out');
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
