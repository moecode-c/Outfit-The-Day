import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);
// Skip API proxy, Next internals and any path with a file extension.
export const config = { matcher: ['/((?!api|uploads|_next|_vercel|.*\\..*).*)'] };
