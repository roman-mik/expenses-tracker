'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import { color } from '@kapa/ui';

// Root-layout-level error boundary — catches crashes error.tsx can't (a
// throw in layout.tsx itself, e.g. a font/metadata failure). Must render its
// own <html>/<body> since it replaces the whole tree, root layout included.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    track('error_shown', { digest: error.digest ?? 'none', scope: 'global' });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            display: 'flex',
            minHeight: '100dvh',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '1.5rem',
            maxWidth: '24rem',
            margin: '0 auto',
            padding: '0 1.5rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <header>
            <h1 style={{ fontSize: '2rem', color: color.accent }}>
              Something slipped
            </h1>
            <p style={{ marginTop: '0.5rem', color: color.ink, opacity: 0.7 }}>
              That didn&apos;t go through. It&apos;s on us, not you — give it
              another try.
            </p>
          </header>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                borderRadius: '16px',
                background: color.accent,
                padding: '0.75rem 1rem',
                fontWeight: 500,
                color: 'white',
                border: 'none',
              }}
            >
              Try again
            </button>
          </div>

          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: color.ink, opacity: 0.4 }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
