import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Auth cookies are necessarily `httpOnly: false` (see supabase/server.ts —
// the client SDK needs to read the session from JS), which is what makes a
// missing CSP consequential rather than cosmetic: any future XSS would be a
// full, portable account takeover via document.cookie, not just a session
// bug. `next/font/google` self-hosts at build time and @vercel/analytics /
// @vercel/speed-insights inject from same-origin `/_vercel/*`, so this
// starting policy needs no third-party script/style origins. Shipped
// report-only first — flip to enforcing once a real session in Chrome and
// Safari reports no violations.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

const nextConfig: NextConfig = {
  experimental: {
    // Detects lost connectivity and retries blocked navigations/prefetches/
    // Server Actions once the network returns; also exposes the
    // `useOffline` hook (from `next/offline`) for connectivity-aware UI.
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
