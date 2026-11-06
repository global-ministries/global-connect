'use client'

/**
 * Error boundary of the authenticated area. It renders inside
 * app/(auth)/layout.tsx, so the menu stays and only the content is replaced.
 *
 * Why: a dropped connection while a screen asked the server for data
 * (net::ERR_HTTP2_PING_FAILED → "TypeError: network error") reached no
 * boundary and Next.js showed its black "Application error" screen; only a
 * full reload brought the app back. Now the user sees what happened and can
 * retry: "Reintentar" resets the boundary and refetches the server data
 * (router.refresh), "Recargar página" is the full reload.
 *
 * Built only from canonical components (EstadoVacioSistema, BotonSistema;
 * docs/design-system/components.md).
 */
import * as Sentry from '@sentry/nextjs'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { startTransition, useEffect, type ReactElement } from 'react'

import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { recargarPagina } from '@/lib/navegador/recargar'

interface ErrorAutenticadoProps {
  readonly error: Error & { digest?: string }
  readonly reset: () => void
}

export default function ErrorAutenticado({ error, reset }: ErrorAutenticadoProps): ReactElement {
  const router = useRouter()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  function reintentar(): void {
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <div role="alert" className="flex min-h-[60vh] items-center justify-center">
      <EstadoVacioSistema
        icono={WifiOff}
        titulo="No pudimos cargar esta pantalla"
        subtitulo="Puede ser un problema de conexión. Revisa tu internet e inténtalo de nuevo."
        accion={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <BotonSistema icono={RefreshCw} onClick={reintentar}>
                Reintentar
              </BotonSistema>
              <BotonSistema variante="outline" onClick={recargarPagina}>
                Recargar página
              </BotonSistema>
            </div>
            {error.digest && <p className="font-mono text-xs text-muted-foreground">Código: {error.digest}</p>}
          </div>
        }
      />
    </div>
  )
}
