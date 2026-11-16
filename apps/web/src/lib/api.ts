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

let refreshing: Promise<boolean> | null = null;
const refresh = () =>
  (refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0)));

/** Browser → Next (same origin) → API. Retries once after refreshing an expired access token. */
export async function api<T = any>(path: string, init: RequestInit & { json?: any } = {}, retried = false): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api(path, init, true);
  }
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
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
