'use client'

/**
 * Planner — the Tablero on a phone (T8c of odd/tasks/planner-gdv.md;
 * artboard 05; S9, S21, S23). No lanes and no drag: one section per segment
 * the actor sees, its groups clustered by localidad ("Sin localidad" first)
 * as inset grouped lists. Each row is the compact card in one line of sight:
 * name, computed label (S4), leaders ("Falta el Líder" in red), count over
 * capacity and the alert badges; names wrap, never cut. A row opens the
 * group panel, a bottom sheet on the phone, where "Mover" and the role
 * change live. In a segment the actor edits the section carries "Terminé mi
 * segmento" (S14) and ends with "Nuevo grupo".
 */
import { useMemo, type ReactElement } from 'react'
import { ChevronRight, Plus, UsersRound } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { etiquetaGrupo, personasDelGrupo, type Aviso, type Bloqueo, type GrupoTablero, type PersonaBanco } from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { EtiquetaPlanner, MarcaSinGuardar } from './etiqueta'
import { MarcaSegmento } from './marca-segmento'
import { formatearCantidad, insigniasGrupo, textoLideres, type Carril } from './modelo'
import { usePasos } from './contexto-pasos'

// Hairline between rows, inset from the text (docs/design-system/mobile.md#inset-grouped-lists).
const CLASE_LINEA = 'before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60 first:before:hidden'

export interface ListaPlannerProps {
  readonly carriles: readonly Carril[]
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly banco: readonly PersonaBanco[]
  readonly busqueda: string
}

function FilaGrupo({
  grupo,
  bloqueos,
  avisos,
  fichas,
}: {
  readonly grupo: GrupoTablero
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
}): ReactElement {
  const pasos = usePasos()
  const etiqueta = etiquetaGrupo(grupo)
  const lideres = textoLideres(grupo)
  const cantidad = personasDelGrupo(grupo).length
  const insignias = insigniasGrupo(grupo, bloqueos, avisos, fichas)
  return (
    <li id={`grupo-${grupo.grupo_id}`} className={cn('relative scroll-mt-24', CLASE_LINEA)}>
      <button
        type="button"
        disabled={!pasos}
        onClick={() => pasos?.abrirGrupo(grupo.grupo_id)}
        className="focus-ring flex min-h-16 w-full min-w-0 items-start gap-3 px-3.5 py-3 text-left touch-manipulation transition-colors active:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold leading-snug text-foreground">{grupo.nombre.trim() || etiqueta}</span>
          <span className={cn('block break-words text-[13px]', grupo.localidad_id ? 'text-muted-foreground' : 'text-danger-text')}>{etiqueta}</span>
          <span className={cn('mt-0.5 block break-words text-[13px]', lideres ? 'text-foreground' : 'font-medium text-danger-text')}>
            {lideres ?? 'Falta el Líder'}
          </span>
          {pasos?.pendiente.grupo(grupo.grupo_id) && (
            <span className="block">
              <MarcaSinGuardar />
            </span>
          )}
          {insignias.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {insignias.map((insignia) => (
                <EtiquetaPlanner key={insignia.etiqueta} tono={insignia.tono}>
                  {insignia.etiqueta}
                </EtiquetaPlanner>
              ))}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 self-center">
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {cantidad}
            {grupo.capacidad_maxima !== null && <small className="font-normal text-muted-foreground"> / {grupo.capacidad_maxima}</small>}
          </span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </span>
      </button>
    </li>
  )
}

function SeccionSegmento({
  carril,
  bloqueos,
  avisos,
  fichas,
}: {
  readonly carril: Carril
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
}): ReactElement {
  const { segmento } = carril
  const idTitulo = `lista-${segmento.id}`
  const pasos = usePasos()
  const editable = pasos !== null && pasos.editable(segmento.id)
  const publicacion = editable && carril.grupos > 0 ? pasos.segmento(segmento.id) : null
  return (
    <section aria-labelledby={idTitulo} className="min-w-0 space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id={idTitulo} className="text-lg font-semibold text-foreground">
            {segmento.nombre}
          </h2>
          <span className="text-[13px] text-muted-foreground">
            <span className="font-mono tabular-nums">{formatearCantidad(carril.grupos)}</span> {carril.grupos === 1 ? 'grupo' : 'grupos'} ·{' '}
            <span className="font-mono tabular-nums">{formatearCantidad(carril.personas)}</span> {carril.personas === 1 ? 'persona' : 'personas'}
          </span>
        </div>
        {publicacion && <MarcaSegmento segmento={publicacion} />}
      </div>
      {carril.bloques.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay grupos de {segmento.nombre} en esta temporada.</p>}
      {carril.bloques.map((bloque) => (
        <div key={bloque.id} className="space-y-1.5">
          <h3 className={cn('px-1 text-xs font-medium uppercase tracking-[0.08em]', bloque.falta ? 'text-danger-text' : 'text-muted-foreground')}>
            {bloque.titulo} <span className="font-mono tabular-nums">· {bloque.grupos.length}</span>
          </h3>
          <ul aria-label={`${segmento.nombre}, ${bloque.titulo}`} className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {bloque.grupos.map((grupo) => (
              <FilaGrupo key={grupo.grupo_id} grupo={grupo} bloqueos={bloqueos} avisos={avisos} fichas={fichas} />
            ))}
          </ul>
        </div>
      ))}
      {editable && (
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={Plus}
          aria-label={`Nuevo grupo en ${segmento.nombre}`}
          onClick={() => pasos.pedirNuevoGrupo(segmento)}
          className="w-full"
        >
          Nuevo grupo
        </BotonSistema>
      )}
    </section>
  )
}

export function ListaPlanner({ carriles, bloqueos, avisos, banco, busqueda }: ListaPlannerProps): ReactElement {
  const fichas = useMemo(() => new Map(banco.map((p) => [p.usuario_id, p])), [banco])

  if (carriles.length === 0) {
    return busqueda.trim() ? (
      <EstadoVacioSistema icono={UsersRound} titulo="Ningún grupo coincide" subtitulo="Prueba con otro nombre de grupo o de persona." />
    ) : (
      <EstadoVacioSistema icono={UsersRound} titulo="Todavía no hay grupos en esta temporada" subtitulo="Los grupos que se creen aparecen aquí por segmento." />
    )
  }

  return (
    <div role="region" aria-label="Grupos de la temporada, lista" className="min-w-0 space-y-8">
      {carriles.map((carril) => (
        <SeccionSegmento key={carril.segmento.id} carril={carril} bloqueos={bloqueos} avisos={avisos} fichas={fichas} />
      ))}
    </div>
  )
}
