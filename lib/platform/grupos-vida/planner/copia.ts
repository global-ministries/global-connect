/**
 * Planner — "Copiar los grupos de <origen>" of the new-season assistant (T8b
 * of odd/tasks/planner-gdv.md; S18, artboard 10 paso 4, README A13): the
 * planner_guardar_cambios changes that copy the closing season's groups into
 * the new season.
 *
 * Each copied group is a "crear" with its own "tmp:g<N>" key (the name with
 * single spaces, segment, localidad, day, hour, capacity and only the
 * directors de etapa still eligible for its segment in planner_temporadas)
 * followed by a "mover" of its Líderes into that key (at most
 * MAXIMO_PERSONAS_POR_PASO per mover). Aprendices and members are not moved:
 * they stay in the bank, where the origin group is their suggestion. A
 * leader of two groups goes only with the first one (one person, one group
 * of the season). Cancelled groups and the segments the actor cannot edit
 * are left out with the reason. Values the save would refuse (an unknown
 * day, a bad hour, capacity 0) are left empty instead of failing the batch.
 *
 * planner_guardar_cambios takes at most MAXIMO_CAMBIOS changes and a "tmp:"
 * key only within the same call, so lotesDeCopia cuts the plan into batches
 * that keep each group whole. Pure: no Supabase, no React.
 */
import { DIAS_REUNION, LARGO_NOMBRE_GRUPO, MAXIMO_CAMBIOS, MAXIMO_DIRECTORES, MAXIMO_PERSONAS_POR_PASO, type CambioPlanner } from './acciones'
import type { GrupoTablero, SegmentoConDirectores } from './tipos'

export interface GrupoACopiar {
  readonly origenId: string
  readonly nombre: string
  /** One crear, then the movers of its Líderes. */
  readonly cambios: readonly CambioPlanner[]
}

export interface GrupoOmitido {
  readonly origenId: string
  readonly nombre: string
  readonly motivo: string
}

export interface PlanCopia {
  readonly grupos: readonly GrupoACopiar[]
  readonly omitidos: readonly GrupoOmitido[]
}

/** 'H:MM', 'HH:MM' or 'HH:MM:SS', as acciones.ts accepts it. */
const esHora = (valor: string): boolean => /^\d{1,2}:\d{2}$/.test(valor) || /^\d{1,2}:\d{2}:\d{2}$/.test(valor)

const trozos = <T>(lista: readonly T[], tamaño: number): T[][] =>
  Array.from({ length: Math.ceil(lista.length / tamaño) }, (_, i) => lista.slice(i * tamaño, (i + 1) * tamaño))

export function planCopia(grupos: readonly GrupoTablero[], segmentos: readonly SegmentoConDirectores[]): PlanCopia {
  const editables = new Map(segmentos.map((s) => [s.id, new Set(s.directores.map((d) => d.usuario_id))]))
  const yaLideran = new Set<string>()
  const copiados: GrupoACopiar[] = []
  const omitidos: GrupoOmitido[] = []

  for (const g of grupos) {
    const nombre = g.nombre.replace(/\s+/g, ' ').trim()
    if (g.estado_ciclo === 'cancelado') {
      omitidos.push({ origenId: g.grupo_id, nombre, motivo: 'Estaba cancelado' })
      continue
    }
    const elegibles = editables.get(g.segmento_id)
    if (!elegibles) {
      omitidos.push({ origenId: g.grupo_id, nombre, motivo: `No puedes editar el segmento ${g.segmento_nombre}` })
      continue
    }
    const clave = `tmp:g${copiados.length + 1}`
    const directores = [...new Set(g.directores.map((d) => d.usuario_id).filter((id) => elegibles.has(id)))].slice(0, MAXIMO_DIRECTORES)
    const capacidad = g.capacidad_maxima
    const crear: CambioPlanner = {
      tipo: 'crear',
      clave,
      datos: {
        nombre: (nombre || `${g.segmento_nombre} sin nombre`).slice(0, LARGO_NOMBRE_GRUPO),
        segmento_id: g.segmento_id,
        localidad_id: g.localidad_id,
        dia_reunion: DIAS_REUNION.includes(g.dia_reunion as (typeof DIAS_REUNION)[number]) ? g.dia_reunion : null,
        hora_reunion: g.hora_reunion && esHora(g.hora_reunion) ? g.hora_reunion : null,
        capacidad_maxima: capacidad !== null && Number.isInteger(capacidad) && capacidad > 0 ? capacidad : null,
        director_etapa_ids: directores,
      },
    }
    const lideres = [...new Set(g.lideres.map((p) => p.usuario_id))].filter((id) => !yaLideran.has(id))
    lideres.forEach((id) => yaLideran.add(id))
    const movers: CambioPlanner[] = trozos(lideres, MAXIMO_PERSONAS_POR_PASO).map((usuarios) => ({ tipo: 'mover', usuarios, grupo: clave, rol: 'lider' }))
    copiados.push({ origenId: g.grupo_id, nombre: crear.datos.nombre, cambios: [crear, ...movers] })
  }
  return { grupos: copiados, omitidos }
}

/** Batches of whole groups with at most `maximo` changes each (planner_guardar_cambios' limit). */
export function lotesDeCopia(grupos: readonly GrupoACopiar[], maximo: number = MAXIMO_CAMBIOS): GrupoACopiar[][] {
  const lotes: GrupoACopiar[][] = []
  let actual: GrupoACopiar[] = []
  let cambios = 0
  for (const g of grupos) {
    if (actual.length > 0 && cambios + g.cambios.length > maximo) {
      lotes.push(actual)
      actual = []
      cambios = 0
    }
    actual.push(g)
    cambios += g.cambios.length
  }
  if (actual.length > 0) lotes.push(actual)
  return lotes
}
