import type { PastoralMetricsRepository, UnoAunoPeriodoFilters, LideresActivosFilters } from './metrics-repository'
import type {
  UnoAunoPorPeriodoResult,
  LiderActivo,
  AlarmaGdvSinUnoAUno,
} from './types'
import type { PastoralOneOnOne } from '../types'

export interface PastoralMetricsFakeOptions {
  readonly seed?: {
    readonly oneOnOnes?: readonly PastoralOneOnOne[]
    readonly gruposVida?: ReadonlyArray<{ readonly id: string; readonly liderPersonaId: string }>
  }
}

export function createFakePastoralMetricsRepository(
  options: PastoralMetricsFakeOptions = {},
): PastoralMetricsRepository {
  const { oneOnOnes = [], gruposVida = [] } = options.seed ?? {}
  const ACTIVE_ONE_ON_ONE_STATES = new Set(['scheduled', 'in_progress'])

  function isInPeriod(isoDate: string | null, inicio: string, fin: string): boolean {
    if (!isoDate) return false
    return isoDate >= inicio && isoDate <= fin
  }

  function dateForPeriod(oneOnOne: PastoralOneOnOne): string | null {
    if (ACTIVE_ONE_ON_ONE_STATES.has(oneOnOne.estado)) return oneOnOne.scheduledAt
    return oneOnOne.completedAt
  }

  async function unoAunoPorPeriodo(
    filters: UnoAunoPeriodoFilters,
    liveOnly: boolean,
  ): Promise<readonly UnoAunoPorPeriodoResult[]> {
    const { periodoInicio, periodoFin, mentorId } = filters
    const filtered = oneOnOnes.filter((oneOnOne) => {
      if (!isInPeriod(dateForPeriod(oneOnOne), periodoInicio, periodoFin)) return false
      if (mentorId && oneOnOne.mentorOficialPersonaId !== mentorId) return false
      return !liveOnly || ACTIVE_ONE_ON_ONE_STATES.has(oneOnOne.estado)
    })

    const byMentor = new Map<string, { completados: number; cancelados: number }>()
    for (const oneOnOne of filtered) {
      const counts = byMentor.get(oneOnOne.mentorOficialPersonaId) ?? { completados: 0, cancelados: 0 }
      if (oneOnOne.estado === 'completed') counts.completados++
      if (oneOnOne.estado === 'cancelled' || oneOnOne.estado === 'no_realizado') counts.cancelados++
      byMentor.set(oneOnOne.mentorOficialPersonaId, counts)
    }

    return Array.from(byMentor.entries()).map(([personaId, counts]) => ({ personaId, ...counts }))
  }

  async function lideresActivosPorVentana(
    filters: LideresActivosFilters,
  ): Promise<readonly LiderActivo[]> {
    const activeOnes = oneOnOnes.filter((oneOnOne) => (
      ACTIVE_ONE_ON_ONE_STATES.has(oneOnOne.estado)
      && isInPeriod(oneOnOne.scheduledAt, filters.ventanaInicio, filters.ventanaFin)
    ))

    const leaderMap = new Map<string, number>()
    for (const oneOnOne of activeOnes) {
      leaderMap.set(
        oneOnOne.mentorOficialPersonaId,
        (leaderMap.get(oneOnOne.mentorOficialPersonaId) ?? 0) + 1,
      )
    }

    return Array.from(leaderMap.entries())
      .map(([liderId, unoAunoCount]) => ({ liderId, unoAunoCount }))
      .sort((a, b) => b.unoAunoCount - a.unoAunoCount)
  }

  async function alarmaGdvSinUnoAunoEn90Dias(
    actorPersonaId: string,
  ): Promise<readonly AlarmaGdvSinUnoAUno[]> {
    const now = new Date()
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const leadersWithRecent = new Set(
      oneOnOnes
        .filter((oneOnOne) => oneOnOne.estado === 'completed' && oneOnOne.completedAt && oneOnOne.completedAt >= cutoff)
        .map((oneOnOne) => oneOnOne.mentorOficialPersonaId),
    )

    return gruposVida.flatMap((gdv) => {
      if (gdv.liderPersonaId !== actorPersonaId || leadersWithRecent.has(gdv.liderPersonaId)) return []

      const lastCompleted = oneOnOnes
        .filter((oneOnOne) => oneOnOne.mentorOficialPersonaId === gdv.liderPersonaId && oneOnOne.estado === 'completed' && oneOnOne.completedAt)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0]
      const diasSinUnoAuno = lastCompleted?.completedAt
        ? Math.floor((now.getTime() - new Date(lastCompleted.completedAt).getTime()) / (24 * 60 * 60 * 1000))
        : 999

      return [{ gdvsGrupoId: gdv.id, liderId: gdv.liderPersonaId, diasSinUnoAuno }]
    })
  }

  return { unoAunoPorPeriodo, lideresActivosPorVentana, alarmaGdvSinUnoAunoEn90Dias }
}
