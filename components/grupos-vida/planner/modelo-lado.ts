/**
 * Planner — the view model of the Lado a lado view (T7 of
 * odd/tasks/planner-gdv.md; artboard 07; S2, S9, S10, S21, S23, S24). Pure
 * functions, no React: the origin rows with "Ya en <grupo>" / "Sin ubicar",
 * the moves of "Pasar" (role kept, spouse rule), the suggested destination,
 * the next origin group with people to place, and the fields of "Crear grupo
 * copiando este".
 */
import {
  nombrePersona,
  normalizar,
  personasDelGrupo,
  sugerirNombre,
  type DirectorGrupo,
  type GrupoTablero,
  type Localidad,
  type PersonaBanco,
  type PersonaGrupo,
  type SegmentoConDirectores,
} from '@/lib/platform/grupos-vida/planner'
import { MAXIMO_DIRECTORES, type DatosGrupo, type RolPlanner } from '@/lib/platform/grupos-vida/planner/acciones'

import { filasDelRol, horaCorta, nombresFila, planearMovimiento, rolEnGrupo, rolesGrupo, type RolGrupo } from './modelo'

/** grupo_miembros.rol → planner role: Líder → lider, Colíder → aprendiz, Miembro → miembro. */
export const ROL_DE_LISTA: Readonly<Record<RolGrupo['id'], RolPlanner>> = { lideres: 'lider', aprendices: 'aprendiz', miembros: 'miembro' }

/** Where one person of a row is in the season in planning. */
export interface UbicacionFila {
  readonly grupoId: string
  readonly grupoNombre: string
}

/** One origin row: a person, or a couple of the same role (S23). */
export interface FilaOrigen {
  readonly clave: string
  readonly nombre: string
  readonly personas: readonly PersonaGrupo[]
  readonly rol: RolPlanner
  /** The ids without a group in the season in planning. */
  readonly sinUbicar: readonly string[]
  /** The groups of the season in planning where the others are, once each. */
  readonly ubicados: readonly UbicacionFila[]
}

export interface RolOrigen {
  readonly id: RolGrupo['id']
  readonly titulo: string
  readonly filas: readonly FilaOrigen[]
}

const ubicacion = (id: string, fichas: ReadonlyMap<string, PersonaBanco>): UbicacionFila | null => {
  const ficha = fichas.get(id)
  return ficha?.grupo_actual_id ? { grupoId: ficha.grupo_actual_id, grupoNombre: ficha.grupo_actual_nombre?.trim() || 'otro grupo' } : null
}

/** The rows of a group by role, each marked with where its people are now (bank grupo_actual, draft applied). */
export function filasOrigen(grupo: GrupoTablero, fichas: ReadonlyMap<string, PersonaBanco>): RolOrigen[] {
  return rolesGrupo(grupo).map((rol) => ({
    id: rol.id,
    titulo: rol.titulo,
    filas: filasDelRol(rol.personas, fichas).map((fila): FilaOrigen => {
      const lugares = fila.personas.map((p) => ubicacion(p.usuario_id, fichas))
      const ubicados = lugares.filter((l): l is UbicacionFila => l !== null).filter((l, i, todos) => todos.findIndex((x) => x.grupoId === l.grupoId) === i)
      return {
        clave: fila.clave,
        nombre: nombresFila(fila.personas),
        personas: fila.personas,
        rol: ROL_DE_LISTA[rol.id],
        sinUbicar: fila.personas.filter((_, i) => lugares[i] === null).map((p) => p.usuario_id),
        ubicados,
      }
    }),
  }))
}

export interface ResumenOrigen {
  readonly personas: number
  readonly ubicadas: number
  readonly sinUbicar: number
}

export function resumenOrigen(grupo: GrupoTablero, fichas: ReadonlyMap<string, PersonaBanco>): ResumenOrigen {
  const personas = personasDelGrupo(grupo)
  const sinUbicar = personas.filter((p) => ubicacion(p.usuario_id, fichas) === null).length
  return { personas: personas.length, ubicadas: personas.length - sinUbicar, sinUbicar }
}

/** One move of "Pasar": who and in which role. */
export interface MovimientoLado {
  readonly usuarios: readonly string[]
  readonly rol: RolPlanner
}

export type PlanPasar =
  | {
      readonly tipo: 'mover'
      readonly movimientos: readonly MovimientoLado[]
      /** Where the spouse stays (S2), or null. */
      readonly aviso: string | null
    }
  /** A couple into a group that is not Matrimonios: someone must choose who goes. */
  | { readonly tipo: 'elegir' }

/**
 * The moves of "Pasar" for `ids` (one person or a couple row) into
 * `destino`: the spouse rule of the board (planearMovimiento, S2), then one
 * move per role so everyone keeps the role they had in `origen` (a spouse
 * who comes along and was not there takes the row's role).
 */
