/**
 * W10 — DT-059 — Taller (short-term group) mentor adapter (read-only).
 *
 * Queries active talleres de crecimiento where the person is enrolled
 * and returns the taller's líder.
 *
 * Read-only: NO writes, NO side effects.
 * Uses Dream Team servicios filtered by experiencia='talleres_crecimiento'.
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
 * Resolves the taller mentor for a persona.
 *
 * Strategy:
 * 1. Find all active servicios for the person in experiencia='talleres_crecimiento'.
 * 2. Return the líder/coordinador of the taller (if the person IS the líder,
 *    return null since they don't need a mentor from that source).
 * 3. Otherwise, return the personId of the taller's líder/coordinador.
 *
 * P1: one person can only be in ONE active taller per season.
 */
export interface GrupoCortoPlazoMentorAdapterDeps {
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
   * Gets the líder/coordinador of an equipo.
   * Returns the personaId of the active líder/coordinador.
   */
  getLiderDeEquipo(equipoId: string): Promise<string | null>
}

export function createGrupoCortoPlazoMentorAdapter(
  deps: GrupoCortoPlazoMentorAdapterDeps,
): {
  resolverLiderDeTaller(personaId: string): Promise<string | null>
} {
  const TALLERES_EXPERIENCIA = 'talleres_crecimiento'

  async function resolverLiderDeTaller(personaId: string): Promise<string | null> {
    if (!personaId?.trim()) return null

    // Find active servicios in talleres_crecimiento for this person
    const servicios = await deps.listServiciosPorPersonaYExperiencia(
      personaId,
      TALLERES_EXPERIENCIA,
    )

    if (servicios.length === 0) return null

    // P1: one person = one active taller per season — take first
    const servicio = servicios[0]!

    // Don't return self as mentor
    if (servicio.personaId === personaId) return null

    // Get the líder/coordinador of the taller equipo
    return deps.getLiderDeEquipo(servicio.equipoId)
  }

  return { resolverLiderDeTaller }
}
