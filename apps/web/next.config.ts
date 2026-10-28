import type { NextConfig } from 'next';
const config: NextConfig = { distDir: process.env.NEXT_DIST_DIR || '.next', poweredByHeader: false, reactStrictMode: true, async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_URL || 'http://127.0.0.1:4010'}/:path*` }]; }, async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; } };
export default config;
