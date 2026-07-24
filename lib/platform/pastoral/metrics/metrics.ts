/**
 * W12 — DT-069 — Pure pastoral metric functions (D19, D27).
 *
 * 4 pure functions with injected clock for testability:
 * - uno_auno_por_periodo
 * - lideres_activos_por_ventana
 * - triadas_por_tipo
 * - alarma_gdv_sin_uno_auno_en_90_dias
 *
 * DT-072: Historial preservado (no congelado) — liveOnly flag controls
 * whether paused leaders appear in live metrics (excluded) vs historical (included).
 *
 * DT-073: alarma_gdv uses auth.uid() for actor scoping via repository.
 *
 * Strict TDD: RED first, then GREEN, then REFACTOR.
 */
import type { Clock } from './types'
import type { PastoralMetricsRepository } from './metrics-repository'

export { type Clock } from './types'
export type { PastoralMetricsRepository } from './metrics-repository'
export { type UnoAunoPorPeriodoResult, type LiderActivo, type TriadaPorTipoResult, type AlarmaGdvSinUnoAUno } from './types'

// ─── Standard clock (system time) ─────────────────────────────────────────

export const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
}

// ─── uno_auno_por_periodo ─────────────────────────────────────────────────

/**
 * Counts completed and cancelled 1:1s per mentor in the given period.
 *
 * @param periodoInicio - ISO date string, inclusive
 * @param periodoFin    - ISO date string, inclusive
 * @param repository    - data source
 * @param liveOnly      - if true, only scheduled/in_progress (live view);
 *                        if false, includes completed/cancelled/no_realizado (historical view, D27)
 *
 * D27: A paused leader is excluded from live metrics but their historical
 * records remain visible in the historical view.
 */
export async function uno_auno_por_periodo(
  periodoInicio: string,
  periodoFin: string,
  repository: PastoralMetricsRepository,
  liveOnly: boolean,
): Promise<{ readonly personaId: string; readonly completados: number; readonly cancelados: number }[]> {
  if (periodoInicio > periodoFin) {
    return []
  }

  return repository.unoAunoPorPeriodo(
    { periodoInicio, periodoFin },
    liveOnly,
  )
}

// ─── lideres_activos_por_ventana ─────────────────────────────────────────

/**
 * Returns leaders with active 1:1s and triadas in the given time window,
 * sorted by total activity (most active first).
 *
 * @param ventanaInicio - ISO date string, inclusive
 * @param ventanaFin    - ISO date string, inclusive
 * @param repository    - data source
 *
 * A paused leader (triada en_pausa) is included because they are still
 * technically active (just paused). Only disbanded triadas are excluded.
 */
export async function lideres_activos_por_ventana(
  ventanaInicio: string,
  ventanaFin: string,
  repository: PastoralMetricsRepository,
): Promise<{ readonly liderId: string; readonly unoAunoCount: number; readonly triadaCount: number }[]> {
  if (ventanaInicio > ventanaFin) {
    return []
  }

  return repository.lideresActivosPorVentana({ ventanaInicio, ventanaFin })
}

// ─── triadas_por_tipo ─────────────────────────────────────────────────────

/**
 * Returns the distribution of pastoral triadas by their contexto type.
 *
 * Counts all non-disbanded triadas (pending_confirmation + active + en_pausa).
 * Disbanded triadas are excluded as they are in terminal state.
 */
export async function triadas_por_tipo(
  repository: PastoralMetricsRepository,
): Promise<{ readonly tipo: string; readonly count: number }[]> {
  return repository.triadasPorTipo()
}

// ─── alarma_gdv_sin_uno_auno_en_90_dias ──────────────────────────────────

/**
 * Returns GDVs whose leader has NOT had any completed 1:1 in the last 90 days.
 *
 * Uses auth.uid() to scope results to GDVs the actor can view (DT-073).
 * The repository enforces RLS filtering based on the actor's persona ID.
 *
 * @param actorPersonaId - persona of the querying actor (from auth.uid())
 * @param repository     - data source
 * @param clock         - for testability (defaults to system clock)
 *
 * Days are calculated from the most recent completed 1:1, or 999 if none exist.
 */
export async function alarma_gdv_sin_uno_auno_en_90_dias(
  actorPersonaId: string,
  repository: PastoralMetricsRepository,
  clock: Clock = SYSTEM_CLOCK,
): Promise<{ readonly gdvsGrupoId: string; readonly liderId: string; readonly diasSinUnoAuno: number }[]> {
  if (!actorPersonaId?.trim()) {
    return []
  }

  const result = await repository.alarmaGdvSinUnoAunoEn90Dias(actorPersonaId.trim())

  // Filter to only those in alarm range (>90 days)
  return result.filter((a) => a.diasSinUnoAuno > 90)
}

// ─── Dashboard data envelope ────────────────────────────────────────────────

export interface PastoralDashboardCards {
  readonly unoAunoPorPeriodo: ReadonlyArray<{ personaId: string; completados: number; cancelados: number }>
  readonly lideresActivos: ReadonlyArray<{ liderId: string; unoAunoCount: number; triadaCount: number }>
  readonly triadasPorTipo: ReadonlyArray<{ tipo: string; count: number }>
  readonly alarmasGdv: ReadonlyArray<{ gdvsGrupoId: string; liderId: string; diasSinUnoAuno: number }>
}

/**
 * Loads all 4 pastoral dashboard cards.
 *
 * @param actorPersonaId - from auth.uid()
 * @param repository     - data source
 * @param clock         - for testability
 * @param periodoInicio - ISO date for 1:1 period (default: 30 days ago)
 * @param periodoFin    - ISO date for 1:1 period (default: today)
 */
export async function loadPastoralDashboardCards(
  actorPersonaId: string,
  repository: PastoralMetricsRepository,
  clock: Clock = SYSTEM_CLOCK,
  periodoInicio?: string,
  periodoFin?: string,
): Promise<PastoralDashboardCards> {
  const now = clock.now()
  const fin = periodoFin ?? now.toISOString().slice(0, 10)
  const inicio = periodoInicio ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [unoAuno, lideres, triadas, alarmas] = await Promise.all([
    uno_auno_por_periodo(inicio, fin, repository, true),   // live view
    lideres_activos_por_ventana(inicio, fin, repository),
    triadas_por_tipo(repository),
    alarma_gdv_sin_uno_auno_en_90_dias(actorPersonaId, repository, clock),
  ])

  return {
    unoAunoPorPeriodo: unoAuno,
    lideresActivos: lideres,
    triadasPorTipo: triadas,
    alarmasGdv: alarmas,
  }
}
