/**
 * Planner — the publish button and the blockers summary (S6, S14, S16 of
 * odd/tasks/planner-gdv.md). The button is always enabled and opens the
 * publish review; its label carries the state and `listo` turns it green.
 */
import { contar } from './textos'
import type { Bloqueo, ConteoBloqueos, EstadoPublicacion, SegmentoPublicacion, TipoBloqueo } from './tipos'

export interface BotonPublicar {
  /** "Publicar · 20 bloqueos · faltan 2 segmentos", "Publicar". */
  readonly texto: string
  /** Ready to publish (green), as planner_estado_publicacion.puede_publicar says. */
  readonly listo: boolean
}

/** S16: the director general's publish button on the board. */
export function botonPublicar(estado: EstadoPublicacion): BotonPublicar {
  const partes = ['Publicar']
  if (estado.grupos === 0) partes.push('sin grupos')
  if (estado.bloqueos.total > 0) partes.push(contar(estado.bloqueos.total, 'bloqueo', 'bloqueos'))
  if (estado.faltan_segmentos > 0) {
    partes.push(`${estado.faltan_segmentos === 1 ? 'falta' : 'faltan'} ${contar(estado.faltan_segmentos, 'segmento', 'segmentos')}`)
  }
  return { texto: partes.join(' · '), listo: estado.puede_publicar }
}

/** The blockers of planner_bloqueos (the actor's segments) counted like planner_estado_publicacion. */
export function contarBloqueos(filas: readonly Bloqueo[]): ConteoBloqueos {
  const deTipo = (tipo: TipoBloqueo): number => filas.filter((f) => f.tipo === tipo).length
  return {
    total: filas.length,
    sin_lider: deTipo('sin_lider'),
    sin_director: deTipo('sin_director'),
    sin_localidad: deTipo('sin_localidad'),
    persona_en_dos_grupos: deTipo('persona_en_dos_grupos'),
  }
}

export const ETIQUETA_BLOQUEO: Readonly<Record<TipoBloqueo, string>> = {
  sin_localidad: 'Sin localidad',
  sin_lider: 'Sin Líder',
  sin_director: 'Sin director de etapa',
  persona_en_dos_grupos: 'Persona en dos grupos',
}

/** Display order: the most common blocker first (alerts panel 03 and publish review 04). */
const ORDEN_BLOQUEOS: readonly TipoBloqueo[] = ['sin_localidad', 'sin_lider', 'sin_director', 'persona_en_dos_grupos']

export interface ResumenBloqueo {
  readonly tipo: TipoBloqueo
  readonly etiqueta: string
  readonly cantidad: number
}

/** The four kinds, always all of them (a 0 is shown as done), in display order. */
export const resumenBloqueos = (conteo: ConteoBloqueos): ResumenBloqueo[] =>
  ORDEN_BLOQUEOS.map((tipo) => ({ tipo, etiqueta: ETIQUETA_BLOQUEO[tipo], cantidad: conteo[tipo] }))

export interface PermisoMarcar {
  readonly puede: boolean
  /** Why "Terminé mi segmento" is disabled; null when enabled. */
  readonly motivo: string | null
}

/** S14: "Terminé mi segmento" needs groups and 0 blockers, as planner_marcar_segmento checks. */
export function puedeMarcarSegmento(segmento: SegmentoPublicacion): PermisoMarcar {
  if (segmento.grupos === 0) return { puede: false, motivo: `${segmento.nombre} no tiene grupos en esta temporada` }
  if (segmento.bloqueos === 1) return { puede: false, motivo: 'Primero resuelve el bloqueo' }
  if (segmento.bloqueos > 1) return { puede: false, motivo: `Primero resuelve los ${segmento.bloqueos} bloqueos` }
  return { puede: true, motivo: null }
}
