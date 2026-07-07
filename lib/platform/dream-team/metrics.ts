import type { DreamTeamRepository } from './repository'
import type { DreamTeamEstado, DreamTeamServicio } from './types'
import { DREAM_TEAM_ESTADOS } from './types'

export interface DreamTeamMetrics {
  /** Conteo de servicios agrupados por experiencia y equipo */
  readonly servicios_por_experiencia_equipo: ReadonlyArray<{
    readonly experiencia: string
    readonly equipoId: string
    readonly count: number
  }>
  /** Conteo de servicios agrupados por estado */
  readonly servicios_por_estado: ReadonlyArray<{
    readonly estado: DreamTeamEstado
    readonly count: number
  }>
  /** Distribución de roles en servicios activos */
  readonly distribucion_roles: ReadonlyArray<{
    readonly rolId: string
    readonly experiencia: string
    readonly count: number
  }>
  /** Requisitos vencidos (NO bloquea servicio, solo reporta) */
  readonly requisitos_vencidos: ReadonlyArray<{
    readonly verificacionId: string
    readonly servicioId: string
    readonly requisitoId: string
    readonly fechaVencimiento: string
  }>
}

type MetricsReader = Pick<DreamTeamRepository, 'listServicios' | 'listRequisitoVerificaciones' | 'listEquipos'>

function experienciaForServicio(
  servicio: DreamTeamServicio,
  equipoById: ReadonlyMap<string, { readonly experiencia: string }>,
): string | undefined {
  return equipoById.get(servicio.equipoId)?.experiencia
}

function toSortedEntries<T extends Record<string, unknown>>(
  map: ReadonlyMap<string, T>,
): T[] {
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
}

/**
 * Función pura. Lee del repository y agrega.
 * NO toca DB directamente. NO escribe. Solo lee + agrega.
 */
export async function getDreamTeamMetrics(
  reader: MetricsReader,
): Promise<DreamTeamMetrics> {
  const [servicios, equipos] = await Promise.all([
    reader.listServicios({}),
    reader.listEquipos(),
  ])

  const equipoById = new Map(equipos.map((e) => [e.id, e]))

  // servicios_por_experiencia_equipo: todos los servicios, agrupados por experiencia + equipo
  const porExperienciaEquipo = new Map<string, { experiencia: string; equipoId: string; count: number }>()
  for (const s of servicios) {
    const experiencia = experienciaForServicio(s, equipoById)
    if (!experiencia) continue
    const key = `${experiencia}:${s.equipoId}`
    const current = porExperienciaEquipo.get(key) ?? { experiencia, equipoId: s.equipoId, count: 0 }
    porExperienciaEquipo.set(key, { ...current, count: current.count + 1 })
  }

  // servicios_por_estado: incluir todos los estados posibles, incluso con count 0
  const porEstado = new Map<DreamTeamEstado, { estado: DreamTeamEstado; count: number }>()
  for (const estado of DREAM_TEAM_ESTADOS) {
    porEstado.set(estado, { estado, count: 0 })
  }
  for (const s of servicios) {
    const current = porEstado.get(s.estado)!
    porEstado.set(s.estado, { ...current, count: current.count + 1 })
  }

  // distribucion_roles: solo servicios activos, agrupados por rolId + experiencia
  const porRol = new Map<string, { rolId: string; experiencia: string; count: number }>()
  for (const s of servicios) {
    if (s.estado !== 'activo') continue
    const experiencia = experienciaForServicio(s, equipoById)
    if (!experiencia) continue
    const key = `${s.rolId}:${experiencia}`
    const current = porRol.get(key) ?? { rolId: s.rolId, experiencia, count: 0 }
    porRol.set(key, { ...current, count: current.count + 1 })
  }

  // requisitos_vencidos: verificaciones con estado 'vencido' y fechaVencimiento < now
  const now = new Date().toISOString()
  const verificacionesPorServicio = await Promise.all(
    servicios.map((s) => reader.listRequisitoVerificaciones(s.id)),
  )
  const vencidos = verificacionesPorServicio
    .flat()
    .filter((v) => v.estado === 'vencido' && v.fechaVencimiento !== undefined && v.fechaVencimiento < now)
    .map((v) => ({
      verificacionId: v.id,
      servicioId: v.servicioId,
      requisitoId: v.requisitoId,
      fechaVencimiento: v.fechaVencimiento as string,
    }))
    .sort((a, b) => a.verificacionId.localeCompare(b.verificacionId))

  return {
    servicios_por_experiencia_equipo: toSortedEntries(porExperienciaEquipo),
    servicios_por_estado: toSortedEntries(porEstado),
    distribucion_roles: toSortedEntries(porRol),
    requisitos_vencidos: vencidos,
  }
}
