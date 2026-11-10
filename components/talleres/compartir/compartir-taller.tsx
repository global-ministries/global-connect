'use client'

/**
 * "Compartir" of one taller (T6 of odd/tasks/talleres-reserva-publica.md,
 * S2 S18; design/talleres-reserva/08): the public link with its QR, the
 * snippet for public/embed.js (button with a window, inline card or the
 * whole catalog; every open edición or one) and a live preview that loads
 * the same embedded page a church site would. No allowed-sites list: the
 * snippet works on any site.
 */
import { useEffect, useRef, useState } from 'react'
import { Copy, Download, ExternalLink, Info, Link2, MonitorSmartphone } from 'lucide-react'

import { useNotificaciones } from '@/hooks/use-notificaciones'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, InputSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { MENSAJE_ALTO } from '@/components/talleres/reserva/modo-incrustado'
import { cn } from '@/lib/utils'

import { codigoIncrustar, DESCRIPCION_MODO, urlPublica, urlVistaPrevia, type ModoIncrustar } from './codigo-incrustar'

export interface EdicionCompartir {
  readonly id: string
  readonly nombre: string
}

export interface CompartirTallerProps {
  readonly base: string
  readonly slug: string
  readonly nombre: string
  /** talleres.publico: only public talleres open at /talleres/reservar. */
  readonly publico: boolean
  /** Ediciones with inscriptions open. */
  readonly ediciones: readonly EdicionCompartir[]
}

const MODOS = [
  { valor: 'modal', etiqueta: 'Botón con ventana' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta incrustada' },
  { valor: 'catalogo', etiqueta: 'Solo el catálogo' },
] as const

const DISPOSITIVOS = [
  { valor: 'escritorio', etiqueta: 'Escritorio' },
  { valor: 'celular', etiqueta: 'Celular' },
] as const

const PEGA_ESTO: Record<ModoIncrustar, string> = {
  modal: 'Pega esto donde quieras el botón',
  tarjeta: 'Pega esto donde quieras la tarjeta',
  catalogo: 'Pega esto donde quieras el catálogo',
}

const TODAS = 'todas'

function Encabezado({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <h2 id={id} className="text-base font-semibold text-foreground">
        {titulo}
      </h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function descargar(nombreArchivo: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = nombreArchivo
  a.click()
}

export function CompartirTaller({ base, slug, nombre, publico, ediciones }: CompartirTallerProps) {
  const notificar = useNotificaciones()
  const [modo, setModo] = useState<ModoIncrustar>('modal')
  const [edicion, setEdicion] = useState<string>(TODAS)
  const [dispositivo, setDispositivo] = useState<'escritorio' | 'celular'>('escritorio')
  const [qr, setQr] = useState<string | null>(null)
  const enlace = urlPublica(base, slug)
  const fijada = modo !== 'catalogo' && edicion !== TODAS ? edicion : null
  const codigo = codigoIncrustar({ base, slug, nombre, modo, edicion: fijada })

  useEffect(() => {
    let vigente = true
    import('qrcode')
      .then((QR) => QR.toString(enlace, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }))
      .then((svg) => vigente && setQr(svg))
      .catch(() => vigente && setQr(null))
    return () => {
      vigente = false
    }
  }, [enlace])

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto)
      notificar.success(aviso)
    } catch {
      notificar.error('No pudimos copiar. Selecciónalo y cópialo a mano.')
    }
  }

  async function descargarPng() {
    try {
      const QR = await import('qrcode')
      descargar(`qr-${slug}.png`, await QR.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 2, width: 1024 }))
    } catch {
      notificar.error('No pudimos generar el PNG')
    }
  }

  function descargarSvg() {
    if (!qr) return
    const url = URL.createObjectURL(new Blob([qr], { type: 'image/svg+xml' }))
    descargar(`qr-${slug}.svg`, url)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid min-w-0 gap-6">
      {!publico && (
        <AvisoFormulario tono="marca" role="status">
          <b className="font-semibold">Este taller no aparece en la página pública todavía.</b> El enlace y el código funcionan en cuanto lo publiques.
        </AvisoFormulario>
      )}

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <div className="grid min-w-0 gap-6">
          <TarjetaSistema variante="outlined" role="region" aria-labelledby="compartir-enlace" className="grid gap-4 p-4 sm:p-5">
            <Encabezado id="compartir-enlace" titulo="Enlace público">
              Para WhatsApp, redes y el boletín. Funciona sin cuenta.
            </Encabezado>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <InputSistema readOnly value={enlace} icono={Link2} aria-label="Enlace público" onFocus={(e) => e.currentTarget.select()} />
              </div>
              <BotonSistema type="button" icono={Copy} onClick={() => copiar(enlace, 'Enlace copiado')}>
                Copiar enlace
              </BotonSistema>
            </div>
            <div className="flex min-w-0 items-center gap-4">
              <div
                role="img"
                aria-label={`Código QR del enlace de ${nombre}`}
                className="grid size-28 shrink-0 place-items-center rounded-xl border border-border bg-card p-2 text-foreground [&_svg]:size-full"
              >
                {/* qrcode output: an SVG built in the browser from our own URL. */}
                {qr ? <div className="size-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <span className="size-full rounded-md bg-muted" />}
              </div>
              <div className="grid min-w-0 gap-2">
                <b className="text-sm font-semibold text-foreground">Código QR</b>
                <p className="text-sm text-muted-foreground">Para la pantalla del domingo, flyers y la mesa de Conexión.</p>
                <div className="flex flex-wrap gap-2">
                  <BotonSistema type="button" variante="outline" tamaño="sm" icono={Download} onClick={descargarPng}>
                    PNG
                  </BotonSistema>
                  <BotonSistema type="button" variante="outline" tamaño="sm" icono={Download} onClick={descargarSvg} disabled={!qr}>
                    SVG para imprenta
                  </BotonSistema>
                </div>
              </div>
            </div>
          </TarjetaSistema>

          <TarjetaSistema variante="outlined" role="region" aria-labelledby="compartir-incrustar" className="grid gap-5 p-4 sm:p-5">
            <Encabezado id="compartir-incrustar" titulo="Incrustar en un sitio web">
              Pega el código una vez. Las fechas y los cupos se actualizan solos.
            </Encabezado>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Cómo se ve</span>
              <ControlSegmentado opciones={MODOS} valor={modo} onCambio={setModo} etiqueta="Cómo se ve" className="w-full overflow-x-auto [&>button]:flex-1" />
              <p className="text-[13px] text-muted-foreground">{DESCRIPCION_MODO[modo]}</p>
            </div>

            {modo !== 'catalogo' && (
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-2 text-sm font-medium text-foreground">Qué edición mostrar</legend>
                {[{ id: TODAS, nombre: 'Todas las abiertas' }, ...ediciones].map((e) => {
                  const elegida = edicion === e.id
                  return (
                    <label
                      key={e.id}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
                        elegida ? 'border-brand bg-brand-tint' : 'border-border hover:bg-accent',
                      )}
                    >
                      <input type="radio" name="compartir-edicion" value={e.id} checked={elegida} onChange={() => setEdicion(e.id)} className="sr-only" />
                      <span aria-hidden="true" className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', elegida ? 'border-brand' : 'border-border')}>
                        {elegida && <span className="size-2.5 rounded-full bg-brand" />}
                      </span>
                      <span className="grid min-w-0">
                        <span className="truncate text-sm font-medium text-foreground">{e.nombre}</span>
                        {e.id === TODAS && (
                          <span className="text-[13px] text-muted-foreground">Cuando una cierra, pasa sola a la siguiente. Recomendado.</span>
                        )}
                      </span>
                    </label>
                  )
                })}
                {ediciones.length === 0 && <p className="text-[13px] text-muted-foreground">Aún no hay ediciones con inscripciones abiertas.</p>}
              </fieldset>
            )}

            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{PEGA_ESTO[modo]}</span>
                <BotonSistema type="button" tamaño="sm" icono={Copy} onClick={() => copiar(codigo, 'Código copiado')}>
                  Copiar código
                </BotonSistema>
              </div>
              <pre
                tabIndex={0}
                aria-label="Código para incrustar"
                className="focus-ring max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-muted p-4 font-mono text-[13px] text-foreground"
              >
                {codigo}
              </pre>
            </div>

            <AvisoFormulario tono="info" className="flex gap-2">
              <Info aria-hidden="true" className="size-4 shrink-0 translate-y-0.5 text-info-text" />
              <span>
                <b className="font-semibold">Funciona en cualquier sitio web donde lo pegues.</b> No hay que registrar el sitio: el botón, la tarjeta y el catálogo
                funcionan igual en la página de la iglesia, de una sede o en un blog. Cada solicitud igual pasa por tu aprobación.
              </span>
            </AvisoFormulario>
          </TarjetaSistema>
        </div>

        <TarjetaSistema variante="outlined" role="region" aria-labelledby="compartir-vista" className="grid min-w-0 gap-4 p-4 sm:p-5 xl:sticky xl:top-24">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Encabezado id="compartir-vista" titulo="Vista previa">
              Así se ve dentro de un sitio web.
            </Encabezado>
            <ControlSegmentado opciones={DISPOSITIVOS} valor={dispositivo} onCambio={setDispositivo} etiqueta="Tamaño de la vista previa" />
          </div>
          <VistaPrevia slug={slug} modo={modo} edicion={fijada} celular={dispositivo === 'celular'} publico={publico} enlace={enlace} />
        </TarjetaSistema>
      </div>
    </div>
  )
}

