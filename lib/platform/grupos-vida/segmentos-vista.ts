/**
 * Grupos de Vida — pure view model of the Segmentos list.
 *
 * Turns plain rows (segments, groups, leaders, links, general director rows)
 * into what each row of /grupos-vida/segmentos shows: the stage directors, the
 * active and pending groups, the active groups without a stage director, and
 * the reason a segment cannot be deleted. No I/O and no React: the server
 * loader (segmentos-datos.ts) reads the rows, one read per table, and the
 * client island only renders what this returns.
 *
 * "Active group" and "pending group" are the definitions of the directors page
 * (directores-vista.ts). A group counts as having a director when a link joins
 * it to a stage director of its own segment, the same rule as "Por ordenar".
 */
import {
  esGrupoActivo,
  esGrupoPendiente,
  plural,
  type EnlaceDirectorGrupo,
  type GrupoEntrada,
} from '@/lib/platform/grupos-vida/directores-vista'

export interface SegmentoBase {
  readonly id: string
  readonly nombre: string
}

/** A `segmento_lideres` row of any type. */
export interface LiderEntrada {
  readonly id: string
  readonly segmentoId: string
  readonly tipoLider: string
}

/** A `director_general_segmentos` row. */
export interface DirectorGeneralSegmentoEntrada {
  readonly segmentoId: string
}

export interface EntradaVistaSegmentos {
  readonly segmentos: readonly SegmentoBase[]
  /** Every row of `grupos`, deleted or not: any row still referencing a segment blocks its deletion. */
  readonly grupos: readonly GrupoEntrada[]
  readonly lideres: readonly LiderEntrada[]
  readonly enlaces: readonly EnlaceDirectorGrupo[]
  readonly directoresGenerales: readonly DirectorGeneralSegmentoEntrada[]
}

/** What is attached to a segment and stops it from being deleted. */
export interface AdjuntosDeSegmento {
  readonly gruposActivos: number
  /** Every group row: active, pending, inactive or soft-deleted. */
  readonly gruposTotales: number
  readonly lideres: number
  readonly directoresGenerales: number
}

export interface FilaSegmento {
  readonly id: string
  readonly nombre: string
  readonly directores: number
  readonly gruposActivos: number
  readonly gruposPendientes: number
  readonly sinDirector: number
  readonly textoDirectores: string
  readonly textoGrupos: string
  readonly textoPendientes: string
  /** `null` when every active group has a stage director. */
  readonly textoSinDirector: string | null
  /** Why the segment cannot be deleted; `null` when nothing is attached. */
  readonly bloqueo: string | null
}

export interface VistaSegmentos {
  readonly filas: readonly FilaSegmento[]
  readonly pie: string
}

const TIPO_DIRECTOR_ETAPA = 'director_etapa'

const comparar = (a: string, b: string): number => a.localeCompare(b, 'es', { sensitivity: 'base' })

function unir(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** The message shown when a segment cannot be deleted, or `null` when it can. */
export function mensajeNoSePuedeEliminar(nombre: string, adjuntos: AdjuntosDeSegmento): string | null {
  const partes: string[] = []
  const otrosGrupos = adjuntos.gruposTotales - adjuntos.gruposActivos
  if (adjuntos.gruposActivos > 0) {
    const activos = plural(adjuntos.gruposActivos, 'grupo activo', 'grupos activos')
    partes.push(otrosGrupos > 0 ? `${activos} y ${plural(otrosGrupos, 'grupo más', 'grupos más')}` : activos)
  } else if (adjuntos.gruposTotales > 0) {
    partes.push(plural(adjuntos.gruposTotales, 'grupo', 'grupos'))
  }
  if (adjuntos.lideres > 0) partes.push(plural(adjuntos.lideres, 'líder asignado', 'líderes asignados'))
  if (adjuntos.directoresGenerales > 0) {
    partes.push(plural(adjuntos.directoresGenerales, 'director general asignado', 'directores generales asignados'))
  }
  if (partes.length === 0) return null

  // "27 grupos activos y 18 grupos más" already holds an "y": with more reasons the list is comma-separated.
  return `No se puede eliminar ${nombre}: tiene ${unir(partes)}.`
}

function contar<T>(items: readonly T[], clave: (item: T) => string | null | undefined): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const item of items) {
    const k = clave(item)
    if (k) conteo.set(k, (conteo.get(k) ?? 0) + 1)
  }
  return conteo
}

export function construirVistaSegmentos(entrada: EntradaVistaSegmentos): VistaSegmentos {
  const directoresDeEtapa = entrada.lideres.filter((l) => l.tipoLider === TIPO_DIRECTOR_ETAPA)
  const segmentoDeDirector = new Map(directoresDeEtapa.map((d) => [d.id, d.segmentoId]))
  const grupoPorId = new Map(entrada.grupos.map((g) => [g.id, g]))

  const gruposConDirector = new Set<string>()
  for (const enlace of entrada.enlaces) {
    const grupo = grupoPorId.get(enlace.grupoId)
    const segmentoDelDirector = segmentoDeDirector.get(enlace.directorId)
    if (grupo && segmentoDelDirector && grupo.segmentoId === segmentoDelDirector) gruposConDirector.add(grupo.id)
  }

  const gruposTotales = contar(entrada.grupos, (g) => g.segmentoId)
  const gruposActivos = contar(entrada.grupos.filter(esGrupoActivo), (g) => g.segmentoId)
  const gruposPendientes = contar(entrada.grupos.filter(esGrupoPendiente), (g) => g.segmentoId)
  const sinDirector = contar(
    entrada.grupos.filter((g) => esGrupoActivo(g) && !gruposConDirector.has(g.id)),
    (g) => g.segmentoId,
  )
  const directores = contar(directoresDeEtapa, (d) => d.segmentoId)
  const lideres = contar(entrada.lideres, (l) => l.segmentoId)
  const generales = contar(entrada.directoresGenerales, (d) => d.segmentoId)

  const filas = [...entrada.segmentos]
    .sort((a, b) => comparar(a.nombre, b.nombre))
    .map((s): FilaSegmento => {
      const nDirectores = directores.get(s.id) ?? 0
      const nActivos = gruposActivos.get(s.id) ?? 0
      const nPendientes = gruposPendientes.get(s.id) ?? 0
      const nSinDirector = sinDirector.get(s.id) ?? 0
      return {
        id: s.id,
        nombre: s.nombre,
        directores: nDirectores,
        gruposActivos: nActivos,
        gruposPendientes: nPendientes,
        sinDirector: nSinDirector,
        textoDirectores: plural(nDirectores, 'director', 'directores'),
        textoGrupos: plural(nActivos, 'grupo activo', 'grupos activos'),
        textoPendientes: plural(nPendientes, 'pendiente', 'pendientes'),
        textoSinDirector: nSinDirector > 0 ? `${nSinDirector} sin director` : null,
        bloqueo: mensajeNoSePuedeEliminar(s.nombre, {
          gruposActivos: nActivos,
          gruposTotales: gruposTotales.get(s.id) ?? 0,
          lideres: lideres.get(s.id) ?? 0,
          directoresGenerales: generales.get(s.id) ?? 0,
        }),
      }
    })

  const totalDirectores = filas.reduce((suma, f) => suma + f.directores, 0)
  const totalActivos = filas.reduce((suma, f) => suma + f.gruposActivos, 0)
  const pie = [
    plural(filas.length, 'segmento', 'segmentos'),
    plural(totalDirectores, 'director de etapa', 'directores de etapa'),
    plural(totalActivos, 'grupo activo', 'grupos activos'),
  ].join(' · ')

  return { filas, pie }
}
