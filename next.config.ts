import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Detects lost connectivity and retries blocked navigations/prefetches/
    // Server Actions once the network returns; also exposes the
    // `useOffline` hook (from `next/offline`) for connectivity-aware UI.
    useOffline: true,
  },
};

export default nextConfig;
