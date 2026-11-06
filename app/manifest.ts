import type { MetadataRoute } from 'next'

/**
 * The PWA manifest (/manifest.webmanifest). Installable on Android/Chrome:
 * standalone display, local PNG icons 192/512 for "any" and "maskable" (the
 * maskable ones keep the logo inside the safe zone on an opaque background).
 * iOS reads app/layout.tsx (apple-touch-icon, appleWebApp) instead.
 * The middleware lets this file and /icons/ through without a session.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Global Connect',
    short_name: 'Global',
    description: 'Sistema para los miembros de Global Barquisimeto.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAFAF8',
    theme_color: '#FAFAF8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
