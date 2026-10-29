/**
 * Estudiantes — rules of the group drawer and the "Crear grupo" form
 * (artboards 06 / 07 / 08 of design/estudiantes-asistencia): the leaders to
 * choose (G9), the groups a member can move to, how the "Agregar integrante"
 * search box becomes estudiantes_buscar_personas arguments, and the hints.
 */
import type { Experiencia, GradoEscala, GrupoGestion, PersonaRol, SubareaGestionable } from './grupos-datos'

export interface OpcionLider extends PersonaRol {
  /** Other active groups the person leads (a hint, never a block: A13). */
  readonly lidera: readonly string[]
}

const esLider = (rol: string): boolean => rol.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'lider'

/**
 * The volunteers of estudiantes_lideres_disponibles in the artboard's order:
 * leaders first, then whoever leads no other group, then A–Z.
 */
export function lideresParaElegir(
  disponibles: readonly PersonaRol[],
  grupos: readonly GrupoGestion[],
  grupoId: string | null,
): OpcionLider[] {
  const otros = grupos.filter((g) => g.activo && g.id !== grupoId)
  return disponibles
    .map((persona) => ({
      ...persona,
      lidera: otros.filter((g) => g.lideres.some((l) => l.personaId === persona.personaId)).map((g) => g.nombre),
    }))
    .sort(
      (a, b) =>
        Number(!esLider(a.rol)) - Number(!esLider(b.rol)) ||
        Number(a.lidera.length > 0) - Number(b.lidera.length > 0) ||
        a.nombre.localeCompare(b.nombre, 'es'),
    )
}

/** "Líder · sin grupo", "Entrenador · lidera 1er año · Chicas". */
export function subtituloLider(opcion: OpcionLider): string {
  return `${opcion.rol} · ${opcion.lidera.length > 0 ? `lidera ${opcion.lidera.join(', ')}` : 'sin grupo'}`
}

export interface DestinoMover {
  readonly grupoId: string
  readonly etiqueta: string
}

/**
 * Where a member of `grupo` can move (estudiantes_grupo_miembro_mover keeps
 * the ámbito and the campus): the active groups there, the same sub-área
 * first, each marked "· mismo año" when it matches.
 */
export function destinosMover(grupos: readonly GrupoGestion[], grupo: GrupoGestion): DestinoMover[] {
  return grupos
    .filter((g) => g.activo && g.id !== grupo.id && g.ambitoId === grupo.ambitoId && g.campusId === grupo.campusId)
    .sort(
      (a, b) =>
        Number(a.subareaId !== grupo.subareaId) - Number(b.subareaId !== grupo.subareaId) ||
        a.subarea.localeCompare(b.subarea, 'es') ||
        (a.anio ?? 0) - (b.anio ?? 0) ||
        a.nombre.localeCompare(b.nombre, 'es'),
    )
    .map((g) => {
      const prefijo = g.subareaId === grupo.subareaId ? '' : `${g.subarea} › `
      const mismoAnio = grupo.anio !== null && g.anio === grupo.anio ? ' · mismo año' : ''
      return { grupoId: g.id, etiqueta: `${prefijo}${g.nombre}${mismoAnio}` }
    })
}

export type ArgumentosBusqueda =
  | { readonly p_cedula: string; readonly p_telefono: string }
  | { readonly p_nombre: string }

/** A cédula ("V-31.455.102") or a phone: digits with an optional V / E / J and separators. */
const PARECE_NUMERO = /^[vej]?[\s.-]*\d[\d\s.-]*$/i

/**
 * The search box of "Agregar integrante": `null` below three characters
 * (the screen lists "Sin grupo" then); digits search the cédula and the
 * phone; anything else is a full name (the RPC compares the whole name key).
 */
export function argumentosBusqueda(consulta: string): ArgumentosBusqueda | null {
  const limpio = consulta.trim()
  if (limpio.replace(/\s/g, '').length < 3) return null
  return PARECE_NUMERO.test(limpio) ? { p_cedula: limpio, p_telefono: limpio } : { p_nombre: limpio }
}

/** Whole years at `hoy` from an ISO birth date; `null` without one. */
export function edadEn(fechaNacimiento: string | null, hoy: Date): number | null {
  if (!fechaNacimiento) return null
  const [anio, mes, dia] = fechaNacimiento.slice(0, 10).split('-').map(Number)
  if (!anio || !mes || !dia) return null
  const cumplio = hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia)
  return hoy.getFullYear() - anio - (cumplio ? 0 : 1)
}

export interface OpcionCampus {
  readonly campusId: string
  readonly campus: string
}

export interface OpcionSubarea {
  readonly subareaId: string
  readonly subarea: string
  readonly campus: readonly OpcionCampus[]
}

export interface OpcionAmbito {
  readonly ambitoId: string
  readonly ambito: string
  readonly experiencia: Experiencia
  readonly subareas: readonly OpcionSubarea[]
}

/** "Dónde" of "Crear grupo": ámbitos → sub-áreas → campuses, from estudiantes_subareas_gestionables. */
export function opcionesDonde(subareas: readonly SubareaGestionable[]): OpcionAmbito[] {
  type SubareaEnArmado = { subarea: string; campus: OpcionCampus[] }
  type AmbitoEnArmado = { ambito: string; experiencia: Experiencia; subareas: Map<string, SubareaEnArmado> }
  const ambitos = new Map<string, AmbitoEnArmado>()
  for (const s of subareas) {
    const ambito: AmbitoEnArmado = ambitos.get(s.ambitoId) ?? { ambito: s.ambito, experiencia: s.experiencia, subareas: new Map() }
    ambitos.set(s.ambitoId, ambito)
    const subarea: SubareaEnArmado = ambito.subareas.get(s.subareaId) ?? { subarea: s.subarea, campus: [] }
    ambito.subareas.set(s.subareaId, subarea)
    if (!subarea.campus.some((c) => c.campusId === s.campusId)) subarea.campus.push({ campusId: s.campusId, campus: s.campus })
  }
  return [...ambitos.entries()]
    .map(([ambitoId, a]) => ({
      ambitoId,
      ambito: a.ambito,
      experiencia: a.experiencia,
      subareas: [...a.subareas.entries()]
        .map(([subareaId, s]) => ({ subareaId, subarea: s.subarea, campus: [...s.campus].sort((x, y) => x.campus.localeCompare(y.campus, 'es')) }))
        .sort((x, y) => x.subarea.localeCompare(y.subarea, 'es')),
    }))
    .sort((x, y) => x.ambito.localeCompare(y.ambito, 'es'))
}

/** The hint under "Año escolar": the campus scale and the años of the ámbito (Q2). */
export function pistaEscala(escala: readonly GradoEscala[], campus: string, ambitoId: string, ambito: string): string {
  if (escala.length === 0) return `El campus ${campus} todavía no tiene escala escolar. Pídela a la dirección de Estudiantes.`
  const ordenada = [...escala].sort((a, b) => a.numero - b.numero)
  const delAmbito = ordenada.filter((g) => g.ambitoId === ambitoId)
  const total = `Escala del campus ${campus}: ${ordenada[0].etiqueta} a ${ordenada[ordenada.length - 1].etiqueta}.`
  if (delAmbito.length === 0) return total
  return `${total} ${ambito} va de ${delAmbito[0].etiqueta} a ${delAmbito[delAmbito.length - 1].etiqueta}.`
}
