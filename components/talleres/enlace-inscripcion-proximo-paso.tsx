'use client'

/**
 * T2 (odd/tasks/proximo-paso.md, S3) — "Enlace de inscripción" of the
 * Próximo Paso taller page: the public URL the announcement's QR points at
 * (/proximo-paso), a copy button and the QR itself as a downloadable SVG
 * (qrcode through lib/platform/ninos/cartel.ts, the Niños poster's helpers).
 * The base URL is NEXT_PUBLIC_SITE_URL, else the page's own origin, read
 * only in the browser so the server render never guesses it.
 */

import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Copy, Download } from 'lucide-react'

import { BotonSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { qrSvg, urlBaseCartel } from '@/lib/platform/ninos/cartel'
import { RUTA_PROXIMO_PASO } from '@/lib/platform/talleres/proximo-paso-registro'

type EstadoCopia = 'listo' | 'copiado' | 'fallo'

const sinSuscripcion = () => () => undefined

/** The public URL in the browser, null while rendering on the server. */
function useUrlPublica(): string | null {
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null)
  if (origen === null) return null
  return `${urlBaseCartel({ NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }, origen)}${RUTA_PROXIMO_PASO}`
}

export function EnlaceInscripcionProximoPaso(): ReactElement {
  const url = useUrlPublica()
  const [qr, setQr] = useState<string | null>(null)
  const [copia, setCopia] = useState<EstadoCopia>('listo')

  useEffect(() => {
    if (!url) return
    const enlace = url
    let vigente = true
    qrSvg(enlace).then(
      (svg) => {
        if (vigente) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      },
      () => undefined,
    )
    return () => {
      vigente = false
    }
  }, [url])

  async function copiar() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopia('copiado')
    } catch {
      setCopia('fallo')
    }
  }

  return (
    <section aria-labelledby="enlace-inscripcion-heading" className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="grid gap-1">
        <TituloSistema nivel={3} id="enlace-inscripcion-heading">
          Enlace de inscripción
        </TituloSistema>
        <TextoSistema variante="sutil" tamaño="sm">
          Ponlo en el anuncio: quien lo abre crea su cuenta y elige el mes en que empieza.
        </TextoSistema>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 gap-3">
          <p className="break-all font-mono text-sm text-foreground">{url ?? ' '}</p>
          <div className="flex flex-wrap gap-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={Copy} onClick={copiar} disabled={!url}>
              Copiar enlace
            </BotonSistema>
            {qr && (
              <BotonSistema asChild variante="outline" tamaño="sm" icono={Download}>
                <a href={qr} download="proximo-paso-qr.svg">
                  Descargar QR
                </a>
              </BotonSistema>
            )}
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
            {copia === 'copiado' ? 'Enlace copiado' : copia === 'fallo' ? 'No se pudo copiar. Selecciona el enlace y cópialo.' : ''}
          </p>
        </div>
        {qr && url && (
          // eslint-disable-next-line @next/next/no-img-element -- a data: SVG, nothing to optimize
          <img src={qr} alt={`Código QR de ${url}`} width={144} height={144} className="size-36 rounded-xl border border-border bg-background p-2" />
        )}
      </div>
    </section>
  )
}
