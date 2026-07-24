/**
 * W12 — DT-069+DT-074 — Tests for pastoral metric functions.
 * F(pastoral/metrics)
 *
 * Strict TDD: RED first, then GREEN, then REFACTOR.
 * Tests cover ESC-01–06 from pastoral-metrics spec + D27 (paused leader).
 */
import { createFakePastoralMetricsRepository, type PastoralMetricsFakeOptions } from '@/lib/platform/pastoral/metrics/metrics-repository-fake'
import {
  uno_auno_por_periodo,
  lideres_activos_por_ventana,
  triadas_por_tipo,
  alarma_gdv_sin_uno_auno_en_90_dias,
  loadPastoralDashboardCards,
  SYSTEM_CLOCK,
  type Clock,
} from '@/lib/platform/pastoral/metrics'
import type { PastoralOneOnOne } from '@/lib/platform/pastoral/types'
import type { PastoralTriada } from '@/lib/platform/pastoral/types'

// ─── Test factories ─────────────────────────────────────────────────────────

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

function makeTriada(overrides: Partial<PastoralTriada> = {}): PastoralTriada {
  const now = new Date().toISOString()
  return {
    id: '00000000-0000-0000-0000-000000000001',
    mentorOficialPersonaId: 'lider-1',
    autorPersonaId: 'autor-1',
    estado: 'active',
    contexto: 'nuevo_paso',
    motivoDisolucion: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ─── Clock helpers ──────────────────────────────────────────────────────────

function frozenClock(freezeDate: string): Clock {
  return { now: () => new Date(freezeDate) }
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ─── uno_auno_por_periodo ─────────────────────────────────────────────────

describe('uno_auno_por_periodo', () => {
  it('returns empty array when no 1:1 records exist', async () => {
    const repo = createFakePastoralMetricsRepository()
    const result = await uno_auno_por_periodo(daysAgo(30), daysAgo(0), repo, false)
    expect(result).toHaveLength(0)
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

    const lider1 = result.find((r) => r.personaId === 'lider-1')
    const lider2 = result.find((r) => r.personaId === 'lider-2')

    expect(lider1?.completados).toBe(2)
    expect(lider1?.cancelados).toBe(1)
    expect(lider2?.completados).toBe(1)
    expect(lider2?.cancelados).toBe(0)
  })

  it('liveOnly=true excludes completed/cancelled records', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-hist', estado: 'completed', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-hist', estado: 'cancelled', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '3', mentorOficialPersonaId: 'lider-live', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          makeOneOnOne({ id: '4', mentorOficialPersonaId: 'lider-live', estado: 'in_progress', scheduledAt: daysAgo(5) }),
        ],
      },
    })

    const live = await uno_auno_por_periodo(daysAgo(30), daysAgo(0), repo, true)
    const historical = await uno_auno_por_periodo(daysAgo(30), daysAgo(0), repo, false)

    // Live: only scheduled + in_progress (lider-live)
    expect(live).toHaveLength(1)
    expect(live[0].personaId).toBe('lider-live')

    // Historical: includes completed/cancelled (lider-hist)
    expect(historical).toHaveLength(2)
    const histLider = historical.find((r) => r.personaId === 'lider-hist')!
    expect(histLider.completados).toBe(1)
    expect(histLider.cancelados).toBe(1)
  })

  it('returns empty when periodoInicio > periodoFin', async () => {
    const repo = createFakePastoralMetricsRepository()
    const result = await uno_auno_por_periodo(daysAgo(0), daysAgo(30), repo, false)
    expect(result).toHaveLength(0)
  })

  it('filters by mentorId when provided', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-2', estado: 'completed', completedAt: daysAgo(5) }),
        ],
      },
    })

    const filtered = await repo.unoAunoPorPeriodo({ periodoInicio: daysAgo(30), periodoFin: daysAgo(0), mentorId: 'lider-1' }, false)

    expect(filtered).toHaveLength(1)
    expect(filtered[0].personaId).toBe('lider-1')
  })

  it('D27: paused leader excluded from live but preserved in historical', async () => {
    // A leader with a paused triada but historical 1:1 records
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          // Historical completed 1:1 for lider pausado
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'paused-lider', estado: 'completed', completedAt: daysAgo(60) }),
          // Active 1:1 for normal lider
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'normal-lider', estado: 'scheduled', scheduledAt: daysAgo(5) }),
        ],
        triadas: [
          // Paused triada for paused-lider
          makeTriada({ id: 't1', mentorOficialPersonaId: 'paused-lider', estado: 'en_pausa' }),
        ],
      },
    })

    const live = await uno_auno_por_periodo(daysAgo(90), daysAgo(0), repo, true)
    const historical = await uno_auno_por_periodo(daysAgo(90), daysAgo(0), repo, false)

    // Live: only normal lider (paused lider has no active 1:1)
    const pausedLive = live.find((r) => r.personaId === 'paused-lider')
    expect(pausedLive).toBeUndefined()

    // Historical: paused lider still has their completed 1:1
    const pausedHist = historical.find((r) => r.personaId === 'paused-lider')
    expect(pausedHist).toBeDefined()
    expect(pausedHist!.completados).toBe(1)
  })
})

