'use client'

/**
 * Planner — the one-line season header (S21; artboards 01 and 08). Left: the
 * season switcher "Temporada 2026-II ▾" (the h1 of the page; its menu lists
 * every season, "Diagnóstico de cierre" of the season it closes (T8b) and,
 * for whoever creates seasons, "Nueva temporada · <next name>") and the
 * summary "En planificación · 27 grupos · 366 personas". Right: the alerts
 * button "N bloqueos · M avisos" that opens the alerts panel and, for admin,
 * pastor and director general only, the publish button whose label carries
 * the season state (S16): ghost until everything is ready. A director de
 * etapa gets the note of what they see instead (S10). The save bar (S24,
 * estado-guardado.tsx: unsaved changes, Deshacer, Descartar, Guardar) comes
 * first on the right, then "Historial" (T8a), which opens the history panel
 * (panel-historial.tsx). With unsaved changes,
 * switching season asks first (the draft stays in this browser).
 *
 * Phone (`compacta`, T8c, artboard 05): the season and its state share one
 * line ("2026-II ▾ ● En planificación"), the counts go under it, and the
 * actions are one wrapping row: the compact save bar, the alerts chip
 * "● N · ● M" and "Más acciones" (Historial and, for whoever publishes, the
 * publish link with its state).
 *
 * Desktop and tablet, planning style (S25, the header band of
 * prototipos/planificacion-dps/01): a `bg-card` band with a bottom border and
 * 24px gutters, the h1 at 24px / 650 with the summary under it and the 36px
 * actions at the right; menus are flat `rounded-md` popovers with 36px items
 * (44px on touch).
 */
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ClicReact, type ReactElement, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import { ChevronDown, History, MoreHorizontal } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { contar, enLista, type BotonPublicar, type SegmentoPlanner, type TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'
import { sugerirSiguienteTemporada } from '@/lib/platform/grupos-vida/planner/temporada-nueva'
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
  /** Opens the history panel (artboard 09); without it there is no "Historial" button. */
  readonly onAbrirHistorial?: () => void
  readonly historialAbierto?: boolean
  /** The publish button (S16); null hides it (director de etapa, S12). */
  readonly publicar: BotonPublicar | null
  readonly puedeCrearTemporada: boolean
  /** The save bar (estado-guardado.tsx). */
  readonly guardado?: ReactNode
  /** Unsaved changes of this season (S24): switching season asks first. */
  readonly cambiosSinGuardar?: number
  /** Phone layout (T8c): season and state on one line, Historial and Publicar in "Más acciones". */
  readonly compacta?: boolean
}

/** Closes a popover menu on a click outside it or on Escape (focus back to its button). */
function useCerrarMenu(abierto: boolean, cerrar: () => void, contenedor: RefObject<HTMLDivElement | null>, boton: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) cerrar()
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      cerrar()
      boton.current?.focus()
    }
    document.addEventListener('mousedown', alPulsar)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alPulsar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto, cerrar, contenedor, boton])
}

const CLASE_MENU = 'absolute top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card p-1 shadow-sheet'
const CLASE_ITEM_MENU =
  'focus-ring flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent pointer-coarse:min-h-11'

