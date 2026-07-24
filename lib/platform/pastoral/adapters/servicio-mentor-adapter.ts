/**
 * W10 — DT-059 — Servicio (Dream Team) mentor adapter (read-only).
 *
 * Queries active Dream Team servicios where the person serves
 * and returns the equipo's coordinator or director.
 *
 * Read-only: NO writes, NO side effects.
 */
import type { DreamTeamServicio, DreamTeamEquipo } from '@/lib/platform/dream-team/types'

export interface ServicioInfo {
  readonly id: string
  readonly personaId: string
  readonly equipoId: string
  readonly estado: string
  readonly rolId: string
}

export interface EquipoInfo {
  readonly id: string
  readonly experiencia: string
  readonly label: string
  readonly activo: boolean
}

/**
 * Resolves the servicio mentor for a persona.
 *
 * Strategy:
 * 1. Find all active servicios for the person in non-talleres experiences
 *    (i.e., experiencia IN ('dps', 'ninos', 'estudiantes', 'the_living_room')).
 * 2. Return the coordinator/director of the equipo.
 *
 * P1: one person = one active servicio per type.
 */
export interface ServicioMentorAdapterDeps {
  /**
   * Lists active servicios for a persona filtered by experience.
   * Returns {id, personaId, equipoId, estado, rolId}[].
   */
  listServiciosPorPersonaYExperiencia(
    personaId: string,
    experiencia: string,
  ): Promise<readonly ServicioInfo[]>

  /**
   * Gets the equipo (team) details by equipoId.
   */
  getEquipo(equipoId: string): Promise<EquipoInfo | null>

  /**
   * Gets the coordinator/director of an equipo.
   * Returns the personaId of the active coordinator or director.
   */
  getCoordinadorODirectorDeEquipo(equipoId: string): Promise<string | null>
}

export function createServicioMentorAdapter(
  deps: ServicioMentorAdapterDeps,
): {
  resolverCoordinadorDeServicio(personaId: string): Promise<string | null>
} {
  // Non-talleres experiences that count as "servicio" for the cascade
  const SERVICIO_EXPERIENCIAS = ['dps', 'ninos', 'estudiantes', 'the_living_room'] as const

  async function resolverCoordinadorDeServicio(personaId: string): Promise<string | null> {
    if (!personaId?.trim()) return null

    // Try each experiencia until we find an active servicio
    for (const experiencia of SERVICIO_EXPERIENCIAS) {
      const servicios = await deps.listServiciosPorPersonaYExperiencia(personaId, experiencia)

      if (servicios.length === 0) continue

      // Take first active servicio
      const servicio = servicios[0]!

      // Don't return self as mentor
      if (servicio.personaId === personaId) continue

      // Get the coordinator/director of the equipo
      const mentor = await deps.getCoordinadorODirectorDeEquipo(servicio.equipoId)
      if (mentor) return mentor
    }

    return null
  }

  return { resolverCoordinadorDeServicio }
}
