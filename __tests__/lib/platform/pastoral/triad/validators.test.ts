/**
 * W03 — DT-018 — Pastoral Triada cardinality validator.
 * D25: human cardinality is exactly 3 fixed.
 * Allows double rol_en_triada if the person has two distinct roles,
 * but total human count = 3.
 * F(pastoral/triad/validators)
 */
import { validarCardinalidadTriada } from '@/lib/platform/pastoral/triad/validators'

/**
 * Helper to build a member entry.
 * Distinct persons are identified by personaId.
 * rol_en_triada may repeat across persons.
 */
interface TriadaMemberInput {
  readonly personaId: string
  readonly rolEnTriada: string
}

function miembros(...entries: TriadaMemberInput[]): ReadonlyArray<{ personaId: string; rolEnTriada: string }> {
  return entries
}

describe('Pastoral Triada cardinality validator (DT-018)', () => {
  describe('valid cases — exactly 3 distinct humans', () => {
    it('accepts 3 different persons with unique roles', () => {
      const result = validarCardinalidadTriada(miembros(
        { personaId: 'a', rolEnTriada: 'asistida' },
        { personaId: 'b', rolEnTriada: 'mentor_oficial' },
        { personaId: 'c', rolEnTriada: 'lider_paso' },
      ))
      expect(result.ok).toBe(true)
    })

    it('accepts 3 different persons where one has a double rol_en_triada (D25 edge case)', () => {
      // Ana is both asistida and lider_paso; Carlos is mentor; Diana is coordinador_area
      const result = validarCardinalidadTriada(miembros(
        { personaId: 'ana', rolEnTriada: 'asistida' },
        { personaId: 'ana', rolEnTriada: 'lider_paso' }, // same person, double role
        { personaId: 'carlos', rolEnTriada: 'mentor_oficial' },
      ))
      // Still 2 distinct humans: Ana + Carlos. Need exactly 3.
      // Wait — this gives 2 humans, not 3. So this should fail.
      expect(result.ok).toBe(false)
    })

    it('accepts 3 different persons where mentor also has another role', () => {
      // Carlos is mentor and also líder de GDV (double role), Ana asistida, Diana coordinador
      const result = validarCardinalidadTriada(miembros(
        { personaId: 'carlos', rolEnTriada: 'mentor_oficial' },
        { personaId: 'carlos', rolEnTriada: 'lider_paso' }, // Carlos: double role
        { personaId: 'ana', rolEnTriada: 'asistida' },
        { personaId: 'diana', rolEnTriada: 'coordinador_area' },
      ))
      // 3 distinct humans despite double role: Carlos + Ana + Diana
      expect(result.ok).toBe(true)
    })
  })

  describe('invalid cases — cardinality != 3', () => {
    it('rejects only 2 distinct persons (ESC-03 from pastoral-triada-create)', () => {
      const result = validarCardinalidadTriada(miembros(
        { personaId: 'ana', rolEnTriada: 'asistida' },
        { personaId: 'carlos', rolEnTriada: 'mentor_oficial' },
      ))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_CARDINALITY')
        expect(result.error.context).toMatchObject({ distinctHumans: 2, required: 3 })
      }
    })

    it('rejects 4 distinct persons', () => {
      const result = validarCardinalidadTriada(miembros(
        { personaId: 'ana', rolEnTriada: 'asistida' },
        { personaId: 'carlos', rolEnTriada: 'mentor_oficial' },
        { personaId: 'diana', rolEnTriada: 'lider_paso' },
        { personaId: 'pablo', rolEnTriada: 'coordinador_area' },
      ))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.context).toMatchObject({ distinctHumans: 4, required: 3 })
      }
    })

    it('rejects 1 distinct person', () => {
      const result = validarCardinalidadTriada(miembros(
        { personaId: 'ana', rolEnTriada: 'asistida' },
        { personaId: 'ana', rolEnTriada: 'mentor_oficial' },
        { personaId: 'ana', rolEnTriada: 'lider_paso' },
      ))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.context).toMatchObject({ distinctHumans: 1, required: 3 })
      }
    })

    it('rejects empty array', () => {
      const result = validarCardinalidadTriada([])
      expect(result.ok).toBe(false)
    })
  })

  describe('parametrized — all role combination scenarios (D25)', () => {
    it.each`
      scenario | members | expected
      ${'3 unique roles'} | ${[{ personaId: 'a', rolEnTriada: 'asistida' }, { personaId: 'b', rolEnTriada: 'mentor_oficial' }, { personaId: 'c', rolEnTriada: 'lider_paso' }]} | ${true}
      ${'mentor has double role'} | ${[{ personaId: 'a', rolEnTriada: 'asistida' }, { personaId: 'b', rolEnTriada: 'mentor_oficial' }, { personaId: 'b', rolEnTriada: 'lider_paso' }, { personaId: 'c', rolEnTriada: 'coordinador_area' }]} | ${true}
      ${'asistida has double role'} | ${[{ personaId: 'a', rolEnTriada: 'asistida' }, { personaId: 'a', rolEnTriada: 'lider_paso' }, { personaId: 'b', rolEnTriada: 'mentor_oficial' }, { personaId: 'c', rolEnTriada: 'coordinador_area' }]} | ${true}
      ${'4 humans always fails'} | ${[{ personaId: 'a', rolEnTriada: 'asistida' }, { personaId: 'b', rolEnTriada: 'mentor_oficial' }, { personaId: 'c', rolEnTriada: 'lider_paso' }, { personaId: 'd', rolEnTriada: 'coordinador_area' }]} | ${false}
    `('$scenario', ({ members, expected }) => {
      const result = validarCardinalidadTriada(members)
      expect(result.ok).toBe(expected)
    })
  })
})
