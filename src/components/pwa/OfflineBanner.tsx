'use client';

import { useOffline } from 'next/offline';

/**
 * Shown app-wide (mounted in the root layout) whenever `next.config.ts`'s
 * `experimental.useOffline` detects a lost connection. Never a scold —
 * pending expenses, cap changes, and category edits all go through
 * Server Actions, so they quietly retry and land once the network is back.
 */
export function OfflineBanner() {
  const isOffline = useOffline();

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-accent-200 text-accent-700 px-4 py-2 text-center text-sm font-medium"
    >
      You&rsquo;re offline. Anything you add will go through the moment
      you&rsquo;re back.
    </div>
  );
}
