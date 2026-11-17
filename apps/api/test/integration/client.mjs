// Tiny cookie-aware HTTP client for black-box API tests (run against the built API on a seeded DB).
export const API = process.env.API ?? 'http://localhost:4000/api';
export const ORIGIN = API.replace(/\/api$/, '');

// Seeded demo accounts (see src/seed.ts header).
export const USERS = {
  admin: { identifier: 'admin@otd.test', password: 'Admin123!' },
  customer: { identifier: 'customer@otd.test', password: 'Customer123!' },
  nour: { identifier: 'atelier@otd.test', password: 'Seller123!' },
  kemet: { identifier: 'kemet@otd.test', password: 'Seller123!' },
};

export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

let seq = 0;
/** Unique suffix for data created by a test run. */
export const uniq = () => `${Date.now().toString().slice(-6)}${(seq++).toString().padStart(2, '0')}`;
/** Valid unique Egyptian mobile. */
export const phone = () => `015${uniq().slice(-8).padStart(8, '0')}`;

export function client({ csrf = true } = {}) {
  const jar = new Map();
  const call = async (method, path, body, { raw, headers = {} } = {}) => {
    // Like the web app: echo the otd_csrf cookie on state-changing requests (fetch one first if needed).
    if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !jar.has('otd_csrf')) await call('GET', '/auth/csrf');
    const token = csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method) ? { 'x-csrf-token': jar.get('otd_csrf') } : {};
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(path.startsWith('http') ? path : API + path, {
      method,
      redirect: 'manual',
      headers: { ...(cookie ? { cookie } : {}), ...(raw || body === undefined ? {} : { 'content-type': 'application/json' }), ...token, ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    for (const s of r.headers.getSetCookie?.() ?? []) {
      const [kv] = s.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (!v || /expires=Thu, 01 Jan 1970/i.test(s)) jar.delete(k);
      else jar.set(k, v);
    }
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
  };
  const c = {
    jar,
    call,
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b = {}, o) => call('POST', p, b, o),
    put: (p, b = {}, o) => call('PUT', p, b, o),
    patch: (p, b = {}, o) => call('PATCH', p, b, o),
    del: (p, o) => call('DELETE', p, undefined, o),
    /** Returns body, throwing on non-2xx — for setup steps. */
    ok: async (method, p, b) => {
      const r = await call(method, p, b);
      if (r.status >= 300) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(r.data)}`);
      return r.data;
    },
    login: async (u) => {
      const r = await call('POST', '/auth/login', u);
      if (r.status !== 200) throw new Error(`login ${u.identifier} → ${r.status} ${JSON.stringify(r.data)}`);
      return c;
    },
    upload: (visibility = 'private', buf = PNG, type = 'image/png', name = 'proof.png') => {
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type }), name);
      return call('POST', `/files?visibility=${visibility}`, undefined, { raw: fd });
    },
  };
  return c;
}

export const as = async (who) => client().login(USERS[who]);

/** Registers and logs in a fresh customer. */
export async function freshCustomer() {
  const c = client();
  const email = `t${uniq()}@otd.test`;
  const r = await c.post('/auth/register', { name: 'Test Shopper', email, phone: phone(), password: 'Shopper123!' });
  if (r.status >= 300) throw new Error('register → ' + r.status + ' ' + JSON.stringify(r.data));
  return Object.assign(c, { email });
}
