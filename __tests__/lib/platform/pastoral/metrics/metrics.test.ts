import { createFakePastoralMetricsRepository } from '@/lib/platform/pastoral/metrics/metrics-repository-fake'
import {
  alarma_gdv_sin_uno_auno_en_90_dias,
  lideres_activos_por_ventana,
  loadPastoralDashboardCards,
  SYSTEM_CLOCK,
  uno_auno_por_periodo,
  type Clock,
} from '@/lib/platform/pastoral/metrics'
import type { PastoralOneOnOne } from '@/lib/platform/pastoral/types'

function makeOneOnOne(overrides: Partial<PastoralOneOnOne> = {}): PastoralOneOnOne {
  const now = new Date().toISOString()
  return {
    id: '00000000-0000-0000-0000-000000000001',
    mentorOficialPersonaId: 'lider-1',
    autorPersonaId: 'autor-1',
    estado: 'completed',
    scheduledAt: null,
    completedAt: now,
    motivoCancelacion: null,
    resumen: null,
    motivoNoRealizado: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function frozenClock(freezeDate: string): Clock {
  return { now: () => new Date(freezeDate) }
}

function daysAgo(n: number): string {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString().slice(0, 10)
}

describe('uno_auno_por_periodo', () => {
  it('returns empty array when no 1:1 records exist', async () => {
    const repo = createFakePastoralMetricsRepository()

    await expect(uno_auno_por_periodo(daysAgo(30), daysAgo(0), repo, false)).resolves.toEqual([])
  })

  it('counts completed and cancelled separately per mentor', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '3', mentorOficialPersonaId: 'lider-1', estado: 'cancelled', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '4', mentorOficialPersonaId: 'lider-2', estado: 'completed', completedAt: daysAgo(5) }),
        ],
      },
    })

    const result = await uno_auno_por_periodo(daysAgo(30), daysAgo(0), repo, false)

    expect(result.find((item) => item.personaId === 'lider-1')).toEqual({ personaId: 'lider-1', completados: 2, cancelados: 1 })
    expect(result.find((item) => item.personaId === 'lider-2')).toEqual({ personaId: 'lider-2', completados: 1, cancelados: 0 })
  })

  it('liveOnly=true excludes completed and cancelled records', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-hist', estado: 'completed', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-hist', estado: 'cancelled', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '3', mentorOficialPersonaId: 'lider-live', estado: 'scheduled', scheduledAt: daysAgo(5) }),
        ],
      },
    })

    const result = await uno_auno_por_periodo(daysAgo(30), daysAgo(0), repo, true)

    expect(result).toEqual([{ personaId: 'lider-live', completados: 0, cancelados: 0 }])
  })

  it('returns empty when the period start is after the period end', async () => {
    const repo = createFakePastoralMetricsRepository()

    await expect(uno_auno_por_periodo(daysAgo(0), daysAgo(30), repo, false)).resolves.toEqual([])
  })
})

describe('lideres_activos_por_ventana', () => {
  it('returns leaders with active 1:1 sessions only', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-1', estado: 'in_progress', scheduledAt: daysAgo(3) }),
        ],
      },
    })

    await expect(lideres_activos_por_ventana(daysAgo(30), daysAgo(0), repo)).resolves.toEqual([
      { liderId: 'lider-1', unoAunoCount: 2 },
    ])
  })

  it('returns empty when the window start is after the window end', async () => {
    const repo = createFakePastoralMetricsRepository()

    await expect(lideres_activos_por_ventana(daysAgo(0), daysAgo(30), repo)).resolves.toEqual([])
  })

  it('sorts by 1:1 activity descending', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-a', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-b', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          makeOneOnOne({ id: '3', mentorOficialPersonaId: 'lider-b', estado: 'scheduled', scheduledAt: daysAgo(5) }),
        ],
      },
    })

    const result = await lideres_activos_por_ventana(daysAgo(30), daysAgo(0), repo)

    expect(result).toEqual([
      { liderId: 'lider-b', unoAunoCount: 2 },
      { liderId: 'lider-a', unoAunoCount: 1 },
    ])
  })
})

describe('alarma_gdv_sin_uno_auno_en_90_dias', () => {
  it('returns empty when all leaders have recent 1:1s', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [{ id: 'gdv-1', liderPersonaId: 'lider-1' }],
        oneOnOnes: [makeOneOnOne({ mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: daysAgo(30) })],
      },
    })

    await expect(alarma_gdv_sin_uno_auno_en_90_dias('lider-1', repo, SYSTEM_CLOCK)).resolves.toEqual([])
  })

  it('returns only alarms visible to the actor', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [
          { id: 'gdv-actor', liderPersonaId: 'actor-lider' },
          { id: 'gdv-other', liderPersonaId: 'other-lider' },
        ],
        oneOnOnes: [],
      },
    })

    const result = await alarma_gdv_sin_uno_auno_en_90_dias('actor-lider', repo, SYSTEM_CLOCK)

    expect(result).toHaveLength(1)
    expect(result[0].gdvsGrupoId).toBe('gdv-actor')
  })

  it('returns empty when actorPersonaId is blank', async () => {
    const repo = createFakePastoralMetricsRepository()

    await expect(alarma_gdv_sin_uno_auno_en_90_dias('', repo, SYSTEM_CLOCK)).resolves.toEqual([])
  })

  it('calculates days since last 1:1 with the injected clock', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [{ id: 'gdv-1', liderPersonaId: 'lider-1' }],
        oneOnOnes: [makeOneOnOne({ mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: '2026-04-15T00:00:00.000Z' })],
      },
    })

    const result = await alarma_gdv_sin_uno_auno_en_90_dias('lider-1', repo, frozenClock('2026-07-23T00:00:00.000Z'))

    expect(result[0].diasSinUnoAuno).toBeGreaterThanOrEqual(99)
  })
})

describe('loadPastoralDashboardCards', () => {
  it('loads only the visible 1:1 and alarm cards', async () => {
    const repo = createFakePastoralMetricsRepository()

    const cards = await loadPastoralDashboardCards('lider-1', repo, SYSTEM_CLOCK)

    expect(cards).toEqual({
      unoAunoPorPeriodo: [],
      lideresActivos: [],
      alarmasGdv: [],
    })
  })
})
