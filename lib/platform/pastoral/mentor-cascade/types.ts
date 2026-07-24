/**
 * W10 — Mentor cascade types.
 * Shared types for the mentor resolution cascade (D15, D23, D24).
 *
 * Cascade priority:
 * 1. GDV (Grupos de Vida) — highest priority, P1: one person = one active GDV per season
 * 2. Taller (grupo de corto plazo) — medium priority
 * 3. Servicio (Dream Team) — lowest priority
 * 4. None — returns null (P14)
 */

/** Source of the mentor assignment in the cascade. */
export type MentorSource = 'gdv' | 'grupo_corto_plazo' | 'servicio'

/**
 * Result of the mentor cascade resolution.
 * Returns null when the person has no active membership in any source (P14).
 */
export interface MentorAssignment {
  readonly mentorPersonaId: string
  readonly source: MentorSource
}

/**
 * Input context for the mentor cascade.
 * Contains the three adapters for GDV, taller, and servicio.
 */
export interface ResolveMentorCascadeContext {
  readonly gdvAdapter: GdvMentorAdapter
  readonly tallerAdapter: GrupoCortoPlazoMentorAdapter
  readonly servicioAdapter: ServicioMentorAdapter
}

/** Adapter that resolves the GDV mentor for a person. */
export interface GdvMentorAdapter {
  resolveGdVActivoPorTemporada(personaId: string): Promise<string | null>
}

/** Adapter that resolves the taller mentor for a person. */
export interface GrupoCortoPlazoMentorAdapter {
  resolverLiderDeTaller(personaId: string): Promise<string | null>
}

/** Adapter that resolves the servicio mentor for a person. */
export interface ServicioMentorAdapter {
  resolverCoordinadorDeServicio(personaId: string): Promise<string | null>
}
