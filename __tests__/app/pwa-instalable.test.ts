/**
 * Installing the app on a phone. The browser fetches the manifest and the
 * icons without the session cookie, so the middleware must let them through
 * (it used to redirect /manifest.webmanifest to the login: "Manifest: Line 1,
 * column 1, Syntax error"), and the icons must be local PNGs in the sizes
 * Chrome (192/512, maskable) and iOS (180, opaque) ask for.
 */
import fs from 'node:fs'
import path from 'node:path'

import manifest from '@/app/manifest'

const RAIZ = path.resolve(__dirname, '../..')

// The matcher is read from the source: importing middleware.ts pulls the
// Supabase and Sentry clients that only middleware.test.ts mocks.
function matcherDelMiddleware(): RegExp {
  const fuente = fs.readFileSync(path.join(RAIZ, 'middleware.ts'), 'utf-8')
  const patron = /matcher:\s*\[\s*'([^']+)'/.exec(fuente)?.[1]
  if (!patron) throw new Error('matcher not found in middleware.ts')
  // eslint-disable-next-line security/detect-non-literal-regexp -- the pattern is our own middleware matcher
  return new RegExp(`^${patron}$`)
}

function existeEnPublic(ruta: string): boolean {
  return fs.existsSync(path.join(RAIZ, 'public', ruta.replace(/^\//, '')))
}

describe('installable app (PWA)', () => {
  it('the middleware lets the manifest, the icons and the favicon through', () => {
    const matcher = matcherDelMiddleware()
    for (const ruta of [
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/maskable-512.png',
      '/apple-touch-icon.png',
      '/favicon.ico',
    ]) {
      expect({ ruta, pasaPorMiddleware: matcher.test(ruta) }).toEqual({ ruta, pasaPorMiddleware: false })
    }
  })

  it('the middleware still guards the app pages', () => {
    const matcher = matcherDelMiddleware()
    for (const ruta of ['/', '/dashboard', '/dream-team/mi-equipo', '/admin/dream-team/servidores']) {
      expect({ ruta, pasaPorMiddleware: matcher.test(ruta) }).toEqual({ ruta, pasaPorMiddleware: true })
    }
  })

  it('the manifest is installable: standalone, start url, local PNG icons 192/512 for any and maskable', () => {
    const m = manifest()
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
    expect(m.name).toBeTruthy()
    expect(m.short_name).toBeTruthy()
    const iconos = m.icons ?? []
    for (const proposito of ['any', 'maskable'] as const) {
      for (const tam of ['192x192', '512x512']) {
        const icono = iconos.find((i) => i.purpose === proposito && i.sizes === tam)
        expect({ proposito, tam, tipo: icono?.type }).toEqual({ proposito, tam, tipo: 'image/png' })
        expect(existeEnPublic(icono?.src ?? '')).toBe(true)
      }
    }
  })

  it('the favicon and the iOS home-screen icon exist and the layout points iOS at them', () => {
    expect(existeEnPublic('/favicon.ico')).toBe(true)
    expect(existeEnPublic('/apple-touch-icon.png')).toBe(true)
    const layout = fs.readFileSync(path.join(RAIZ, 'app/layout.tsx'), 'utf-8')
    expect(layout).toContain('/apple-touch-icon.png')
    expect(layout).toContain('appleWebApp')
  })
})
