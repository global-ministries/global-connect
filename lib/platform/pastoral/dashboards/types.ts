/**
 * W12 — Dashboard types for pastoral metrics.
 * Sibling to lib/platform/operating-core/dashboards/dashboard-types.ts.
 * Distinct from lib/dashboard/obtenerDatosDashboard.ts (F2 — untouched).
 */

// ─── Pastoral card identifiers ─────────────────────────────────────────────

export const PASTORAL_METRIC_CARDS = [
  'uno_auno_por_periodo',
  'lideres_activos_por_ventana',
  'triadas_por_tipo',
  'alarma_gdv_sin_uno_auno_en_90_dias',
] as const
export type PastoralMetricCard = (typeof PASTORAL_METRIC_CARDS)[number]

// ─── Pastoral dashboard data ───────────────────────────────────────────────

export interface PastoralDashboardData {
  readonly cards: {
    readonly unoAunoPorPeriodo: ReadonlyArray<{
      readonly personaId: string
      readonly completados: number
      readonly cancelados: number
    }>
    readonly lideresActivos: ReadonlyArray<{
      readonly liderId: string
      readonly unoAunoCount: number
      readonly triadaCount: number
    }>
    readonly triadasPorTipo: ReadonlyArray<{
      readonly tipo: string
      readonly count: number
    }>
    readonly alarmasGdv: ReadonlyArray<{
      readonly gdvsGrupoId: string
      readonly liderId: string
      readonly diasSinUnoAuno: number
    }>
  }
  /** ISO timestamp when data was generated */
  readonly generatedAt: string
  readonly flags: {
    /** True when NEXT_PUBLIC_PASTORAL_METRICS_ENABLED is 'on' */
    readonly metricsEnabled: boolean
  }
}

// ─── Load result ────────────────────────────────────────────────────────────

export type LoadPastoralDashboardResult =
  | { ok: true; data: PastoralDashboardData }
  | { ok: false; error: 'not_enabled' | 'no_actor' }
