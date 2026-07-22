/**
 * W02 — DT-012 — Pastoral 1:1 validators.
 *
 * validarResumen: bounded to 500 chars + sensitive pattern check (D17, P4).
 * Blocks: documents (cedula, pasaporte), health diagnoses (diagnostico),
 * suicidal ideation (suicidio), unfaithful marriage references.
 *
 * ESC-04 (resumen > 500 chars) — rejection.
 * ESC-05 (sensitive pattern) — rejection.
 */

export interface ValidarResumenResult {
  readonly ok: true
  readonly value: string
}

export interface ValidarResumenError {
  readonly ok: false
  readonly code: 'RESUMEN_TOO_LONG' | 'RESUMEN_SENSITIVE_PATTERN'
  readonly message: string
}

export type ValidarResumenResultType = ValidarResumenResult | ValidarResumenError

/** D17 — max 500 characters. */
const MAX_RESUMEN_LENGTH = 500

/**
 * D17, P4: Block documents, health diagnosis, suicidal ideation,
 * unfaithful marriage references.
 * Word boundary (\b) prevents partial-word matches.
 * Note: \y (PCRE) not supported in JavaScript; \b is used.
 */
const SENSITIVE_PATTERN = /\b(cedula|pasaporte|diagnostico|suicidio|matrimonio infiel)\b/i

/**
 * Pure function — validates a resumen string for closing a 1:1.
 *
 * ESC-04: rejects if length > 500.
 * ESC-05: rejects if matches sensitive pattern (D17, P4).
 */
export function validarResumen(
  text: string | null | undefined,
): ValidarResumenResultType {
  if (text === null || text === undefined) {
    return {
      ok: false,
      code: 'RESUMEN_TOO_LONG',
      message: 'resumen is required for completion',
    }
  }

  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return {
      ok: false,
      code: 'RESUMEN_TOO_LONG',
      message: 'resumen is required for completion',
    }
  }

  if (trimmed.length > MAX_RESUMEN_LENGTH) {
    return {
      ok: false,
      code: 'RESUMEN_TOO_LONG',
      message: `resumen exceeds maximum length of ${MAX_RESUMEN_LENGTH} characters`,
    }
  }

  if (SENSITIVE_PATTERN.test(trimmed)) {
    return {
      ok: false,
      code: 'RESUMEN_SENSITIVE_PATTERN',
      message:
        'resumen must be a general report; it cannot contain sensitive personal information such as identity documents, health diagnoses, or crisis disclosures',
    }
  }

  return { ok: true, value: trimmed }
}
