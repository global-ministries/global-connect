export const PASTORAL_METRIC_CARDS = [
  'uno_auno_por_periodo',
  'lideres_activos_por_ventana',
  'alarma_gdv_sin_uno_auno_en_90_dias',
] as const
export type PastoralMetricCard = (typeof PASTORAL_METRIC_CARDS)[number]

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
    }>
    readonly alarmasGdv: ReadonlyArray<{
      readonly gdvsGrupoId: string
      readonly liderId: string
      readonly diasSinUnoAuno: number
    }>
  }
  readonly generatedAt: string
  readonly flags: {
    readonly metricsEnabled: boolean
  }
}

export type LoadPastoralDashboardResult =
  | { ok: true; data: PastoralDashboardData }
  | { ok: false; error: 'not_enabled' | 'no_actor' }
