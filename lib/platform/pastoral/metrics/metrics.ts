import type { Clock } from './types'
import type { PastoralMetricsRepository } from './metrics-repository'

export { type Clock } from './types'
export type { PastoralMetricsRepository } from './metrics-repository'
export type { UnoAunoPorPeriodoResult, LiderActivo, AlarmaGdvSinUnoAUno } from './types'

export const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
}

export async function uno_auno_por_periodo(
  periodoInicio: string,
  periodoFin: string,
  repository: PastoralMetricsRepository,
  liveOnly: boolean,
) {
  if (periodoInicio > periodoFin) return []
  return repository.unoAunoPorPeriodo({ periodoInicio, periodoFin }, liveOnly)
}

export async function lideres_activos_por_ventana(
  ventanaInicio: string,
  ventanaFin: string,
  repository: PastoralMetricsRepository,
) {
  if (ventanaInicio > ventanaFin) return []
  return repository.lideresActivosPorVentana({ ventanaInicio, ventanaFin })
}

export async function alarma_gdv_sin_uno_auno_en_90_dias(
  actorPersonaId: string,
  repository: PastoralMetricsRepository,
  _clock: Clock = SYSTEM_CLOCK,
) {
  if (!actorPersonaId?.trim()) return []
  void _clock
  const result = await repository.alarmaGdvSinUnoAunoEn90Dias(actorPersonaId.trim())
  return result.filter((alarm) => alarm.diasSinUnoAuno > 90)
}

export interface PastoralDashboardCards {
  readonly unoAunoPorPeriodo: ReadonlyArray<{ personaId: string; completados: number; cancelados: number }>
  readonly lideresActivos: ReadonlyArray<{ liderId: string; unoAunoCount: number }>
  readonly alarmasGdv: ReadonlyArray<{ gdvsGrupoId: string; liderId: string; diasSinUnoAuno: number }>
}

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
  const [unoAuno, lideres, alarmas] = await Promise.all([
    uno_auno_por_periodo(inicio, fin, repository, true),
    lideres_activos_por_ventana(inicio, fin, repository),
    alarma_gdv_sin_uno_auno_en_90_dias(actorPersonaId, repository, clock),
  ])

  return {
    unoAunoPorPeriodo: unoAuno,
    lideresActivos: lideres,
    alarmasGdv: alarmas,
  }
}
