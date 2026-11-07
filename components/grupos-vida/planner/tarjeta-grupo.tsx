'use client'

/**
 * Planner — the compact Trello card of one group (S21; artboard 01, "Compact
 * Trello card"; gap G2). Free name (two lines) and the computed label
 * "Matrimonios · Cabudare" (S4), leaders ("Falta el Líder" in red), count over
 * capacity with its bar, the localidad suggestion when the group has none
 * (S3; "Usar <localidad>" applies it from T5b), blocker (red) and warning
 * (amber) badges, and "N integrantes" that expands the people by role in
 * place with each person's warnings.
 *
 * With the board's steps (T5b, pasos-planner.tsx) and a segment the actor
 * edits: the card takes dropped people as Miembro and each role section of
 * the expanded card in its role; members can be dragged or moved with
 * "Mover"; "Usar <localidad>" saves the suggestion; "Eliminar grupo" shows
 * only while the group has not started (S22). The name and "Abrir" open the
 * group panel (T6, panel-grupo.tsx), read-only outside the actor's segments.
 *
 * S23: names are never cut (they wrap); within a role the two spouses are one
 * row with both names and ages, moved together; under a name, where the
 * spouse is, and in Matrimonios the card counts "N sin su pareja".
 *
 * S24: a card the session draft changed (created, edited, people in or out)
 * and each moved person show "Sin guardar" until the draft is saved.
 */
import { Fragment, useId, useState, type ReactElement } from 'react'
import { ArrowRightLeft, ChevronRight, GripVertical } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import {
  MINIMO_PERSONAS_GRUPO,
  etiquetaGrupo,
  nombrePersona,
  personasDelGrupo,
  type Aviso,
  type Bloqueo,
  type GrupoTablero,
  type PersonaBanco,
  type SugerenciaLocalidad,
} from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { EtiquetaPlanner, MarcaSinGuardar } from './etiqueta'
import {
  filasDelRol,
  insigniasGrupo,
  insigniasPersona,
  nombresFila,
  notaPareja,
  puedeEliminarGrupo,
  rolesGrupo,
  textoLideres,
  type FilaRol,
  type Insignia,
  type RolDestino,
  type RolGrupo,
} from './modelo'
import { usePasos, useZonaSoltar } from './contexto-pasos'

const ROL_DE_SECCION: Readonly<Record<RolGrupo['id'], RolDestino>> = { lideres: 'lider', aprendices: 'aprendiz', miembros: 'miembro' }

const edadDe = (ficha: PersonaBanco | undefined): string | null => (ficha?.edad !== null && ficha?.edad !== undefined ? String(ficha.edad) : null)

/** The age after a name of a couple row, as in the bank. */
const Edad = ({ edad }: { readonly edad: number | null | undefined }): ReactElement | null =>
  edad === null || edad === undefined ? null : <span className="ml-1 font-mono text-xs font-normal tabular-nums text-muted-foreground">{edad}</span>

/** The chips of a row, once each (a couple shares them). */
const unicas = (insignias: readonly Insignia[]): Insignia[] => insignias.filter((m, i) => insignias.findIndex((x) => x.etiqueta === m.etiqueta) === i)

/** Drop highlight of a card or role zone while someone is dragged over it. */
const SOBRE = 'ring-2 ring-brand ring-offset-2 ring-offset-background'

export interface TarjetaGrupoProps {
  readonly grupo: GrupoTablero
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  /** The bank rows by person, for ages and where they live. */
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  /**
   * The localidad suggestion of a group without localidad: null when the
   * people do not point to one, undefined when there is nothing to suggest
   * (the group has a localidad, or the localidades could not be read).
   */
  readonly sugerencia: SugerenciaLocalidad | null | undefined
  readonly className?: string
}

