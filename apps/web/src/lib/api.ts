'use client';

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(
      Array.isArray(data?.errors) && data.errors.length
        ? data.errors.map((e: any) => (e.path ? `${e.path}: ${e.message}` : e.message)).join(' · ')
        : typeof data?.message === 'string'
          ? data.message
          : `Request failed (${status})`,
    );
  }
}

/* ── CSRF: echo the otd_csrf cookie in a header on every state-changing request ── */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const readCsrf = () => (typeof document === 'undefined' ? null : document.cookie.match(/(?:^|;s*)otd_csrf=([a-f0-9]{64})/)?.[1] ?? null);
let fetchingCsrf: Promise<string | null> | null = null;
/** The current token; fetches one (which also sets the cookie) when the browser has none yet. */
async function csrfToken(force = false): Promise<string | null> {
  const t = force ? null : readCsrf();
  if (t) return t;
  fetchingCsrf ??= fetch('/api/auth/csrf', { credentials: 'include', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => readCsrf() ?? d?.token ?? null)
    .catch(() => null)
    .finally(() => setTimeout(() => (fetchingCsrf = null), 0));
  return fetchingCsrf;
}
const csrfHeaders = async (method = 'GET', force = false): Promise<Record<string, string>> => {
  if (SAFE.has(method.toUpperCase())) return {};
  const t = await csrfToken(force);
  return t ? { 'x-csrf-token': t } : {};
};

let refreshing: Promise<boolean> | null = null;
const refresh = () =>
  (refreshing ??= csrfHeaders('POST')
    .then((headers) => fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers }))
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0)));

/** Browser → Next (same origin) → API. Retries once after refreshing an expired access token. */
export async function api<T = any>(path: string, init: RequestInit & { json?: any } = {}, retried = false, csrfRetried = false): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(await csrfHeaders(rest.method, csrfRetried)), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api(path, init, true, csrfRetried);
  }
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  // Token missing or rotated (e.g. cookies cleared in another tab): get a fresh one and retry once.
  if (res.status === 403 && data?.code === 'CSRF' && !csrfRetried) return api(path, init, retried, true);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const post = <T = any>(path: string, json?: any) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T = any>(path: string, json?: any) => api<T>(path, { method: 'PUT', json });
export const patch = <T = any>(path: string, json?: any) => api<T>(path, { method: 'PATCH', json });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export async function upload(file: File, visibility: 'public' | 'private' = 'public'): Promise<{ key: string; url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return api(`/files?visibility=${visibility}`, { method: 'POST', body: fd });
}