export function planPasar(
  ids: readonly string[],
  rol: RolPlanner,
  origen: GrupoTablero | null,
  destino: GrupoTablero,
  fichas: ReadonlyMap<string, PersonaBanco>,
): PlanPasar {
  const plan = planearMovimiento(ids, destino, fichas, null)
  if (plan.tipo === 'elegir') return plan
  const porRol = new Map<RolPlanner, string[]>()
  plan.usuarioIds.forEach((id) => {
    const suyo = (origen && rolEnGrupo(origen, id)) ?? rol
    porRol.set(suyo, [...(porRol.get(suyo) ?? []), id])
  })
  return { tipo: 'mover', movimientos: [...porRol].map(([r, usuarios]) => ({ usuarios, rol: r })), aviso: plan.aviso }
}

/**
 * The group of the season in planning where most of the origin's leaders
 * are now (then most of its people), among `candidatos`; null when nobody is
 * in one of them.
 */
export function destinoSugerido(
  origen: GrupoTablero,
  candidatos: readonly GrupoTablero[],
  fichas: ReadonlyMap<string, PersonaBanco>,
): string | null {
  const validos = new Set(candidatos.map((g) => g.grupo_id))
  const masVotado = (personas: readonly PersonaGrupo[]): string | null => {
    const votos = new Map<string, number>()
    personas.forEach((p) => {
      const grupoId = fichas.get(p.usuario_id)?.grupo_actual_id
      if (grupoId && validos.has(grupoId)) votos.set(grupoId, (votos.get(grupoId) ?? 0) + 1)
    })
    return [...votos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  return masVotado(origen.lideres) ?? masVotado(personasDelGrupo(origen))
}

/** The next group after `actualId` (wrapping) with someone to place; null when no other group has anyone. */
export function siguienteConSinUbicar(grupos: readonly GrupoTablero[], actualId: string | null, fichas: ReadonlyMap<string, PersonaBanco>): string | null {
  const inicio = grupos.findIndex((g) => g.grupo_id === actualId)
  for (let paso = 1; paso <= grupos.length; paso += 1) {
    const grupo = grupos[(inicio + paso + grupos.length) % grupos.length]
    if (grupo.grupo_id !== actualId && resumenOrigen(grupo, fichas).sinUbicar > 0) return grupo.grupo_id
  }
  return null
}

export interface Copia {
  readonly datos: DatosGrupo
  /** Directors of the origin group who are no longer eligible in the segment: not copied. */
  readonly omitidos: readonly DirectorGrupo[]
}

/**
 * "Crear grupo copiando este": name, segment, localidad, day, hour, capacity
 * and the directores de etapa still eligible in the segment. When the name is
 * already used in the segment, the suggested name (S4) or "<nombre> ·
 * <temporada>".
 */
export function datosCopia(
  origen: GrupoTablero,
  catalogo: { readonly segmentos: readonly SegmentoConDirectores[]; readonly localidades: readonly Localidad[] },
  nombresDelSegmento: readonly string[],
  temporada: string,
): Copia {
  const elegibles = new Set(catalogo.segmentos.find((s) => s.id === origen.segmento_id)?.directores.map((d) => d.usuario_id) ?? [])
  const copiados = origen.directores.filter((d) => elegibles.has(d.usuario_id))
  const omitidos = origen.directores.filter((d) => !elegibles.has(d.usuario_id))
  const usados = new Set(nombresDelSegmento.map(normalizar))
  const propio = origen.nombre.replace(/\s+/g, ' ').trim()
  const localidad = catalogo.localidades.find((l) => l.id === origen.localidad_id) ?? null
  const nombre =
    propio && !usados.has(normalizar(propio))
      ? propio
      : (sugerirNombre(localidad?.nombre ?? null, origen.segmento_nombre, nombresDelSegmento) ?? `${propio || origen.segmento_nombre} · ${temporada}`)
  const hora = horaCorta(origen.hora_reunion)
  return {
    datos: {
      nombre,
      segmento_id: origen.segmento_id,
      localidad_id: localidad?.id ?? null,
      dia_reunion: origen.dia_reunion,
      hora_reunion: hora || null,
      capacidad_maxima: origen.capacidad_maxima,
      director_etapa_ids: [...new Set(copiados.map((d) => d.usuario_id))].slice(0, MAXIMO_DIRECTORES),
    },
    omitidos,
  }
}

/** The label of a group option: "Cabudare Matrimonios 2 · Héctor y Rosa Silva". */
export function opcionGrupo(grupo: GrupoTablero, lideres: string | null): string {
  return `${grupo.nombre.trim() || grupo.segmento_nombre} · ${lideres ?? 'Sin líder'}`
}

/** Whether the group's name or people match the toolbar search. */
export const coincideGrupo = (grupo: GrupoTablero, consulta: string): boolean =>
  !consulta || [grupo.nombre, ...personasDelGrupo(grupo).map(nombrePersona)].some((t) => normalizar(t).includes(consulta))