function VistaPrevia({
  slug,
  modo,
  edicion,
  celular,
  publico,
  enlace,
}: {
  slug: string
  modo: ModoIncrustar
  edicion: string | null
  celular: boolean
  publico: boolean
  enlace: string
}) {
  const marco = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(480)
  const src = urlVistaPrevia({ slug, modo, edicion })

  // The card and the catalog grow with their content, as embed.js does.
  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== marco.current?.contentWindow) return
      const datos = e.data as { type?: unknown; height?: unknown } | null
      if (datos?.type === MENSAJE_ALTO && typeof datos.height === 'number') setAlto(Math.min(Math.max(Math.ceil(datos.height), 160), 2000))
    }
    window.addEventListener('message', alMensaje)
    return () => window.removeEventListener('message', alMensaje)
  }, [])

  if (!publico && modo !== 'catalogo') {
    return (
      <div className="rounded-xl border border-dashed border-border">
        <EstadoVacioSistema icono={MonitorSmartphone} titulo="La vista previa aparece cuando el taller sea público" subtitulo="Mientras tanto el enlace muestra «Taller no disponible»." />
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-xl bg-muted p-3 sm:p-4">
      {modo === 'modal' && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
          {celular ? (
            <span>
              En celular el botón abre la inscripción en una pestaña nueva: <span className="break-all">{enlace}</span>
            </span>
          ) : (
            'Al tocar «Reservar mi lugar» se abre esta ventana encima del sitio.'
          )}
        </p>
      )}
      <iframe
        key={src}
        ref={marco}
        src={src}
        title={`Vista previa: ${MODOS.find((m) => m.valor === modo)?.etiqueta ?? ''}`}
        className={cn('mx-auto block w-full rounded-xl border-0', celular && 'max-w-[390px]', modo === 'modal' && 'shadow-sheet')}
        style={{ height: modo === 'modal' ? 640 : alto }}
      />
    </div>
  )
}
