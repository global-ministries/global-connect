/**
 * W02 — DT-012 — Pastoral 1:1 validators tests.
 * F(pastoral/one-on-one/validators)
 * ESC-04: resumen > 500 chars → rejection.
 * ESC-05: sensitive pattern (D17, P4) → rejection.
 */
import { validarResumen } from '@/lib/platform/pastoral/one-on-one/validators'

describe('validarResumen', () => {
  describe('ESC-04: length limit', () => {
    it('accepts resumen at exactly 500 characters', () => {
      const text = 'A'.repeat(500)
      const result = validarResumen(text)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(text)
    })

    it('accepts resumen under 500 characters', () => {
      const result = validarResumen('Ana shows good progress in her spiritual walk.')
      expect(result.ok).toBe(true)
    })

    it('rejects resumen exceeding 500 characters', () => {
      const text = 'A'.repeat(501)
      const result = validarResumen(text)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_TOO_LONG')
        expect(result.message).toContain('500')
      }
    })

    it('rejects null resumen', () => {
      const result = validarResumen(null)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_TOO_LONG')
      }
    })

    it('rejects undefined resumen', () => {
      const result = validarResumen(undefined)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_TOO_LONG')
      }
    })

    it('rejects empty string', () => {
      const result = validarResumen('')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_TOO_LONG')
      }
    })

    it('rejects whitespace-only string', () => {
      const result = validarResumen('   ')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_TOO_LONG')
      }
    })
  })

  describe('ESC-05: sensitive pattern detection (D17, P4)', () => {
    it('rejects cedula', () => {
      const result = validarResumen('La persona mostró su cedula de identidad durante la sesión.')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })

    it('rejects pasaporte', () => {
      const result = validarResumen('El pasaporte está vigente hasta 2028.')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })

    it('rejects diagnostico (unaccented form — SQL CHECK uses unaccent at DB level)', () => {
      // Note: TypeScript validator uses unaccented form. The DB-level CHECK constraint
      // in M2 uses PostgreSQL unaccent extension to normalize accents.
      const result = validarResumen('Compartio que tiene un diagnostico de depresion.')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })

    it('rejects suicidio (unaccented form)', () => {
      const result = validarResumen('Expreso ideas de suicidio en la ultima sesion.')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })

    it('rejects matrimonio infiel', () => {
      const result = validarResumen('La pareja enfrenta problemas de matrimonio infiel.')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })

    it('is case-insensitive', () => {
      const result = validarResumen('DIAGNOSTICO de salud mental.')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })

    it('accepts valid resumen without sensitive patterns', () => {
      const result = validarResumen(
        'Ana muestra buen progreso espiritual. Sigue asistiendo a sus grupos de vida y ha tomado un paso de servicio.',
      )
      expect(result.ok).toBe(true)
    })

    it('word boundary prevents partial matches', () => {
      // "diagnosticado" contains "diagnost" but not the whole word "diagnostico"
      const result = validarResumen('El proceso de ser diagnosticado fue difícil.')
      expect(result.ok).toBe(true)
    })

    it('trims whitespace before validation', () => {
      const result = validarResumen('  cedula de identidad  ')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('RESUMEN_SENSITIVE_PATTERN')
      }
    })
  })
})
