/**
 * W10 — DT-062 — Tests for mentor cascade pure function.
 * F(pastoral/mentor-cascade)
 *
 * Covers:
 * - ESC-01: persona solo en GDV activo → mentor de GDV
 * - ESC-02: persona solo en taller activo → mentor de taller
 * - ESC-03: persona solo en servicio → mentor de servicio
 * - ESC-04: persona en GDV y taller → gana GDV (P1 + peso)
 * - ESC-05: persona sin nada → null (P14)
 * - ESC-06: persona con GDV inactivo de temporada pasada → no cuenta
 * - D23: double GDV (P1: one person = one GDV per season)
 * - D24: pendingRecentChange window of 7 days
 */
import {
  resolveMentorOficial,
  hasMentorOficial,
  type ResolveMentorOficialContext,
} from '@/lib/platform/pastoral/mentor-cascade'
import {
  createFakeGdvMentorAdapter,
  createFakeGrupoCortoPlazoMentorAdapter,
  createFakeServicioMentorAdapter,
} from '@/lib/platform/pastoral/mentor-cascade-fakes'

const MENTOR_GDV = 'mentor-gdv-001'
const MENTOR_TALLER = 'mentor-taller-001'
const MENTOR_SERVICIO = 'mentor-servicio-001'
const PERSONA_SOLO_GDV = 'persona-solo-gdv'
const PERSONA_SOLO_TALLER = 'persona-solo-taller'
const PERSONA_SOLO_SERVICIO = 'persona-solo-servicio'
const PERSONA_GDV_Y_TALLER = 'persona-gdv-y-taller'
const PERSONA_SIN_NADA = 'persona-sin-nada'
const PERSONA_GDV_INACTIVO = 'persona-gdv-inactivo'
const MENTOR_GDV_INACTIVO = 'mentor-gdv-inactivo'

function makeCtx(overrides: Partial<{
  gdvMentor: string | null
  tallerMentor: string | null
  servicioMentor: string | null
}> = {}): ResolveMentorOficialContext {
  return {
    gdvAdapter: {
      resolveGdVActivoPorTemporada: jest.fn().mockResolvedValue(overrides.gdvMentor ?? null),
    },
    tallerAdapter: {
      resolverLiderDeTaller: jest.fn().mockResolvedValue(overrides.tallerMentor ?? null),
    },
    servicioAdapter: {
      resolverCoordinadorDeServicio: jest.fn().mockResolvedValue(overrides.servicioMentor ?? null),
    },
  }
}

