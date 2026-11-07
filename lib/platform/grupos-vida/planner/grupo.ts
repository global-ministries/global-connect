/**
 * Planner — what the rules read from one board group and its segment.
 */
import { normalizar } from './textos'
import type { GrupoTablero, PersonaGrupo } from './tipos'

/**
 * Whether a segment is Matrimonios, by name ("Matrimonios", "matrimonios ",
 * "Matrimonios Jóvenes"): segment ids differ between environments, so no id
 * is hardcoded. The single source for the spouse rule (S2) and the names (S4).
 */
export const esMatrimonios = (segmentoNombre: string | null | undefined): boolean =>
  /(^| )matrimonio/.test(normalizar(segmentoNombre ?? ''))

/** Everyone currently in the group (Líderes, aprendices, members), each person once. */
export function personasDelGrupo(grupo: Pick<GrupoTablero, 'lideres' | 'aprendices' | 'miembros'>): PersonaGrupo[] {
  const vistos = new Set<string>()
  return [...grupo.lideres, ...grupo.aprendices, ...grupo.miembros].filter((persona) => {
    if (vistos.has(persona.usuario_id)) return false
    vistos.add(persona.usuario_id)
    return true
  })
}
