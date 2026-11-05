'use client'

/**
 * Planner — the Tablero view (S9, S17, S21; artboards 01 and 08). One lane per
 * segment the actor sees, each its own horizontal scroll area with snap and
 * "‹ ›" (one page per press), so no column is cut against the bank. Inside a
 * lane the groups are clustered by localidad ("Sin localidad" first) or by
 * director de etapa. Column width follows the lane width (container query):
 * 2, 3, 4 or 5 columns. In a segment the actor edits (T5b) the lane header
 * carries "Terminé mi segmento" (S14) and the lane ends with "Nuevo grupo".
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { ChevronLeft, ChevronRight, Plus, UsersRound } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { sugerirLocalidad, type Aviso, type Bloqueo, type GrupoTablero, type Localidad, type PersonaBanco } from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { MarcaSegmento } from './marca-segmento'
import { formatearCantidad, type Carril } from './modelo'
import { usePasos } from './contexto-pasos'
import { TarjetaGrupo } from './tarjeta-grupo'

/** Every column of a lane has the same width: the visible lane width split in 2–5 (gap 0.75rem). */
const ANCHO_COLUMNA =
  'w-[calc((100cqw-0.75rem)/2)] @min-[34rem]:w-[calc((100cqw-1.5rem)/3)] @min-[44rem]:w-[calc((100cqw-2.25rem)/4)] @min-[60rem]:w-[calc((100cqw-3rem)/5)]'

export interface TableroPlannerProps {
  readonly carriles: readonly Carril[]
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly banco: readonly PersonaBanco[]
  /** Empty when the localidades could not be read: then no card suggests one. */
  readonly localidades: readonly Localidad[]
  readonly busqueda: string
}

function CarrilSegmento({
  carril,
  bloqueos,
  avisos,
  fichas,
  sugerencia,
}: {
  readonly carril: Carril
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly sugerencia: (grupo: GrupoTablero) => ReturnType<typeof sugerirLocalidad> | undefined
}): ReactElement {
  const area = useRef<HTMLDivElement>(null)
  const [posicion, setPosicion] = useState({ inicio: true, final: true })
  const { segmento } = carril
  const idTitulo = `carril-${segmento.id}`

  const medir = useCallback(() => {
    const el = area.current
    if (!el) return
    setPosicion({ inicio: el.scrollLeft <= 1, final: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }, [])

  useEffect(() => {
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [medir, carril])

  const desplazar = (sentido: 1 | -1) => {
    const el = area.current
    if (!el || typeof el.scrollBy !== 'function') return
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: sentido * el.clientWidth, behavior: reducido ? 'auto' : 'smooth' })
  }

  const vacio = carril.bloques.length === 0
  const pasos = usePasos()
  const editable = pasos !== null && pasos.editable(segmento.id)
  const publicacion = editable ? pasos.segmento(segmento.id) : null
  const nuevo = editable && (
    <BotonSistema
      type="button"
      variante="outline"
      tamaño="sm"
      icono={Plus}
      aria-label={`Nuevo grupo en ${segmento.nombre}`}
      onClick={() => pasos.pedirNuevoGrupo(segmento)}
    >
      Nuevo grupo
    </BotonSistema>
  )

  return (
    <section aria-labelledby={idTitulo} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={idTitulo} className="text-base font-semibold text-foreground">
          {segmento.nombre}
        </h2>
        <span className="text-[13px] text-muted-foreground">
          <span className="font-mono tabular-nums">{formatearCantidad(carril.grupos)}</span> {carril.grupos === 1 ? 'grupo' : 'grupos'} ·{' '}
          <span className="font-mono tabular-nums">{formatearCantidad(carril.personas)}</span> {carril.personas === 1 ? 'persona' : 'personas'}
        </span>
        {publicacion && <MarcaSegmento segmento={publicacion} />}
        {!vacio && (
          <div role="group" aria-label={`Desplazar los grupos de ${segmento.nombre}`} className="ml-auto flex gap-1">
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              soloIcono
              icono={ChevronLeft}
              aria-label={`Grupos anteriores de ${segmento.nombre}`}
              disabled={posicion.inicio}
              onClick={() => desplazar(-1)}
            />
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              soloIcono
              icono={ChevronRight}
              aria-label={`Más grupos de ${segmento.nombre}`}
              disabled={posicion.final}
              onClick={() => desplazar(1)}
            />
          </div>
        )}
      </div>
      {vacio ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">Todavía no hay grupos de {segmento.nombre} en esta temporada.</p>
          {nuevo}
        </div>
      ) : (
        <div className="@container min-w-0">
          <div ref={area} onScroll={medir} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
            {carril.bloques.map((bloque) => (
              <div key={bloque.id} role="group" aria-label={`${bloque.titulo}, ${bloque.grupos.length} ${bloque.grupos.length === 1 ? 'grupo' : 'grupos'}`} className="flex shrink-0 flex-col gap-2">
                <h3
                  className={cn(
                    'truncate text-xs font-medium uppercase tracking-[0.08em]',
                    bloque.falta ? 'text-danger-text' : 'text-muted-foreground',
                  )}
                >
                  {bloque.titulo} <span className="font-mono tabular-nums">· {bloque.grupos.length}</span>
                </h3>
                <div className="flex items-start gap-3">
                  {bloque.grupos.map((grupo) => (
                    <TarjetaGrupo
                      key={grupo.grupo_id}
                      grupo={grupo}
                      bloqueos={bloqueos}
                      avisos={avisos}
                      fichas={fichas}
                      sugerencia={sugerencia(grupo)}
                      className={cn('shrink-0 snap-start', ANCHO_COLUMNA)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {nuevo && <div className={cn('flex shrink-0 snap-start flex-col justify-start pt-6', ANCHO_COLUMNA)}>{nuevo}</div>}
          </div>
        </div>
      )}
    </section>
  )
}

export function TableroPlanner({ carriles, bloqueos, avisos, banco, localidades, busqueda }: TableroPlannerProps): ReactElement {
  const fichas = useMemo(() => new Map(banco.map((p) => [p.usuario_id, p])), [banco])
  // One suggestion per group without localidad, computed once per data change (not per render).
  const sugerencias = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof sugerirLocalidad>>()
    if (localidades.length === 0) return mapa
    carriles.forEach((c) =>
      c.bloques.forEach((b) => b.grupos.forEach((g) => !g.localidad_id && mapa.set(g.grupo_id, sugerirLocalidad(g, banco, localidades)))),
    )
    return mapa
  }, [carriles, banco, localidades])
  const sugerencia = useCallback(
    (grupo: GrupoTablero) => (sugerencias.has(grupo.grupo_id) ? sugerencias.get(grupo.grupo_id) : undefined),
    [sugerencias],
  )

  if (carriles.length === 0) {
    return busqueda.trim() ? (
      <EstadoVacioSistema icono={UsersRound} titulo="Ningún grupo coincide" subtitulo="Prueba con otro nombre de grupo o de persona." />
    ) : (
      <EstadoVacioSistema icono={UsersRound} titulo="Todavía no hay grupos en esta temporada" subtitulo="Los grupos que se creen aparecen aquí por segmento." />
    )
  }

  return (
    <div aria-label="Grupos de la temporada, vista Tablero" role="region" className="min-w-0 space-y-8">
      {carriles.map((carril) => (
        <CarrilSegmento key={carril.segmento.id} carril={carril} bloqueos={bloqueos} avisos={avisos} fichas={fichas} sugerencia={sugerencia} />
      ))}
    </div>
  )
}
