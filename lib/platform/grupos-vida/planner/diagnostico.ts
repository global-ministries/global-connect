/**
 * Planner — the closing diagnosis (T8b of odd/tasks/planner-gdv.md; S18,
 * artboard 10 paso 3 and `#diagnostico`): how the season that closes ends,
 * computed from planner_tablero(origen) and planner_banco(origen).
 *
 * - Groups: the season's groups except the cancelled ones (planner_tablero
 *   already leaves out the deleted ones). Archived groups count: a season
 *   that already closed (2025 - II, S8) still has them.
 * - People, leaders and aprendices: each person once, even in two groups.
 * - Couples who lead together: two Líderes of the same group who are each
 *   other's spouse (planner_banco.conyuge_id), each couple once.
 * - Ready to lead (heuristic): the season's aprendices who do not lead any
 *   group yet.
 * - Suggested groups for the new season: the current groups plus one for
 *   every two people ready (a new group usually opens with two aprendices or
 *   an aprendiz couple): grupos + floor(listos / 2). A guide, not a limit.
 * - Where: groups by localidad ("Sin localidad" last) and people by the
 *   municipio where they live ("Sin dirección" last), most first.
 *
 * Pure: no Supabase, no React.
 */
import { personasDelGrupo } from './grupo'
import type { GrupoTablero, PersonaBanco } from './tipos'

export interface Reparto {
  readonly nombre: string
  readonly cantidad: number
}

export interface DiagnosticoCierre {
  readonly grupos: number
  readonly integrantes: number
  readonly lideres: number
  readonly aprendices: number
  readonly parejasQueLideran: number
  readonly listosParaLiderar: number
  readonly gruposSugeridos: number
  readonly porLocalidad: readonly Reparto[]
  readonly dondeViven: readonly Reparto[]
}

export const SIN_LOCALIDAD = 'Sin localidad'
export const SIN_DIRECCION_DIAGNOSTICO = 'Sin dirección'

/** The groups that count: not cancelled. */
export const gruposQueCuentan = (grupos: readonly GrupoTablero[]): GrupoTablero[] => grupos.filter((g) => g.estado_ciclo !== 'cancelado')

function repartir(nombres: readonly string[], ultimo: string): Reparto[] {
  const cuentas = new Map<string, number>()
  nombres.forEach((n) => cuentas.set(n, (cuentas.get(n) ?? 0) + 1))
  return [...cuentas.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => Number(a.nombre === ultimo) - Number(b.nombre === ultimo) || b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'))
}

export function diagnosticarCierre(grupos: readonly GrupoTablero[], banco: readonly PersonaBanco[]): DiagnosticoCierre {
  const vigentes = gruposQueCuentan(grupos)
  const fichas = new Map(banco.map((p) => [p.usuario_id, p]))
  const integrantes = new Set(vigentes.flatMap((g) => personasDelGrupo(g).map((p) => p.usuario_id)))
  const lideres = new Set(vigentes.flatMap((g) => g.lideres.map((p) => p.usuario_id)))
  const aprendices = new Set(vigentes.flatMap((g) => g.aprendices.map((p) => p.usuario_id)))
  const listos = [...aprendices].filter((id) => !lideres.has(id)).length

  const parejas = new Set<string>()
  vigentes.forEach((g) => {
    const delGrupo = new Set(g.lideres.map((p) => p.usuario_id))
    delGrupo.forEach((id) => {
      const conyuge = fichas.get(id)?.conyuge_id
      if (conyuge && conyuge !== id && delGrupo.has(conyuge)) parejas.add([id, conyuge].sort().join('|'))
    })
  })

  return {
    grupos: vigentes.length,
    integrantes: integrantes.size,
    lideres: lideres.size,
    aprendices: aprendices.size,
    parejasQueLideran: parejas.size,
    listosParaLiderar: listos,
    gruposSugeridos: vigentes.length + Math.floor(listos / 2),
    porLocalidad: repartir(
      vigentes.map((g) => g.localidad_nombre ?? SIN_LOCALIDAD),
      SIN_LOCALIDAD,
    ),
    dondeViven: repartir(
      [...integrantes].map((id) => fichas.get(id)?.municipio_nombre ?? SIN_DIRECCION_DIAGNOSTICO),
      SIN_DIRECCION_DIAGNOSTICO,
    ),
  }
}
