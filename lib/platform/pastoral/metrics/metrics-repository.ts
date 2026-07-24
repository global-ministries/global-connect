/**
 * W12 — DT-069 — Repository interface for pastoral metrics queries.
 *
 * Abstracts the DB queries needed by the 4 pure metric functions.
 * Implementations: fake (tests) and supabase (production).
 *
 * Each method returns data ready for aggregation — the pure functions
 * in metrics.ts do the final shaping.
 */
import type {
  UnoAunoPorPeriodoResult,
  LiderActivo,
  TriadaPorTipoResult,
  AlarmaGdvSinUnoAUno,
} from './types'

// ─── Filters ────────────────────────────────────────────────────────────────

export interface UnoAunoPeriodoFilters {
  readonly periodoInicio: string // ISO date
  readonly periodoFin: string    // ISO date
  /** If provided, filter to a specific mentor */
  readonly mentorId?: string
}

export interface LideresActivosFilters {
  readonly ventanaInicio: string // ISO date
  readonly ventanaFin: string   // ISO date
}

// ─── Repository interface ───────────────────────────────────────────────────

export interface PastoralMetricsRepository {
  /**
   * Returns 1:1 counts (completed + cancelled) per mentor in the given period.
   *
   * @param filters - periodoInicio/Fin + optional mentorId
   * @param liveOnly - if true, only counts active states (scheduled, in_progress);
   *                    if false, includes terminal states (historical view, D27)
   */
  unoAunoPorPeriodo(
    filters: UnoAunoPeriodoFilters,
    liveOnly: boolean,
  ): Promise<readonly UnoAunoPorPeriodoResult[]>

  /**
   * Returns leaders who had active 1:1s or triadas in the given window.
   * "Active" means: 1:1 in scheduled/in_progress OR triada in active/en_pausa.
   *
   * @param filters - ventanaInicio/Fin
   */
  lideresActivosPorVentana(
    filters: LideresActivosFilters,
  ): Promise<readonly LiderActivo[]>

  /**
   * Returns the count of triadas grouped by their contexto type.
   */
  triadasPorTipo(): Promise<readonly TriadaPorTipoResult[]>

  /**
   * Returns GDVs whose leader has NOT had any completed 1:1 in the last 90 days.
   * Scoped to GDVs the current actor can see (via RLS / auth.uid()).
   *
   * @param actorPersonaId - the persona of the querying actor
   */
  alarmaGdvSinUnoAunoEn90Dias(
    actorPersonaId: string,
  ): Promise<readonly AlarmaGdvSinUnoAUno[]>
}
