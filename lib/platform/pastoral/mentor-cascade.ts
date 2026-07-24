/**
 * W10 — DT-057, DT-058 — Mentor cascade: pure resolveMentorOficial function.
 *
 * Implements the mentor assignment cascade (D15):
 * 1. GDV (Grupos de Vida) — highest priority
 * 2. Taller (grupo de corto plazo) — medium priority
 * 3. Servicio (Dream Team) — lowest priority
 * 4. None — returns null (P14)
 *
 * P1: one person = one active GDV per season
 * P2: automatic assignment — no confirmation required
 * P3: no rejection endpoint — person cannot reject (not in public API)
 * P14: if no GDV/taller/servicio → null (no mentor)
 *
 * Strict TDD: RED first, then GREEN, then REFACTOR.
 * Uses byte-identity seams via `as unknown as Type` where needed.
 */
import type {
  MentorAssignment,
  ResolveMentorCascadeContext,
} from './mentor-cascade/types'

export { type MentorAssignment, type MentorSource, type ResolveMentorCascadeContext } from './mentor-cascade/types'

/**
 * Context required to resolve the mentor cascade.
 */
export interface ResolveMentorOficialContext {
  readonly gdvAdapter: {
    resolveGdVActivoPorTemporada(personaId: string): Promise<string | null>
  }
  readonly tallerAdapter: {
    resolverLiderDeTaller(personaId: string): Promise<string | null>
  }
  readonly servicioAdapter: {
    resolverCoordinadorDeServicio(personaId: string): Promise<string | null>
  }
}

/**
 * Result of the mentor cascade resolution.
 */
export type ResolveMentorOficialResult =
  | { readonly ok: true; readonly assignment: MentorAssignment }
  | { readonly ok: true; readonly assignment: null } // P14: no mentor
  | { readonly ok: false; readonly error: string }

/**
 * Pure function that resolves the official mentor for a persona.
 *
 * Cascade priority (D15):
 * 1. GDV: if person is in an active GDV for the season → return GDV mentor
 * 2. Taller: else if person is in an active short-term group → return taller mentor
 * 3. Servicio: else if person serves in an active Dream Team → return servicio mentor
 * 4. None: else → null (P14)
 *
 * P1: one person can only be in ONE active GDV per season
 * P2: automatic assignment — no confirmation required
 * P3: no rejection — this function doesn't handle rejection
 * P14: if no match in any source → returns null
 *
 * @param personaId — the persona to find a mentor for
 * @param ctx — the adapter context with three adapters
 * @returns the mentor assignment or null
 */
export async function resolveMentorOficial(
  personaId: string,
  ctx: ResolveMentorOficialContext,
): Promise<ResolveMentorOficialResult> {
  if (!personaId?.trim()) {
    return { ok: false, error: 'personaId is required' }
  }

  // Step 1: Try GDV (highest priority, P1)
  const gdvMentorPersonaId = await ctx.gdvAdapter.resolveGdVActivoPorTemporada(personaId)
  if (gdvMentorPersonaId) {
    return {
      ok: true,
      assignment: { mentorPersonaId: gdvMentorPersonaId, source: 'gdv' },
    }
  }

  // Step 2: Try Taller (grupo de corto plazo)
  const tallerMentorPersonaId = await ctx.tallerAdapter.resolverLiderDeTaller(personaId)
  if (tallerMentorPersonaId) {
    return {
      ok: true,
      assignment: { mentorPersonaId: tallerMentorPersonaId, source: 'grupo_corto_plazo' },
    }
  }

  // Step 3: Try Servicio (Dream Team)
  const servicioMentorPersonaId = await ctx.servicioAdapter.resolverCoordinadorDeServicio(personaId)
  if (servicioMentorPersonaId) {
    return {
      ok: true,
      assignment: { mentorPersonaId: servicioMentorPersonaId, source: 'servicio' },
    }
  }

  // Step 4: P14 — no mentor available
  return { ok: true, assignment: null }
}

/**
 * Helper to check if a persona has an official mentor.
 */
export async function hasMentorOficial(
  personaId: string,
  ctx: ResolveMentorOficialContext,
): Promise<boolean> {
  const result = await resolveMentorOficial(personaId, ctx)
  return result.ok && result.assignment !== null
}
