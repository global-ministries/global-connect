'use client'

/**
 * R3a (odd/tasks/talleres-rediseno.md, S7, L3 L5; design/talleres-interior/20
 * and 21 #ya-hizo-pp) — whoever already did Próximo Paso does not see it as a
 * taller; this card asks them to share it instead: «Ya hiciste Próximo Paso ·
 * Compártelo con alguien que todavía no lo ha hecho».
 *
 * «Compartir enlace» opens the system share menu on phones (navigator.share,
 * when there is one) and copies the link everywhere else, with a toast. «Ver
 * código QR» opens the QR in DetalleResponsivo (bottom sheet / side panel),
 * drawn in the browser with the same helper as the Próximo Paso taller page
 * (qrSvg, lib/platform/ninos/cartel.ts), with a download. The link is always
 * the members app: https://miembros.yosoyglobal.org/proximo-paso.
 */

import { Check, Link2, QrCode, Share2 } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'

import { DetalleResponsivo, useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { qrSvg } from '@/lib/platform/ninos/cartel'
import { URL_COMPARTIR_PROXIMO_PASO } from '@/lib/platform/talleres/explorar'

export const MENSAJE_COPIADO = 'Copiamos el enlace de Próximo Paso. Pégalo en un mensaje para quien todavía no lo ha hecho.'
export const MENSAJE_NO_COPIADO = 'No se pudo copiar. Selecciona el enlace y cópialo.'
const TEXTO_COMPARTIR = 'Yo ya hice Próximo Paso en Global. Elige tu fecha aquí:'

/** The link without the scheme, as the card shows it. */
const URL_VISIBLE = URL_COMPARTIR_PROXIMO_PASO.replace(/^https:\/\//, '')

function useCompartir(): () => Promise<void> {
  const escritorio = useEsEscritorio()
  const notificar = useNotificaciones()

  return async function compartir() {
    // Phones with a share sheet use it; desktop copies, as the design says.
    if (escritorio === false && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Próximo Paso', text: TEXTO_COMPARTIR, url: URL_COMPARTIR_PROXIMO_PASO })
      } catch {
        // Closing the share sheet is not an error worth a message.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(URL_COMPARTIR_PROXIMO_PASO)
      notificar.success(MENSAJE_COPIADO)
    } catch {
      notificar.error(MENSAJE_NO_COPIADO)
    }
  }
}

function useQr(activo: boolean): string | null {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (!activo || qr) return
    let vigente = true
    qrSvg(URL_COMPARTIR_PROXIMO_PASO).then(
      (svg) => {
        if (vigente) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      },
      () => undefined,
    )
    return () => {
      vigente = false
    }
  }, [activo, qr])
  return qr
}

export function CompartirProximoPaso(): ReactElement {
  const compartir = useCompartir()
  const [qrAbierto, setQrAbierto] = useState(false)
  const qr = useQr(qrAbierto)

  return (
    <article aria-labelledby="compartir-pp-titulo" className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success-text md:size-11">
          <Check className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-brand-text">Próximo Paso</p>
          <h2 id="compartir-pp-titulo" className="text-[19px] font-semibold leading-tight tracking-tight text-foreground md:text-xl">
            Ya hiciste Próximo Paso
          </h2>
        </div>
      </div>
      <p className="mt-2.5 text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">Compártelo con alguien que todavía no lo ha hecho.</strong> El enlace lleva a
        la página de Próximo Paso, con las próximas fechas.
      </p>
      <p className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 font-mono text-[13px] text-foreground">
        <Link2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{URL_VISIBLE}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <BotonSistema type="button" icono={Share2} onClick={() => void compartir()}>
          Compartir enlace
        </BotonSistema>
        <BotonSistema type="button" variante="outline" icono={QrCode} aria-haspopup="dialog" onClick={() => setQrAbierto(true)}>
          Ver código QR
        </BotonSistema>
      </div>

      <DetalleResponsivo
        abierto={qrAbierto}
        onCambioAbierto={setQrAbierto}
        titulo="Código QR de Próximo Paso"
        descripcion="Para mostrarlo en pantalla o imprimirlo"
        pie={
          <>
            {qr ? (
              <BotonSistema asChild variante="outline">
                <a href={qr} download="proximo-paso-qr.svg">
                  Descargar imagen
                </a>
              </BotonSistema>
            ) : (
              <BotonSistema type="button" variante="outline" disabled>
                Descargar imagen
              </BotonSistema>
            )}
            <BotonSistema type="button" onClick={() => void compartir()}>
              Compartir enlace
            </BotonSistema>
          </>
        }
      >
        <div className="grid justify-items-center gap-3 py-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: SVG, nothing to optimize
            <img
              src={qr}
              alt={`Código QR de ${URL_COMPARTIR_PROXIMO_PASO}`}
              width={240}
              height={240}
              className="size-52 rounded-xl border border-border bg-background p-3 md:size-60"
            />
          ) : (
            <span role="status" className="grid size-52 place-items-center rounded-xl border border-border text-sm text-muted-foreground md:size-60">
              Preparando el código…
            </span>
          )}
          <p className="max-w-[340px] text-center text-sm text-muted-foreground">
            Que lo escaneen con la cámara de su celular. Abre <span className="font-mono">{URL_VISIBLE}</span>, con las próximas fechas.
          </p>
        </div>
      </DetalleResponsivo>
    </article>
  )
}