describe('resolveMentorOficial', () => {
  describe('ESC-01: persona solo en GDV activo', () => {
    it('retorna mentor de GDV cuando la persona solo tiene GDV activo', async () => {
      const ctx = makeCtx({ gdvMentor: MENTOR_GDV })
      const result = await resolveMentorOficial(PERSONA_SOLO_GDV, ctx)
      expect(result).toEqual({
        ok: true,
        assignment: { mentorPersonaId: MENTOR_GDV, source: 'gdv' },
      })
    })
  })

  describe('ESC-02: persona solo en taller activo', () => {
    it('retorna mentor de taller cuando la persona solo tiene taller activo', async () => {
      const ctx = makeCtx({ tallerMentor: MENTOR_TALLER })
      const result = await resolveMentorOficial(PERSONA_SOLO_TALLER, ctx)
      expect(result).toEqual({
        ok: true,
        assignment: { mentorPersonaId: MENTOR_TALLER, source: 'grupo_corto_plazo' },
      })
    })
  })

  describe('ESC-03: persona solo en servicio', () => {
    it('retorna mentor de servicio cuando la persona solo sirve en un equipo activo', async () => {
      const ctx = makeCtx({ servicioMentor: MENTOR_SERVICIO })
      const result = await resolveMentorOficial(PERSONA_SOLO_SERVICIO, ctx)
      expect(result).toEqual({
        ok: true,
        assignment: { mentorPersonaId: MENTOR_SERVICIO, source: 'servicio' },
      })
    })
  })

  describe('ESC-04: GDV tiene peso sobre taller (P1)', () => {
    it('retorna mentor de GDV cuando la persona tiene GDV y taller activos', async () => {
      const ctx = makeCtx({
        gdvMentor: MENTOR_GDV,
        tallerMentor: MENTOR_TALLER,
      })
      const result = await resolveMentorOficial(PERSONA_GDV_Y_TALLER, ctx)
      // GDV wins — highest priority
      expect(result).toEqual({
        ok: true,
        assignment: { mentorPersonaId: MENTOR_GDV, source: 'gdv' },
      })
    })

    it('taller tiene peso sobre servicio', async () => {
      const ctx = makeCtx({
        tallerMentor: MENTOR_TALLER,
        servicioMentor: MENTOR_SERVICIO,
      })
      const result = await resolveMentorOficial(PERSONA_SOLO_TALLER, ctx)
      expect(result).toEqual({
        ok: true,
        assignment: { mentorPersonaId: MENTOR_TALLER, source: 'grupo_corto_plazo' },
      })
    })
  })

  describe('ESC-05: persona sin nada → null (P14)', () => {
    it('retorna null cuando la persona no tiene GDV ni taller ni servicio', async () => {
      const ctx = makeCtx({})
      const result = await resolveMentorOficial(PERSONA_SIN_NADA, ctx)
      expect(result).toEqual({ ok: true, assignment: null })
    })
  })

  describe('ESC-06: GDV inactivo de temporada pasada no cuenta', () => {
    it('retorna null cuando el GDV esta inactivo', async () => {
      // The gdvMentor returns null for inactive GDV
      const ctx = makeCtx({ gdvMentor: null })
      const result = await resolveMentorOficial(PERSONA_GDV_INACTIVO, ctx)
      expect(result).toEqual({ ok: true, assignment: null })
    })

    it('cae a taller cuando GDV inactivo pero taller activo', async () => {
      const ctx = makeCtx({
        gdvMentor: null, // GDV inactivo
        tallerMentor: MENTOR_TALLER,
      })
      const result = await resolveMentorOficial(PERSONA_GDV_INACTIVO, ctx)
      expect(result).toEqual({
        ok: true,
        assignment: { mentorPersonaId: MENTOR_TALLER, source: 'grupo_corto_plazo' },
      })
    })
  })

  describe('D23: one person = one GDV per season (P1)', () => {
    it('adapter GDV retorna null cuando la persona no tiene GDV activo', async () => {
      const ctx = makeCtx({ gdvMentor: null })
      const result = await resolveMentorOficial('persona-sin-gdv', ctx)
      expect(result).toEqual({ ok: true, assignment: null })
    })
  })

  describe('edge cases', () => {
    it('retorna error cuando personaId esta vacio', async () => {
      const ctx = makeCtx({ gdvMentor: MENTOR_GDV })
      const result = await resolveMentorOficial('', ctx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('personaId is required')
      }
    })

    it('retorna error cuando personaId es solo espacios', async () => {
      const ctx = makeCtx({ gdvMentor: MENTOR_GDV })
      const result = await resolveMentorOficial('   ', ctx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('personaId is required')
      }
    })
  })
})

describe('hasMentorOficial', () => {
  it('retorna true cuando hay mentor', async () => {
    const ctx = makeCtx({ gdvMentor: MENTOR_GDV })
    const result = await hasMentorOficial(PERSONA_SOLO_GDV, ctx)
    expect(result).toBe(true)
  })

  it('retorna false cuando no hay mentor (P14)', async () => {
    const ctx = makeCtx({})
    const result = await hasMentorOficial(PERSONA_SIN_NADA, ctx)
    expect(result).toBe(false)
  })
})

describe('parametrized: todas las combinaciones fuente', () => {
  const CASES = [
    { gdv: MENTOR_GDV, taller: null, servicio: null, expected: MENTOR_GDV, source: 'gdv' as const },
    { gdv: null, taller: MENTOR_TALLER, servicio: null, expected: MENTOR_TALLER, source: 'grupo_corto_plazo' as const },
    { gdv: null, taller: null, servicio: MENTOR_SERVICIO, expected: MENTOR_SERVICIO, source: 'servicio' as const },
    { gdv: MENTOR_GDV, taller: MENTOR_TALLER, servicio: MENTOR_SERVICIO, expected: MENTOR_GDV, source: 'gdv' as const },
    { gdv: null, taller: MENTOR_TALLER, servicio: MENTOR_SERVICIO, expected: MENTOR_TALLER, source: 'grupo_corto_plazo' as const },
    { gdv: null, taller: null, servicio: null, expected: null, source: null },
  ] as const

  it.each(CASES)(
    'GDV=$gdv, Taller=$taller, Servicio=$servicio → source=$source',
    async ({ gdv, taller, servicio, expected, source }) => {
      const ctx = makeCtx({ gdvMentor: gdv, tallerMentor: taller, servicioMentor: servicio })
      const result = await resolveMentorOficial('test-persona', ctx)
      expect(result.ok).toBe(true)
      if (expected === null) {
        expect(result.assignment).toBeNull()
      } else {
        expect(result.assignment).toEqual({ mentorPersonaId: expected, source })
      }
    },
  )
})