function Cupo({ grupo }: { readonly grupo: GrupoTablero }): ReactElement {
  const cantidad = personasDelGrupo(grupo).length
  const capacidad = grupo.capacidad_maxima
  const fuera = cantidad < MINIMO_PERSONAS_GRUPO || (capacidad !== null && cantidad > capacidad)
  const ancho = capacidad && capacidad > 0 ? Math.min(100, Math.round((cantidad / capacidad) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {cantidad}
        {capacidad !== null && <small className="font-normal text-muted-foreground"> / {capacidad}</small>}
      </span>
      {capacidad !== null && (
        <div aria-hidden="true" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <i className={cn('block h-full rounded-full', fuera ? 'bg-warning' : 'bg-brand')} style={{ width: `${ancho}%` }} />
        </div>
      )}
    </div>
  )
}

function Sugerencia({ grupo, sugerencia }: { readonly grupo: GrupoTablero; readonly sugerencia: SugerenciaLocalidad | null }): ReactElement {
  const pasos = usePasos()
  const puedeUsar = pasos !== null && pasos.editable(grupo.segmento_id)
  if (!sugerencia) {
    return <p className="text-xs text-muted-foreground">Sin sugerencia: elige la localidad a mano</p>
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-dashed border-danger/40 p-2">
      <p className="text-xs text-muted-foreground" title={`Sugerida: ${sugerencia.nombre}, ${sugerencia.motivo}`}>
        Sugerida · {sugerencia.motivo}
      </p>
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        disabled={!puedeUsar}
        aria-label={`Usar ${sugerencia.nombre} como localidad de ${grupo.nombre}`}
        onClick={() => pasos?.usarLocalidad(grupo, sugerencia)}
        className="w-full"
      >
        Usar {sugerencia.nombre}
      </BotonSistema>
    </div>
  )
}

/**
 * One member row of the expanded card: a person, or a couple of the same role
 * with both full names and ages (S23). Names wrap, never cut; "Mover" is an
 * icon so it never squeezes them. Under the name, where the spouse is.
 */
function FilaMiembro({
  fila,
  grupo,
  rol,
  bloqueos,
  avisos,
  fichas,
  editable,
}: Pick<TarjetaGrupoProps, 'grupo' | 'bloqueos' | 'avisos' | 'fichas'> & {
  readonly fila: FilaRol
  readonly rol: RolDestino
  readonly editable: boolean
}): ReactElement {
  const pasos = usePasos()
  const nombre = nombresFila(fila.personas)
  const pareja = fila.personas.length > 1
  const ids = fila.personas.map((p) => p.usuario_id)
  const datos = pareja
    ? [...new Set(fila.personas.map((p) => fichas.get(p.usuario_id)?.municipio_nombre).filter(Boolean))]
    : [edadDe(fichas.get(ids[0])), fichas.get(ids[0])?.municipio_nombre].filter(Boolean)
  const marcas = unicas(fila.personas.flatMap((p) => insigniasPersona(p.usuario_id, grupo.grupo_id, bloqueos, avisos)))
  const nota = pareja ? null : notaPareja(ids[0], grupo, fichas)
  const carga = { ids, nombre, desdeGrupo: true }
  const sinGuardar = pasos !== null && ids.some((id) => pasos.pendiente.persona(id))
  return (
    <li
      aria-label={nombre}
      draggable={editable}
      onDragStart={editable ? (e) => pasos?.arrastrar(carga, e) : undefined}
      onDragEnd={editable ? () => pasos?.terminarArrastre() : undefined}
      className={cn('flex min-w-0 items-start gap-1', editable && 'cursor-grab')}
    >
      {editable && <GripVertical aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p data-nombres className="break-words text-[13px] font-medium leading-snug text-foreground">
          {pareja ? (
            fila.personas.map((p, i) => (
              <Fragment key={p.usuario_id}>
                {i > 0 && ' y '}
                {nombrePersona(p)}
                <Edad edad={fichas.get(p.usuario_id)?.edad} />
              </Fragment>
            ))
          ) : (
            nombre
          )}
        </p>
        {datos.length > 0 && <p className="break-words text-xs text-muted-foreground">{datos.join(' · ')}</p>}
        {nota && <p className={cn('break-words text-xs', nota.falta ? 'font-medium text-warning-text' : 'text-muted-foreground')}>{nota.texto}</p>}
        {sinGuardar && <MarcaSinGuardar />}
        {marcas.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {marcas.map((m) => (
              <EtiquetaPlanner key={m.etiqueta} tono={m.tono}>
                {m.etiqueta}
              </EtiquetaPlanner>
            ))}
          </div>
        )}
      </div>
      {editable && (
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          soloIcono
          icono={ArrowRightLeft}
          aria-label={`Mover a ${nombre}`}
          title="Mover"
          onClick={() => pasos?.pedirUbicar(carga, { grupoId: grupo.grupo_id, rol })}
          className="shrink-0"
        />
      )}
    </li>
  )
}

function SeccionRol({
  grupo,
  rol,
  bloqueos,
  avisos,
  fichas,
}: Pick<TarjetaGrupoProps, 'grupo' | 'bloqueos' | 'avisos' | 'fichas'> & { readonly rol: RolGrupo }): ReactElement {
  const pasos = usePasos()
  const editable = pasos !== null && pasos.editable(grupo.segmento_id)
  const zona = useZonaSoltar(grupo, ROL_DE_SECCION[rol.id])
  return (
    <section aria-label={rol.titulo} {...zona.props} className={cn('-mx-1 rounded-xl px-1 pb-1', zona.sobre && SOBRE)}>
      <h4
        className={cn(
          'mb-1 text-xs font-medium uppercase tracking-[0.08em]',
          rol.id === 'lideres' && rol.personas.length === 0 ? 'text-danger-text' : 'text-muted-foreground',
        )}
      >
        {rol.titulo} <span className="font-mono tabular-nums">{rol.personas.length}</span>
      </h4>
      {rol.personas.length === 0 ? (
        <p className={cn('text-xs', rol.id === 'lideres' ? 'text-danger-text' : 'text-muted-foreground')}>
          {rol.id === 'lideres' ? 'Falta el Líder' : 'Nadie todavía'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {filasDelRol(rol.personas, fichas).map((fila) => (
            <FilaMiembro key={fila.clave} fila={fila} grupo={grupo} rol={ROL_DE_SECCION[rol.id]} bloqueos={bloqueos} avisos={avisos} fichas={fichas} editable={editable} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function TarjetaGrupo({ grupo, bloqueos, avisos, fichas, sugerencia, className }: TarjetaGrupoProps): ReactElement {
  const [abierta, setAbierta] = useState(false)
  const idMiembros = useId()
  const idTitulo = useId()
  const lideres = textoLideres(grupo)
  const etiqueta = etiquetaGrupo(grupo)
  const cantidad = personasDelGrupo(grupo).length
  const pasos = usePasos()
  const editable = pasos !== null && pasos.editable(grupo.segmento_id)
  const zona = useZonaSoltar(grupo, 'miembro')

  return (
    <article
      id={`grupo-${grupo.grupo_id}`}
      aria-labelledby={idTitulo}
      {...zona.props}
      className={cn('flex scroll-mt-24 flex-col gap-2.5 rounded-2xl border border-border bg-card p-3', zona.sobre && SOBRE, className)}
    >
      <div className="min-w-0">
        <h3 id={idTitulo} title={grupo.nombre} className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
          {pasos ? (
            <button
              type="button"
              onClick={() => pasos.abrirGrupo(grupo.grupo_id)}
              className="focus-ring rounded-md text-left transition-colors hover:text-brand-text"
            >
              {grupo.nombre.trim() || etiqueta}
            </button>
          ) : (
            grupo.nombre.trim() || etiqueta
          )}
        </h3>
        <p title={etiqueta} className={cn('truncate text-xs', grupo.localidad_id ? 'text-muted-foreground' : 'text-danger-text')}>
          {etiqueta}
        </p>
        {pasos?.pendiente.grupo(grupo.grupo_id) && <MarcaSinGuardar />}
      </div>
      {lideres ? (
        <p className="break-words text-[13px] text-foreground">
          {lideres}
        </p>
      ) : (
        <p className="text-[13px] font-medium text-danger-text">Falta el Líder</p>
      )}
      <Cupo grupo={grupo} />
      {!grupo.localidad_id && sugerencia !== undefined && <Sugerencia grupo={grupo} sugerencia={sugerencia} />}
      <ul aria-label="Alertas del grupo" className="flex flex-wrap gap-1">
        {insigniasGrupo(grupo, bloqueos, avisos, fichas).map((insignia) => (
          <li key={insignia.etiqueta} className="min-w-0 max-w-full">
            <EtiquetaPlanner tono={insignia.tono}>{insignia.etiqueta}</EtiquetaPlanner>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={idMiembros}
          onClick={() => setAbierta((a) => !a)}
          className="focus-ring -mx-1 inline-flex min-h-11 items-center gap-1 rounded-xl px-1 text-sm font-medium text-brand-text transition-colors hover:bg-accent"
        >
          {cantidad} {cantidad === 1 ? 'integrante' : 'integrantes'}
          <ChevronRight aria-hidden="true" className={cn('size-4 transition-transform', abierta && 'rotate-90')} />
        </button>
        {pasos && (
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            aria-label={`Abrir ${grupo.nombre.trim() || etiqueta}`}
            onClick={() => pasos.abrirGrupo(grupo.grupo_id)}
          >
            Abrir
          </BotonSistema>
        )}
      </div>
      <div id={idMiembros} hidden={!abierta} className="space-y-3 border-t border-border pt-2.5">
        {rolesGrupo(grupo).map((rol) => (
          <SeccionRol key={rol.id} grupo={grupo} rol={rol} bloqueos={bloqueos} avisos={avisos} fichas={fichas} />
        ))}
        {editable && puedeEliminarGrupo(grupo) && (
          <BotonSistema type="button" variante="peligro" tamaño="sm" onClick={() => pasos?.pedirEliminar(grupo)} className="w-full">
            Eliminar grupo
          </BotonSistema>
        )}
      </div>
    </article>
  )
}
