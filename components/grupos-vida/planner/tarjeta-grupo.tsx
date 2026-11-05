'use client'

/**
 * Planner — the compact Trello card of one group (S21; artboard 01, "Compact
 * Trello card"; gap G2). Free name (two lines) and the computed label
 * "Matrimonios · Cabudare" (S4), leaders ("Falta el Líder" in red), count over
 * capacity with its bar, the localidad suggestion when the group has none
 * (S3; "Usar <localidad>" applies it from T5b), blocker (red) and warning
 * (amber) badges, and "N integrantes" that expands the people by role in
 * place with each person's warnings.
 */
import { useId, useState, type ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

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

import { EtiquetaPlanner } from './etiqueta'
import { insigniasGrupo, insigniasPersona, rolesGrupo, textoLideres } from './modelo'

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
  if (!sugerencia) {
    return <p className="text-xs text-muted-foreground">Sin sugerencia: elige la localidad a mano</p>
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-dashed border-danger/40 p-2">
      <p className="text-xs text-muted-foreground" title={`Sugerida: ${sugerencia.nombre}, ${sugerencia.motivo}`}>
        Sugerida · {sugerencia.motivo}
      </p>
      {/* Applying it is a saved step (T5b); until then the suggestion is read-only. */}
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        disabled
        title="Disponible pronto"
        aria-label={`Usar ${sugerencia.nombre} como localidad de ${grupo.nombre}`}
        className="w-full"
      >
        Usar {sugerencia.nombre}
      </BotonSistema>
    </div>
  )
}

export function TarjetaGrupo({ grupo, bloqueos, avisos, fichas, sugerencia, className }: TarjetaGrupoProps): ReactElement {
  const [abierta, setAbierta] = useState(false)
  const idMiembros = useId()
  const idTitulo = useId()
  const lideres = textoLideres(grupo)
  const etiqueta = etiquetaGrupo(grupo)
  const cantidad = personasDelGrupo(grupo).length

  return (
    <article
      id={`grupo-${grupo.grupo_id}`}
      aria-labelledby={idTitulo}
      className={cn('flex scroll-mt-24 flex-col gap-2.5 rounded-2xl border border-border bg-card p-3', className)}
    >
      <div className="min-w-0">
        <h3 id={idTitulo} title={grupo.nombre} className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
          {grupo.nombre.trim() || etiqueta}
        </h3>
        <p title={etiqueta} className={cn('truncate text-xs', grupo.localidad_id ? 'text-muted-foreground' : 'text-danger-text')}>
          {etiqueta}
        </p>
      </div>
      {lideres ? (
        <p title={`Líderes: ${lideres}`} className="truncate text-[13px] text-foreground">
          {lideres}
        </p>
      ) : (
        <p className="text-[13px] font-medium text-danger-text">Falta el Líder</p>
      )}
      <Cupo grupo={grupo} />
      {!grupo.localidad_id && sugerencia !== undefined && <Sugerencia grupo={grupo} sugerencia={sugerencia} />}
      <ul aria-label="Alertas del grupo" className="flex flex-wrap gap-1">
        {insigniasGrupo(grupo, bloqueos, avisos).map((insignia) => (
          <li key={insignia.etiqueta} className="min-w-0 max-w-full">
            <EtiquetaPlanner tono={insignia.tono}>{insignia.etiqueta}</EtiquetaPlanner>
          </li>
        ))}
      </ul>
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idMiembros}
        onClick={() => setAbierta((a) => !a)}
        className="focus-ring -mx-1 inline-flex min-h-11 items-center gap-1 self-start rounded-xl px-1 text-sm font-medium text-brand-text transition-colors hover:bg-accent"
      >
        {cantidad} {cantidad === 1 ? 'integrante' : 'integrantes'}
        <ChevronRight aria-hidden="true" className={cn('size-4 transition-transform', abierta && 'rotate-90')} />
      </button>
      <div id={idMiembros} hidden={!abierta} className="space-y-3 border-t border-border pt-2.5">
        {rolesGrupo(grupo).map((rol) => (
          <section key={rol.id} aria-label={rol.titulo}>
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
                {rol.personas.map((persona) => {
                  const ficha = fichas.get(persona.usuario_id)
                  const datos = [ficha?.edad !== null && ficha?.edad !== undefined ? String(ficha.edad) : null, ficha?.municipio_nombre].filter(Boolean)
                  const marcas = insigniasPersona(persona.usuario_id, grupo.grupo_id, bloqueos, avisos)
                  return (
                    <li key={persona.usuario_id} className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground" title={nombrePersona(persona)}>
                        {nombrePersona(persona)}
                      </p>
                      {datos.length > 0 && <p className="truncate text-xs text-muted-foreground">{datos.join(' · ')}</p>}
                      {marcas.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {marcas.map((m) => (
                            <EtiquetaPlanner key={m.etiqueta} tono={m.tono}>
                              {m.etiqueta}
                            </EtiquetaPlanner>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
