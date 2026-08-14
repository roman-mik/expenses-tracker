import type { MetadataRoute } from 'next';

/**
 * Web app manifest — makes Kapa installable to a phone home screen.
 * No `orientation` lock: the home/history/cap screens are responsive
 * (see the wide "web overview" layout), so a portrait lock would fight
 * tablet and desktop installs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kapa — one cap, every expense in two taps',
    short_name: 'Kapa',
    description:
      "A warm monthly spending-cap tracker. Always know what's left.",
    start_url: '/',
    display: 'standalone',
    background_color: '#f5ead8',
    theme_color: '#c67139',
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