function SelectorTemporada({
  temporada,
  temporadas,
  puedeCrearTemporada,
  cambiosSinGuardar = 0,
  compacta = false,
}: Pick<CabeceraTemporadaProps, 'temporada' | 'temporadas' | 'puedeCrearTemporada' | 'cambiosSinGuardar' | 'compacta'>): ReactElement {
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
  // The next season of the cohort rule (A14), e.g. "2027-I"; today only matters for a cohort without seasons.
  const siguiente = useMemo(() => sugerirSiguienteTemporada(temporadas, new Date().toISOString().slice(0, 10)).nombre, [temporadas])
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useMemo(() => () => setAbierto(false), [])
  useCerrarMenu(abierto, cerrar, contenedor, boton)

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
          className="focus-ring -mx-2 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-accent pointer-coarse:min-h-11"
        >
          {compacta ? temporada.nombre : `Temporada ${temporada.nombre}`}
          <ChevronDown aria-hidden="true" className={cn('size-5 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
        </button>
      </h1>
      <div
        id={idMenu}
        hidden={!abierto}
        className={cn(CLASE_MENU, 'left-0')}
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
                    'focus-ring flex min-h-9 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent pointer-coarse:min-h-11',
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
        {(puedeCrearTemporada || temporada.origen_id) && (
          <>
            <hr className="my-1 border-border" />
            <ul aria-label="Más de la temporada">
              {temporada.origen_id && (
                <li>
                  <Link
                    href={`${RUTA_PLANIFICAR}/diagnostico?temporada=${encodeURIComponent(temporada.id)}`}
                    onClick={(e) => salir(e, false)}
                    className={CLASE_ITEM_MENU}
                  >
                    <span>Diagnóstico de cierre</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{temporada.origen_nombre}</span>
                  </Link>
                </li>
              )}
              {puedeCrearTemporada && (
                <li>
                  <Link
                    href={`${RUTA_PLANIFICAR}/nueva`}
                    onClick={(e) => salir(e, false)}
                    className={CLASE_ITEM_MENU}
                  >
                    <span>Nueva temporada</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{siguiente}</span>
                  </Link>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/** "Más acciones" of the phone header: Historial and the publish link (S16 state in its label). */
function MenuAcciones({
  temporadaId,
  onAbrirHistorial,
  publicar,
}: {
  readonly temporadaId: string
  readonly onAbrirHistorial?: () => void
  readonly publicar: BotonPublicar | null
}): ReactElement | null {
  const [abierto, setAbierto] = useState(false)
  const idMenu = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useMemo(() => () => setAbierto(false), [])
  useCerrarMenu(abierto, cerrar, contenedor, boton)
  if (!onAbrirHistorial && !publicar) return null
  return (
    // Not positioned: the menu hangs from the actions row (`relative` there), so
    // on a phone it opens under the row instead of past the screen's left edge.
    <div ref={contenedor}>
      <BotonSistema
        ref={boton}
        type="button"
        variante="ghost"
        tamaño="sm"
        soloIcono
        icono={MoreHorizontal}
        aria-label="Más acciones"
        aria-expanded={abierto}
        aria-controls={idMenu}
        onClick={() => setAbierto((a) => !a)}
      />
      <ul id={idMenu} hidden={!abierto} aria-label="Más acciones" className={cn(CLASE_MENU, 'left-0')}>
        {onAbrirHistorial && (
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                setAbierto(false)
                onAbrirHistorial()
              }}
              className={CLASE_ITEM_MENU}
            >
              Historial
              <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        )}
        {publicar && (
          <li>
            <Link
              href={`${RUTA_PLANIFICAR}/publicar?temporada=${encodeURIComponent(temporadaId)}`}
              className={cn(CLASE_ITEM_MENU, publicar.listo && 'bg-brand-tint text-brand-text')}
            >
              {publicar.texto}
            </Link>
          </li>
        )}
      </ul>
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
  onAbrirHistorial,
  historialAbierto = false,
  publicar,
  puedeCrearTemporada,
  guardado,
  cambiosSinGuardar = 0,
  compacta = false,
}: CabeceraTemporadaProps): ReactElement {
  const estado = estadoTemporada(temporada)
  const nombresAlcance = enLista(segmentosAlcance.map((s) => s.nombre))
  const textoBloqueos = contar(bloqueos, 'bloqueo', 'bloqueos')
  const textoAvisos = contar(avisos, 'aviso', 'avisos')

  return (
    <div className={compacta ? 'space-y-4' : 'space-y-3 border-b border-border bg-card px-6 pt-4 pb-3.5'}>
      <section
        aria-labelledby="planner-temporada"
        className={cn('flex flex-wrap justify-between gap-x-6 gap-y-3', compacta ? 'items-start' : 'items-center')}
      >
        <div id="planner-temporada" className="min-w-0 space-y-1">
          {compacta ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <SelectorTemporada temporada={temporada} temporadas={temporadas} puedeCrearTemporada={puedeCrearTemporada} cambiosSinGuardar={cambiosSinGuardar} compacta />
              <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} className="text-[15px]" />
            </div>
          ) : (
            <SelectorTemporada temporada={temporada} temporadas={temporadas} puedeCrearTemporada={puedeCrearTemporada} cambiosSinGuardar={cambiosSinGuardar} />
          )}
          <p className="text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            {!compacta && <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} className="align-middle text-[15px]" />}
            {nombresAlcance && <span>{`${compacta ? '' : ' · '}${nombresAlcance}`}</span>}
            <span>
              {!compacta || nombresAlcance ? ' · ' : ''}
              <strong className="font-mono tabular-nums">{formatearCantidad(grupos)}</strong> {grupos === 1 ? 'grupo' : 'grupos'} ·{' '}
              <strong className="font-mono tabular-nums">{formatearCantidad(personas)}</strong> {personas === 1 ? 'persona' : 'personas'}
            </span>
          </p>
        </div>
        <div role="group" aria-label="Acciones de la temporada" className={cn('flex flex-wrap items-center gap-2', compacta && 'relative')}>
          {guardado}
          {onAbrirHistorial && !compacta && (
            <BotonSistema
              type="button"
              variante="ghost"
              tamaño="sm"
              soloIcono
              icono={History}
              aria-label="Historial"
              title="Historial de la temporada"
              aria-haspopup="dialog"
              aria-expanded={historialAbierto}
              onClick={onAbrirHistorial}
            />
          )}
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
              <PuntoEstado tono="danger" etiqueta={compacta ? formatearCantidad(bloqueos) : textoBloqueos} className={cn('text-sm text-foreground', compacta && 'font-mono tabular-nums')} />
              {compacta && <span aria-hidden="true">·</span>}
              <PuntoEstado tono="warning" etiqueta={compacta ? formatearCantidad(avisos) : textoAvisos} className={cn('text-sm text-foreground', compacta && 'font-mono tabular-nums')} />
            </span>
          </BotonSistema>
          {compacta && <MenuAcciones temporadaId={temporada.id} onAbrirHistorial={onAbrirHistorial} publicar={publicar} />}
          {publicar && !compacta && (
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
