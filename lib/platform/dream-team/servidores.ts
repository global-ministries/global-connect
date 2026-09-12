import type { DreamTeamEstado, DreamTeamServicio, PersonaId } from './types'
import type { DreamTeamLiderGdv } from './lideres-gdv'

/**
 * A person serving, whatever the source. The pool (servidores-client.tsx)
 * and the area-director view (mi-equipo-client.tsx) both need to list,
 * filter and count "who serves" without caring whether the row came from a
 * `dream_team_servicios` assignment or a Grupos de Vida leader/co-leader
 * surfaced read-only by `fetchLideresGdv` (see lideres-gdv.ts). Kept pure
 * (no I/O, no React) so both screens — and their tests — share the exact
 * same notion of estado, key and grouping equipoId regardless of origen.
 */
export type Servidor =
  | { readonly origen: 'dream_team'; readonly servicio: DreamTeamServicio }
  | { readonly origen: 'grupos_vida'; readonly lider: DreamTeamLiderGdv }

/**
 * A Grupos de Vida leader has no DreamTeamEstado of their own — their
 * lifecycle (join/leave a group) is managed entirely in Grupos de Vida, not
 * the Dream Team state machine — so they are always shown as 'activo', the
 * only estado meaningful to display alongside a real Dream Team servicio.
 */
export function estadoDeServidor(servidor: Servidor): DreamTeamEstado {
  return servidor.origen === 'dream_team' ? servidor.servicio.estado : 'activo'
}

/**
 * React/grouping key. A servicio's own id is already unique; a Grupos de
 * Vida leader has no servicio row, so it is keyed by persona instead,
 * prefixed so it can never collide with a servicio id (a uuid never starts
 * with `gdv:`).
 */
export function claveDeServidor(servidor: Servidor): string {
  return servidor.origen === 'dream_team' ? servidor.servicio.id : `gdv:${servidor.lider.personaId}`
}

export function personaIdDeServidor(servidor: Servidor): PersonaId {
  return servidor.origen === 'dream_team' ? servidor.servicio.personaId : servidor.lider.personaId
}

export function equipoIdDeServidor(servidor: Servidor): string {
  return servidor.origen === 'dream_team' ? servidor.servicio.equipoId : servidor.lider.equipoId
}
