/**
 * W12 — DT-069 — In-memory fake for PastoralMetricsRepository.
 *
 * Used in tests with synthetic datasets.
 * Mirrors the pattern of createInMemoryPastoralTriadaRepository (W07).
 */
import type { PastoralMetricsRepository, UnoAunoPeriodoFilters, LideresActivosFilters } from './metrics-repository'
import type {
  UnoAunoPorPeriodoResult,
  LiderActivo,
  TriadaPorTipoResult,
  AlarmaGdvSinUnoAUno,
} from './types'
import type { PastoralOneOnOne } from '../types'
import type { PastoralTriada } from '../types'

export interface PastoralMetricsFakeOptions {
  readonly seed?: {
    readonly oneOnOnes?: readonly PastoralOneOnOne[]
    readonly triadas?: readonly PastoralTriada[]
    /** GDV groups with their leader persona IDs */
    readonly gruposVida?: ReadonlyArray<{ readonly id: string; readonly liderPersonaId: string }>
  }
}

export function createFakePastoralMetricsRepository(
  options: PastoralMetricsFakeOptions = {},
): PastoralMetricsRepository {
  const { oneOnOnes = [], triadas = [], gruposVida = [] } = options.seed ?? {}

  // Active 1:1 states for live view
  const ACTIVE_ONE_ON_ONE_STATES = new Set(['scheduled', 'in_progress'])
  // Terminal 1:1 states for historical view
  const TERMINAL_ONE_ON_ONE_STATES = new Set(['completed', 'cancelled', 'no_realizado'])

  // Active triada states (en_pausa still counts as active for leaders)
  const ACTIVE_TRIADA_STATES = new Set(['active', 'en_pausa', 'pending_confirmation'])

  function isInPeriod(isoDate: string | null, inicio: string, fin: string): boolean {
    if (!isoDate) return false
    return isoDate >= inicio && isoDate <= fin
  }

  /**
   * Returns the date to use for period filtering.
   * - scheduled/in_progress: use scheduledAt
   * - completed/cancelled/no_realizado: use completedAt
   */
  function dateForPeriod(o: PastoralOneOnOne): string | null {
    if (ACTIVE_ONE_ON_ONE_STATES.has(o.estado)) {
      return o.scheduledAt
    }
    return o.completedAt
  }

  async function unoAunoPorPeriodo(
    filters: UnoAunoPeriodoFilters,
    liveOnly: boolean,
  ): Promise<readonly UnoAunoPorPeriodoResult[]> {
    const { periodoInicio, periodoFin, mentorId } = filters

    const filtered = oneOnOnes.filter((o) => {
      // Date filter on the appropriate date field per state
      const dateField = dateForPeriod(o)
      const dateOk = isInPeriod(dateField, periodoInicio, periodoFin)
      if (!dateOk) return false

      // Mentor filter
      if (mentorId && o.mentorOficialPersonaId !== mentorId) return false

      // State filter
      if (liveOnly) {
        return ACTIVE_ONE_ON_ONE_STATES.has(o.estado)
      } else {
        // Historical: include all non-terminal states + terminal states
        return true
      }
    })

    // Group by mentor
    const byMentor = new Map<string, { completados: number; cancelados: number }>()
    for (const o of filtered) {
      const existing = byMentor.get(o.mentorOficialPersonaId) ?? { completados: 0, cancelados: 0 }
      if (o.estado === 'completed') {
        existing.completados++
      } else if (o.estado === 'cancelled' || o.estado === 'no_realizado') {
        existing.cancelados++
      }
      byMentor.set(o.mentorOficialPersonaId, existing)
    }

    return Array.from(byMentor.entries()).map(([personaId, counts]) => ({
      personaId,
      completados: counts.completados,
      cancelados: counts.cancelados,
    }))
  }

  async function lideresActivosPorVentana(
    filters: LideresActivosFilters,
  ): Promise<readonly LiderActivo[]> {
    const { ventanaInicio, ventanaFin } = filters

    // Find leaders with active 1:1s in the window (filter by scheduledAt)
    const activeOnes = oneOnOnes.filter((o) => {
      if (!ACTIVE_ONE_ON_ONE_STATES.has(o.estado)) return false
      return isInPeriod(o.scheduledAt, ventanaInicio, ventanaFin)
    })

    // Find leaders with active triadas.
    // Triadas are state-based records (not scheduled events), so the "window"
    // concept differs from 1:1s. A triada is "active in window" if it is in an
    // active state (pending_confirmation, active, en_pausa) — the date window is
    // not strictly applicable since triadas represent ongoing relationships.
    // We count ALL non-disbanded triadas regardless of creation/update date.
    const activeTriadas = triadas.filter((t) => {
      return ACTIVE_TRIADA_STATES.has(t.estado)
    })

    // Build leader map
    const leaderMap = new Map<string, { unoAunoCount: number; triadaCount: number }>()

    for (const o of activeOnes) {
      const existing = leaderMap.get(o.mentorOficialPersonaId) ?? { unoAunoCount: 0, triadaCount: 0 }
      existing.unoAunoCount++
      leaderMap.set(o.mentorOficialPersonaId, existing)
    }

    for (const t of activeTriadas) {
      const existing = leaderMap.get(t.mentorOficialPersonaId) ?? { unoAunoCount: 0, triadaCount: 0 }
      existing.triadaCount++
      leaderMap.set(t.mentorOficialPersonaId, existing)
    }

    return Array.from(leaderMap.entries())
      .map(([liderId, counts]) => ({ liderId, ...counts }))
      .sort((a, b) => (b.unoAunoCount + b.triadaCount) - (a.unoAunoCount + a.triadaCount))
  }

  async function triadasPorTipo(): Promise<readonly TriadaPorTipoResult[]> {
    // Group by contexto — EXCLUDING disbanded (terminal state)
    const byTipo = new Map<string, number>()
    for (const t of triadas) {
      if (t.estado === 'disbanded') continue
      byTipo.set(t.contexto, (byTipo.get(t.contexto) ?? 0) + 1)
    }
    return Array.from(byTipo.entries()).map(([tipo, count]) => ({ tipo, count }))
  }

  async function alarmaGdvSinUnoAunoEn90Dias(
    actorPersonaId: string,
  ): Promise<readonly AlarmaGdvSinUnoAUno[]> {
    // Find leaders who have NOT had any completed 1:1 in the last 90 days
    const now = new Date()
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

    // Get leaders with recent completed 1:1s
    const leadersWithRecent = new Set(
      oneOnOnes
        .filter((o) => o.estado === 'completed' && o.completedAt && o.completedAt >= cutoff)
        .map((o) => o.mentorOficialPersonaId),
    )

    // DT-073: scope to GDVs the actor can see (actor is the leader)
    // The actor can only see alarms for their own GDVs
    const actorGdvs = gruposVida.filter((g) => g.liderPersonaId === actorPersonaId)

    // Return GDVs whose leaders have no recent 1:1
    const alarms: AlarmaGdvSinUnoAUno[] = []
    for (const gdv of actorGdvs) {
      if (!leadersWithRecent.has(gdv.liderPersonaId)) {
        // Calculate days since last 1:1
        const leaderOnes = oneOnOnes.filter((o) => o.mentorOficialPersonaId === gdv.liderPersonaId)
        const lastCompleted = leaderOnes
          .filter((o) => o.estado === 'completed' && o.completedAt)
          .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0]

        const dias = lastCompleted?.completedAt
          ? Math.floor((now.getTime() - new Date(lastCompleted.completedAt).getTime()) / (24 * 60 * 60 * 1000))
          : 999 // Never had a 1:1

        alarms.push({
          gdvsGrupoId: gdv.id,
          liderId: gdv.liderPersonaId,
          diasSinUnoAuno: dias,
        })
      }
    }

    return alarms
  }

  return {
    unoAunoPorPeriodo,
    lideresActivosPorVentana,
    triadasPorTipo,
    alarmaGdvSinUnoAunoEn90Dias,
  }
}
