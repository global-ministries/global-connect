/**
 * W03 — DT-018 — Pastoral Triada cardinality validator.
 * D25: human cardinality is exactly 3 fixed.
 * Allows double rol_en_triada if the person has two distinct roles,
 * but total human count = 3.
 *
 * The rule: count DISTINCT personaId values.
 * Must be exactly 3.
 */
import { pastoralError, type PastoralError } from '../errors'

export interface CardalididadTriadaInput {
  readonly personaId: string
  readonly rolEnTriada: string
}

export type CardalididadTriadaResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: PastoralError }

const REQUIRED_HUMANS = 3

/**
 * Validates that the triada membership has exactly 3 distinct humans.
 * D25: double rol_en_triada is allowed if the person has two roles,
 * but the human count (distinct personaId) must be exactly 3.
 */
export function validarCardinalidadTriada(
  miembros: ReadonlyArray<CardalididadTriadaInput>,
): CardalididadTriadaResult {
  if (miembros.length === 0) {
    return {
      ok: false,
      error: pastoralError('INVALID_CARDINALITY', 'triada must have at least one member', {
        distinctHumans: 0,
        required: REQUIRED_HUMANS,
      }),
    }
  }

  const distinctPersonaIds = new Set(miembros.map((m) => m.personaId))
  const distinctHumans = distinctPersonaIds.size

  if (distinctHumans !== REQUIRED_HUMANS) {
    return {
      ok: false,
      error: pastoralError(
        'INVALID_CARDINALITY',
        `triada must have exactly ${REQUIRED_HUMANS} distinct humans`,
        { distinctHumans, required: REQUIRED_HUMANS },
      ),
    }
  }

  return { ok: true }
}
