import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth';

/**
 * Double-submit CSRF protection.
 *
 * Every response without a valid token cookie gets a fresh random `otd_csrf` cookie (readable by
 * page scripts, SameSite=Lax). State-changing requests (POST/PUT/PATCH/DELETE) must echo it in the
 * `x-csrf-token` header. Another site can make the browser send the cookie but cannot read it,
 * so it cannot produce a matching header.
 *
 * Requests that authenticate with an Authorization header and carry no session cookie are exempt:
 * a browser never attaches that header on its own, so they cannot be forged cross-site.
 */
export const CSRF_COOKIE = 'otd_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN = /^[a-f0-9]{64}$/;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function csrf() {
  return (req: Request, res: Response, next: NextFunction) => {
    let token: string | undefined = req.cookies?.[CSRF_COOKIE];
    if (!token || !TOKEN.test(token)) {
      token = randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
      // A token minted on this request cannot have been echoed yet.
      req.cookies = { ...req.cookies, [CSRF_COOKIE]: undefined };
    }
    res.locals.csrfToken = token;
    if (SAFE_METHODS.has(req.method)) return next();

    const hasSession = Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
    if (!hasSession && req.headers.authorization) return next();

    const cookie = req.cookies?.[CSRF_COOKIE];
    const sent = req.headers[CSRF_HEADER];
    if (typeof cookie === 'string' && typeof sent === 'string' && same(cookie, sent)) return next();
    res.status(403).json({ statusCode: 403, code: 'CSRF', message: 'Missing or invalid CSRF token. Reload the page and try again.' });
  };
}
