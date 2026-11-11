'use client'

/**
 * R3k (odd/tasks/talleres-rediseno.md, S1, S4, L10) — the configuration left
 * the taller page for its own view (/talleres/[taller]/configuracion). Links
 * that still carry the old anchor (the catálogo's `#configuracion-heading`,
 * #735) land there: on load, or when the hash changes, the taller page
 * replaces the URL with the configuration view. A hash never reaches the
 * server, so this has to run in the browser. Renders nothing.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ANCLAS_CONFIGURACION = new Set(['#configuracion-heading', '#configuracion'])

export function RedirigirAnclaConfiguracion({ href }: { readonly href: string }): null {
  const router = useRouter()

  useEffect(() => {
    function revisar(): void {
      if (ANCLAS_CONFIGURACION.has(window.location.hash)) router.replace(href)
    }
    revisar()
    window.addEventListener('hashchange', revisar)
    return () => window.removeEventListener('hashchange', revisar)
  }, [href, router])

  return null
}
