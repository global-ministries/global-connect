'use client'

/**
 * Planner — the one-line season header (S21; artboards 01 and 08). Left: the
 * season switcher "Temporada 2026-II ▾" (the h1 of the page; its menu lists
 * every season and, for whoever creates seasons, "Nueva temporada") and the
 * summary "En planificación · 27 grupos · 366 personas". Right: the alerts
 * button "N bloqueos · M avisos" that opens the alerts panel and, for admin,
 * pastor and director general only, the publish button whose label carries
 * the season state (S16): ghost until everything is ready. A director de
 * etapa gets the note of what they see instead (S10). The save bar (S24,
 * estado-guardado.tsx: unsaved changes, Deshacer, Descartar, Guardar) comes
 * first on the right; Historial comes with T8. With unsaved changes,
 * switching season asks first (the draft stays in this browser).
 */
import { useEffect, useId, useRef, useState, type MouseEvent as ClicReact, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { contar, enLista, type BotonPublicar, type SegmentoPlanner, type TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { estadoTemporada, formatearCantidad } from './modelo'

export const RUTA_PLANIFICAR = '/grupos-vida/planificar'

export const hrefTemporada = (id: string): string => `${RUTA_PLANIFICAR}?temporada=${encodeURIComponent(id)}`

export interface CabeceraTemporadaProps {
  readonly temporada: TemporadaPlanner
  readonly temporadas: readonly TemporadaPlanner[]
  /** The director de etapa's segments (S10); empty for whoever sees every segment. */
  readonly segmentosAlcance: readonly SegmentoPlanner[]
  readonly grupos: number
  readonly personas: number
  readonly bloqueos: number
  readonly avisos: number
  readonly onAbrirAlertas: () => void
  readonly alertasAbiertas: boolean
  /** The publish button (S16); null hides it (director de etapa, S12). */
  readonly publicar: BotonPublicar | null
  readonly puedeCrearTemporada: boolean
  /** The save bar (estado-guardado.tsx). */
  readonly guardado?: ReactNode
  /** Unsaved changes of this season (S24): switching season asks first. */
  readonly cambiosSinGuardar?: number
}

function SelectorTemporada({
  temporada,
  temporadas,
  puedeCrearTemporada,
  cambiosSinGuardar = 0,
}: Pick<CabeceraTemporadaProps, 'temporada' | 'temporadas' | 'puedeCrearTemporada' | 'cambiosSinGuardar'>): ReactElement {
  const [abierto, setAbierto] = useState(false)
  /** Leaving the season with unsaved changes asks first; a no keeps the director here. */
  const salir = (e: ClicReact<HTMLAnchorElement>, mismaTemporada: boolean) => {
    if (cambiosSinGuardar > 0 && !mismaTemporada) {
      const pregunta = `Tienes ${contar(cambiosSinGuardar, 'cambio', 'cambios')} sin guardar en ${temporada.nombre}. Quedan en este navegador hasta que los guardes o descartes. ¿Cambiar de temporada?`
      if (!window.confirm(pregunta)) {
        e.preventDefault()
        return
      }
    }
    setAbierto(false)
  }
  const idMenu = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAbierto(false)
      boton.current?.focus()
    }
    document.addEventListener('mousedown', alPulsar)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alPulsar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  return (
    <div ref={contenedor} className="relative">
      <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">
        <button
          ref={boton}
          type="button"
          aria-expanded={abierto}
          aria-controls={idMenu}
          aria-label={`Temporada ${temporada.nombre}, cambiar de temporada`}
          onClick={() => setAbierto((a) => !a)}
          className="focus-ring -mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 transition-colors hover:bg-accent"
        >
          Temporada {temporada.nombre}
          <ChevronDown aria-hidden="true" className={cn('size-5 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
        </button>
      </h1>
      <div
        id={idMenu}
        hidden={!abierto}
        className="absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-2 shadow-sheet"
      >
        <ul aria-label="Temporadas">
          {temporadas.map((t) => {
            const actual = t.id === temporada.id
            return (
              <li key={t.id}>
                <Link
                  href={hrefTemporada(t.id)}
                  aria-current={actual ? 'page' : undefined}
                  onClick={(e) => salir(e, actual)}
                  className={cn(
                    'focus-ring flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent',
                    actual && 'bg-brand-tint text-brand-text',
                  )}
                >
                  <span className="truncate font-medium">{t.nombre}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{estadoTemporada(t).etiqueta}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        {puedeCrearTemporada && (
          <>
            <hr className="my-2 border-border" />
            <ul aria-label="Más de la temporada">
              <li>
                <Link
                  href={`${RUTA_PLANIFICAR}/nueva`}
                  onClick={(e) => salir(e, false)}
                  className="focus-ring flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  Nueva temporada
                </Link>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export function CabeceraTemporada({
  temporada,
  temporadas,
  segmentosAlcance,
  grupos,
  personas,
  bloqueos,
  avisos,
  onAbrirAlertas,
  alertasAbiertas,
  publicar,
  puedeCrearTemporada,
  guardado,
  cambiosSinGuardar = 0,
}: CabeceraTemporadaProps): ReactElement {
  const estado = estadoTemporada(temporada)
  const nombresAlcance = enLista(segmentosAlcance.map((s) => s.nombre))
  const textoBloqueos = contar(bloqueos, 'bloqueo', 'bloqueos')
  const textoAvisos = contar(avisos, 'aviso', 'avisos')

  return (
    <div className="space-y-4">
      <section aria-labelledby="planner-temporada" className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div id="planner-temporada" className="min-w-0 space-y-1">
          <SelectorTemporada temporada={temporada} temporadas={temporadas} puedeCrearTemporada={puedeCrearTemporada} cambiosSinGuardar={cambiosSinGuardar} />
          <p className="text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} className="align-middle text-[15px]" />
            {nombresAlcance && <span>{` · ${nombresAlcance}`}</span>}
            <span>
              {' · '}
              <strong className="font-mono tabular-nums">{formatearCantidad(grupos)}</strong> {grupos === 1 ? 'grupo' : 'grupos'} ·{' '}
              <strong className="font-mono tabular-nums">{formatearCantidad(personas)}</strong> {personas === 1 ? 'persona' : 'personas'}
            </span>
          </p>
        </div>
        <div role="group" aria-label="Acciones de la temporada" className="flex flex-wrap items-center gap-2">
          {guardado}
          <BotonSistema
            type="button"
            variante="outline"
            tamaño="sm"
            aria-label={`Alertas: ${textoBloqueos} y ${textoAvisos}`}
            aria-haspopup="dialog"
            aria-expanded={alertasAbiertas}
            onClick={onAbrirAlertas}
          >
            <span className="inline-flex items-center gap-3">
              <PuntoEstado tono="danger" etiqueta={textoBloqueos} className="text-sm text-foreground" />
              <PuntoEstado tono="warning" etiqueta={textoAvisos} className="text-sm text-foreground" />
            </span>
          </BotonSistema>
          {publicar && (
            <BotonSistema asChild variante={publicar.listo ? 'primario' : 'ghost'} tamaño="sm">
              <Link href={`${RUTA_PLANIFICAR}/publicar?temporada=${encodeURIComponent(temporada.id)}`}>{publicar.texto}</Link>
            </BotonSistema>
          )}
        </div>
      </section>
      {nombresAlcance && (
        <AvisoFormulario tono="info" role="note" className="py-3">
          Ves los grupos de tus segmentos: {nombresAlcance}. El banco muestra a todas las personas, también a las nuevas sin segmento.
        </AvisoFormulario>
      )}
    </div>
  )
}
