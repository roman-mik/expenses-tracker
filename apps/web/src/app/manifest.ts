import type { MetadataRoute } from 'next';
import { color } from '@kapa/ui';

/**
 * Web app manifest — makes Pocket installable to a phone home screen.
 * No `orientation` lock: the home/history/cap screens are responsive
 * (see the wide "web overview" layout), so a portrait lock would fight
 * tablet and desktop installs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pocket — one cap, every expense in two taps',
    short_name: 'Pocket',
    description:
      "A warm monthly spending-cap tracker. Always know what's left.",
    start_url: '/pocket',
    display: 'standalone',
    background_color: color.bg,
    theme_color: color.accent,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
