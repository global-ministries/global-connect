/**
 * W12 — Pastoral Metrics public API.
 */
export {
  type Clock,
  type PastoralMetricsRepository,
  type UnoAunoPorPeriodoResult,
  type LiderActivo,
  type TriadaPorTipoResult,
  type AlarmaGdvSinUnoAUno,
  type PastoralDashboardCards,
  SYSTEM_CLOCK,
  uno_auno_por_periodo,
  lideres_activos_por_ventana,
  triadas_por_tipo,
  alarma_gdv_sin_uno_auno_en_90_dias,
  loadPastoralDashboardCards,
} from './metrics'

export { createFakePastoralMetricsRepository, type PastoralMetricsFakeOptions } from './metrics-repository-fake'
export type { UnoAunoPeriodoFilters, LideresActivosFilters } from './metrics-repository'
