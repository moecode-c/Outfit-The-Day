// Production-mode smoke test for the built API (dist/main.js). Run from apps/api:
//
//   PROD_MONGODB_URI=mongodb://otd-mongo:27017/otd_prod_smoke node test/prod-smoke.mjs
//
// 1. With a weak config (localhost DB, short JWT secrets, http origin) the API must refuse to boot.
// 2. With a valid production config it must boot and:
//    - answer /api/health, send helmet security headers (incl. HSTS)
//    - allow CORS only for WEB_ORIGIN
//    - set Secure + HttpOnly auth cookies
//    - keep rate limiting ON even when THROTTLE_DISABLED=true
//
// PROD_MONGODB_URI must not contain "localhost"/"127.0.0.1" (production rejects those); in CI a
// hosts entry maps "otd-mongo" to the local MongoDB service. The database must be seeded.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const MONGO = process.env.PROD_MONGODB_URI;
if (!MONGO) throw new Error('PROD_MONGODB_URI is not set');
const PORT = process.env.PROD_PORT ?? '4291';
const BASE = `http://127.0.0.1:${PORT}/api`;
const ORIGIN = 'https://otd.example';

/** Env with nothing inherited from the CI job that could weaken the test. */
function env(extra) {
  const { PATH, HOME, SystemRoot, TEMP, TMP } = process.env;
  return { PATH, HOME, SystemRoot, TEMP, TMP, NODE_ENV: 'production', PORT, ...extra };
}

const portBusy = await fetch(`http://127.0.0.1:${PORT}/`).then(
  () => true,
  () => false,
);
if (portBusy) throw new Error(`Port ${PORT} is already in use; set PROD_PORT to a free port`);

function start(extra) {
  const child = spawn(process.execPath, ['dist/main.js'], { env: env(extra), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, exited, output: () => out };
}

async function waitHealthy(proc, ms = 60_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) throw new Error(`API exited (${proc.child.exitCode}):\n${proc.output()}`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API not healthy after ${ms}ms:\n${proc.output()}`);
}

test('refuses to boot production with a weak configuration', async () => {
  const proc = start({
    MONGODB_URI: 'mongodb://localhost:27017/otd_prod_smoke',
    JWT_ACCESS_SECRET: 'change-me',
    JWT_REFRESH_SECRET: 'change-me',
    WEB_ORIGIN: 'http://insecure.example',
  });
  const timer = setTimeout(() => proc.child.kill(), 30_000);
  const code = await proc.exited;
  clearTimeout(timer);
  assert.notEqual(code, 0, 'API must exit with an error');
  assert.match(proc.output(), /Invalid production configuration/);
  for (const msg of ['localhost', 'JWT_ACCESS_SECRET', 'must be different', 'WEB_ORIGIN', 'R2_BUCKET']) {
    assert.ok(proc.output().includes(msg), `error output mentions ${msg}`);
  }
});

test('boots with a valid production configuration', async (t) => {
  const proc = start({
    MONGODB_URI: MONGO,
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    WEB_ORIGIN: ORIGIN,
    ALLOW_DISK_UPLOADS: 'true',
    UPLOAD_DIR: './uploads-prod-smoke',
    THROTTLE_DISABLED: 'true', // must be ignored in production
  });
  t.after(() => proc.child.kill());
  await waitHealthy(proc);

  await t.test('health + security headers', async () => {
    const r = await fetch(`${BASE}/health`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('content-security-policy'), 'CSP header');
    assert.equal(r.headers.get('x-powered-by'), null, 'no x-powered-by');
  });

  await t.test('CORS only for WEB_ORIGIN', async () => {
    const ok = await fetch(`${BASE}/health`, { headers: { origin: ORIGIN } });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    const evil = await fetch(`${BASE}/health`, { headers: { origin: 'https://evil.example' } });
    assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example');
  });

  // One shared cookie jar for the CSRF token.
  const csrfRes = await fetch(`${BASE}/auth/csrf`);
  const csrfCookie = csrfRes.headers.getSetCookie().find((c) => c.startsWith('otd_csrf='));
  const { token } = await csrfRes.json();
  const headers = { 'content-type': 'application/json', 'x-csrf-token': token, cookie: csrfCookie.split(';')[0] };
  const login = (password) =>
    fetch(`${BASE}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ identifier: 'customer@otd.test', password }) });

  await t.test('CSRF cookie is Secure', () => {
    assert.match(csrfCookie, /;\s*Secure/i);
  });

  await t.test('auth cookies are Secure + HttpOnly', async () => {
    const r = await login('Customer123!');
    assert.equal(r.status, 200, await r.clone().text());
    const cookies = r.headers.getSetCookie();
    assert.ok(cookies.length >= 1, 'sets auth cookies');
    for (const c of cookies) {
      assert.match(c, /;\s*Secure/i, `Secure: ${c.split('=')[0]}`);
      assert.match(c, /;\s*HttpOnly/i, `HttpOnly: ${c.split('=')[0]}`);
      assert.match(c, /;\s*SameSite=Lax/i, `SameSite: ${c.split('=')[0]}`);
    }
  });

  await t.test('rate limiting stays on despite THROTTLE_DISABLED=true', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await login('wrong-password')).status);
    assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(',')}`);
  });
});
