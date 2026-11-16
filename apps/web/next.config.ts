import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const API = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Lets the test build live beside a running dev server (.next) without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@otd/shared'],
  // The browser only ever talks to this origin, so auth cookies stay first-party.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API}/uploads/:path*` },
    ];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
