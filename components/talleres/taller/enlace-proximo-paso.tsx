'use client'

/**
 * R3k (odd/tasks/talleres-rediseno.md, S1, L10) — Próximo Paso's registration
 * link inside the taller page's «Página pública» card (it left the
 * configuration form): one short line, the /proximo-paso URL (mono, truncated)
 * and two small actions, «Copiar enlace» and «Ver QR». The QR opens in a
 * DetalleResponsivo with «Descargar imagen».
 *
 * Same URL and QR as EnlaceInscripcionProximoPaso (odd/tasks/proximo-paso.md
 * T2): NEXT_PUBLIC_SITE_URL, else the page's own origin, read only in the
 * browser (urlBaseCartel), and the Niños poster's qrSvg. It is a public link,
 * so whoever sees the taller page gets it.
 */

import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Copy, Download, QrCode } from 'lucide-react'

import { BotonSistema, SkeletonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { qrSvg, urlBaseCartel } from '@/lib/platform/ninos/cartel'
import { RUTA_PROXIMO_PASO } from '@/lib/platform/talleres/proximo-paso-registro'

type EstadoCopia = 'listo' | 'copiado' | 'fallo'

const sinSuscripcion = () => () => undefined

/** The public URL in the browser, null while rendering on the server. */
function useUrlProximoPaso(): string | null {
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null)
  if (origen === null) return null
  return `${urlBaseCartel({ NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }, origen)}${RUTA_PROXIMO_PASO}`
}

export function EnlaceProximoPaso(): ReactElement {
  const url = useUrlProximoPaso()
  const [copia, setCopia] = useState<EstadoCopia>('listo')
  const [qrAbierto, setQrAbierto] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  // The QR is built only once someone asks for it.
  useEffect(() => {
    if (!qrAbierto || !url || qr) return
    let vigente = true
    qrSvg(url).then(
      (svg) => {
        if (vigente) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      },
      () => undefined,
    )
    return () => {
      vigente = false
    }
  }, [qrAbierto, url, qr])

  async function copiar(): Promise<void> {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopia('copiado')
    } catch {
      setCopia('fallo')
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <TextoSistema variante="sutil" tamaño="sm" className="block">
        Se inscriben con este enlace
      </TextoSistema>
      <span className="truncate font-mono text-[13px] text-foreground" title={url ?? undefined}>
        {url ?? ' '}
      </span>
      <div className="flex flex-wrap gap-2">
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Copy} onClick={copiar} disabled={!url}>
          Copiar enlace
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={QrCode}
          onClick={() => setQrAbierto(true)}
          disabled={!url}
          aria-haspopup="dialog"
        >
          Ver QR
        </BotonSistema>
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
        {copia === 'copiado' ? 'Enlace copiado' : copia === 'fallo' ? 'No se pudo copiar. Selecciona el enlace y cópialo.' : ''}
      </p>

      <DetalleResponsivo
        abierto={qrAbierto}
        onCambioAbierto={setQrAbierto}
        titulo="Código QR de Próximo Paso"
        descripcion="Ponlo en el anuncio: quien lo escanea crea su cuenta y elige el mes en que empieza."
        pie={
          qr ? (
            <BotonSistema asChild variante="primario" icono={Download}>
              <a href={qr} download="proximo-paso-qr.svg">
                Descargar imagen
              </a>
            </BotonSistema>
          ) : undefined
        }
      >
        <div className="grid justify-items-center gap-3 py-2">
          {qr && url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: SVG, nothing to optimize
            <img
              src={qr}
              alt={`Código QR de ${url}`}
              width={224}
              height={224}
              className="size-56 rounded-xl border border-border bg-background p-3"
            />
          ) : (
            <SkeletonSistema ancho="14rem" alto="14rem" className="rounded-xl" />
          )}
          <span className="max-w-full break-all text-center font-mono text-[13px] text-muted-foreground">{url}</span>
        </div>
      </DetalleResponsivo>
    </div>
  )
}
