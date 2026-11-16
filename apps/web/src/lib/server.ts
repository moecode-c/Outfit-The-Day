import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:4000';

/** Server-side fetch to the API (forwards the user's cookies so owners/admins can preview). */
export async function sapi<T = any>(path: string, opts: { revalidate?: number; auth?: boolean } = {}): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    if (opts.auth) headers.cookie = (await cookies()).toString();
    const res = await fetch(`${API}/api${path}`, {
      headers,
      ...(opts.auth ? { cache: 'no-store' } : { next: { revalidate: opts.revalidate ?? 30 } }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const qs = (params: Record<string, any>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};
