import type {
  UnoAunoPorPeriodoResult,
  LiderActivo,
  AlarmaGdvSinUnoAUno,
} from './types'

export interface UnoAunoPeriodoFilters {
  readonly periodoInicio: string
  readonly periodoFin: string
  readonly mentorId?: string
}

export interface LideresActivosFilters {
  readonly ventanaInicio: string
  readonly ventanaFin: string
}

export interface PastoralMetricsRepository {
  unoAunoPorPeriodo(
    filters: UnoAunoPeriodoFilters,
    liveOnly: boolean,
  ): Promise<readonly UnoAunoPorPeriodoResult[]>

  lideresActivosPorVentana(
    filters: LideresActivosFilters,
  ): Promise<readonly LiderActivo[]>

  alarmaGdvSinUnoAunoEn90Dias(
    actorPersonaId: string,
  ): Promise<readonly AlarmaGdvSinUnoAUno[]>
}