// ─── lideres_activos_por_ventana ──────────────────────────────────────────

describe('lideres_activos_por_ventana', () => {
  it('returns leaders with active 1:1s and triadas', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-1', estado: 'in_progress', scheduledAt: daysAgo(3) }),
        ],
        triadas: [
          makeTriada({ id: 't1', mentorOficialPersonaId: 'lider-1', estado: 'active' }),
        ],
      },
    })

    const result = await lideres_activos_por_ventana(daysAgo(30), daysAgo(0), repo)

    const lider1 = result.find((r) => r.liderId === 'lider-1')
    expect(lider1?.unoAunoCount).toBe(2)
    expect(lider1?.triadaCount).toBe(1)
  })

  it('excludes disbanded triadas', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [],
        triadas: [
          makeTriada({ id: 't1', mentorOficialPersonaId: 'lider-1', estado: 'disbanded' }),
        ],
      },
    })

    const result = await lideres_activos_por_ventana(daysAgo(30), daysAgo(0), repo)
    expect(result).toHaveLength(0)
  })

  it('includes en_pausa triadas (paused but not disbanded)', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [],
        triadas: [
          makeTriada({ id: 't1', mentorOficialPersonaId: 'lider-1', estado: 'en_pausa' }),
        ],
      },
    })

    const result = await lideres_activos_por_ventana(daysAgo(30), daysAgo(0), repo)
    expect(result).toHaveLength(1)
    expect(result[0].triadaCount).toBe(1)
  })

  it('returns empty when window start > end', async () => {
    const repo = createFakePastoralMetricsRepository()
    const result = await lideres_activos_por_ventana(daysAgo(0), daysAgo(30), repo)
    expect(result).toHaveLength(0)
  })

  it('sorts by total activity descending', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          // lider-a: 1 uno + 1 triada = 2 total
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-a', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          // lider-b: 2 unos + 1 triada = 3 total (should be first)
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'lider-b', estado: 'scheduled', scheduledAt: daysAgo(5) }),
          makeOneOnOne({ id: '3', mentorOficialPersonaId: 'lider-b', estado: 'scheduled', scheduledAt: daysAgo(5) }),
        ],
        triadas: [
          makeTriada({ id: 't1', mentorOficialPersonaId: 'lider-a', estado: 'active' }),
          makeTriada({ id: 't2', mentorOficialPersonaId: 'lider-b', estado: 'active' }),
        ],
      },
    })

    const result = await lideres_activos_por_ventana(daysAgo(30), daysAgo(0), repo)
    // lider-b: 2 unos + 1 triada = 3; lider-a: 1 uno + 1 triada = 2
    expect(result[0].liderId).toBe('lider-b')
    expect(result[0].unoAunoCount).toBe(2)
    expect(result[0].triadaCount).toBe(1)
  })
})

// ─── triadas_por_tipo ─────────────────────────────────────────────────────

describe('triadas_por_tipo', () => {
  it('groups triadas by contexto type', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        triadas: [
          makeTriada({ id: 't1', contexto: 'nuevo_paso' }),
          makeTriada({ id: 't2', contexto: 'nuevo_paso' }),
          makeTriada({ id: 't3', contexto: 'simultaneidad' }),
        ],
      },
    })

    const result = await triadas_por_tipo(repo)

    const nuevoPaso = result.find((r) => r.tipo === 'nuevo_paso')
    const simultaneidad = result.find((r) => r.tipo === 'simultaneidad')

    expect(nuevoPaso?.count).toBe(2)
    expect(simultaneidad?.count).toBe(1)
  })

  it('returns empty when no triadas exist', async () => {
    const repo = createFakePastoralMetricsRepository()
    const result = await triadas_por_tipo(repo)
    expect(result).toHaveLength(0)
  })

  it('excludes disbanded triadas', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        triadas: [
          makeTriada({ id: 't1', contexto: 'nuevo_paso', estado: 'disbanded' }),
          makeTriada({ id: 't2', contexto: 'simultaneidad', estado: 'active' }),
        ],
      },
    })

    const result = await triadas_por_tipo(repo)
    expect(result).toHaveLength(1)
    expect(result[0].tipo).toBe('simultaneidad')
  })
})

// ─── alarma_gdv_sin_uno_auno_en_90_dias ──────────────────────────────────

describe('alarma_gdv_sin_uno_auno_en_90_dias', () => {
  it('returns empty when all leaders have recent 1:1s', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [
          { id: 'gdv-1', liderPersonaId: 'lider-1' },
        ],
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: daysAgo(30) }),
        ],
      },
    })

    const result = await alarma_gdv_sin_uno_auno_en_90_dias('lider-1', repo, SYSTEM_CLOCK)
    expect(result).toHaveLength(0)
  })

  it('returns GDV whose leader has no 1:1 in >90 days', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [
          { id: 'gdv-1', liderPersonaId: 'lider-1' },
          { id: 'gdv-2', liderPersonaId: 'lider-2' },
        ],
        oneOnOnes: [
          // lider-1 has NO 1:1 at all — alarm for gdv-1
          // lider-2 has old 1:1 (100 days ago) — alarm for gdv-2
        ],
      },
    })

    const result = await alarma_gdv_sin_uno_auno_en_90_dias('lider-1', repo, SYSTEM_CLOCK)
    // Actor only sees their own GDV (gdv-1) since lider-1 has no 1:1s
    expect(result).toHaveLength(1)
    expect(result[0].gdvsGrupoId).toBe('gdv-1')
    expect(result[0].diasSinUnoAuno).toBe(999) // Never had a 1:1
  })

  it('DT-073: actor only sees their own alarms (actor scoping via auth.uid())', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [
          { id: 'gdv-actor', liderPersonaId: 'actor-lider' },
          { id: 'gdv-other', liderPersonaId: 'other-lider' },
        ],
        oneOnOnes: [
          // actor's own GDV — old 1:1 → alarm
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'actor-lider', estado: 'completed', completedAt: daysAgo(100) }),
          // other lider — old 1:1 → alarm but actor shouldn't see it
          makeOneOnOne({ id: '2', mentorOficialPersonaId: 'other-lider', estado: 'completed', completedAt: daysAgo(100) }),
        ],
      },
    })

    const result = await alarma_gdv_sin_uno_auno_en_90_dias('actor-lider', repo, SYSTEM_CLOCK)
    // Actor only sees their own GDV alarm (gdv-actor)
    expect(result).toHaveLength(1)
    expect(result[0].gdvsGrupoId).toBe('gdv-actor')
  })

  it('returns empty when actorPersonaId is blank', async () => {
    const repo = createFakePastoralMetricsRepository()
    const result = await alarma_gdv_sin_uno_auno_en_90_dias('', repo, SYSTEM_CLOCK)
    expect(result).toHaveLength(0)
  })

  it('calculates correct days since last 1:1', async () => {
    const clock = frozenClock('2026-07-23T00:00:00.000Z')
    const repo = createFakePastoralMetricsRepository({
      seed: {
        gruposVida: [
          { id: 'gdv-1', liderPersonaId: 'lider-1' },
        ],
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: '2026-04-15T00:00:00.000Z' }), // ~99 days ago
        ],
      },
    })

    const result = await alarma_gdv_sin_uno_auno_en_90_dias('lider-1', repo, clock)
    expect(result).toHaveLength(1)
    expect(result[0].diasSinUnoAuno).toBeGreaterThanOrEqual(99)
  })
})

// ─── loadPastoralDashboardCards ─────────────────────────────────────────────

describe('loadPastoralDashboardCards', () => {
  it('loads all 4 cards together', async () => {
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'completed', completedAt: daysAgo(5) }),
        ],
        triadas: [
          makeTriada({ id: 't1', contexto: 'nuevo_paso' }),
        ],
        gruposVida: [
          { id: 'gdv-1', liderPersonaId: 'lider-1' },
        ],
      },
    })

    const cards = await loadPastoralDashboardCards('lider-1', repo, SYSTEM_CLOCK)

    expect(cards.unoAunoPorPeriodo).toBeDefined()
    expect(cards.lideresActivos).toBeDefined()
    expect(cards.triadasPorTipo).toBeDefined()
    expect(cards.alarmasGdv).toBeDefined()
    expect(Array.isArray(cards.unoAunoPorPeriodo)).toBe(true)
    expect(Array.isArray(cards.lideresActivos)).toBe(true)
    expect(Array.isArray(cards.triadasPorTipo)).toBe(true)
    expect(Array.isArray(cards.alarmasGdv)).toBe(true)
  })

  it('uses custom date range when provided', async () => {
    // Note: loadPastoralDashboardCards uses liveOnly=true, so only active states count.
    // Use scheduledAt within the window for live metrics.
    const repo = createFakePastoralMetricsRepository({
      seed: {
        oneOnOnes: [
          makeOneOnOne({ id: '1', mentorOficialPersonaId: 'lider-1', estado: 'scheduled', scheduledAt: '2026-01-15T00:00:00.000Z' }),
        ],
      },
    })

    const cards = await loadPastoralDashboardCards(
      'lider-1',
      repo,
      SYSTEM_CLOCK,
      '2026-01-01',
      '2026-01-31',
    )

    // Should include the scheduled 1:1 within the custom date range
    expect(cards.unoAunoPorPeriodo.some((r) => r.personaId === 'lider-1')).toBe(true)
  })
})
