/**
 * Staging-shaped fixture for the "Estructura" tests: Dirección de Conexión ›
 * Grupos de Corto Plazo › four talleres (9, 6, 8 and 14 people), Dirección de
 * Experiencia with children, Dirección de Grupos de Vida with its virtual
 * (read-only) branch, and two inactive roots.
 */
import { construirArbol, type NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol, ResponsableNodo } from '@/lib/platform/dream-team/estructura-arbol'
import type { EntradaVistaEstructura } from '@/lib/platform/dream-team/estructura-vista'
import { contarUso } from '@/lib/platform/dream-team/estructura-vista'
import { personaId, type DreamTeamRol, type DreamTeamServicio } from '@/lib/platform/dream-team/types'

export const ID_CONEXION = 'dir-conexion'
export const ID_GCP = 'gcp'
export const ID_DHAH = 'dhah'
export const ID_MDH = 'mdh'
export const ID_PAREJAS = 'parejas'
export const ID_PDP = 'pdp'
export const ID_EXPERIENCIA = 'dir-experiencia'
export const ID_ESTUDIANTES = 'dir-estudiantes'
export const ID_INSIDE = 'inside-out'
export const ID_GDV = 'dir-gdv'
export const ID_GDV_SEGMENTO = 'gdv-segmento'
export const ID_GDV_GRUPO = 'gdv-grupo'
export const ID_ATRACCION = 'dir-atraccion'
export const ID_MINISTERIALES = 'dir-ministeriales'

const responsable = (nombre: string, rol: string): ResponsableNodo => ({
  personaId: personaId(`p-${nombre}`),
  nombre,
  rol,
})

function real(
  id: string,
  label: string,
  parentEquipoId?: string,
  extra: Partial<Extract<NodoEquipoArbol, { origen: 'dream_team' }>> = {},
): NodoEquipoArbol {
  return {
    origen: 'dream_team',
    id,
    label,
    parentEquipoId,
    activo: true,
    experiencia: 'talleres_crecimiento',
    responsables: [],
    ...extra,
  }
}

const nodosPlanos: readonly NodoEquipoArbol[] = [
  real(ID_CONEXION, 'Dirección de Conexión', undefined, { responsables: [responsable('Antholy Ludovic Gómez', 'director')] }),
  real(ID_GCP, 'Grupos de Corto Plazo', ID_CONEXION),
  real(ID_DHAH, 'De Hombre a Hombre', ID_GCP, {
    responsables: [responsable('Zoe Directora', 'director'), responsable('Edmir Muñoz', 'coordinador')],
  }),
  real(ID_MDH, 'Mujer de Hoy', ID_GCP, { responsables: [responsable('Edith Pérez', 'coordinador')] }),
  real(ID_PAREJAS, 'Parejas', ID_GCP, { responsables: [responsable('Ludovic Gómez', 'coordinador')] }),
  real(ID_PDP, 'Punto de Partida', ID_GCP, { responsables: [responsable('Jose Jimenez', 'coordinador')] }),
  real(ID_EXPERIENCIA, 'Dirección de Experiencia', undefined, { experiencia: 'experiencia' }),
  real(ID_ESTUDIANTES, 'Dirección de Estudiantes', ID_EXPERIENCIA, { experiencia: 'estudiantes' }),
  real(ID_INSIDE, 'Inside Out', ID_ESTUDIANTES, { experiencia: 'estudiantes' }),
  real('transit', 'Transit', ID_ESTUDIANTES, { experiencia: 'estudiantes' }),
  real('dps', 'DPS', ID_EXPERIENCIA, { experiencia: 'dps' }),
  real(ID_GDV, 'Dirección de Grupos de Vida', undefined, { experiencia: 'grupos_vida' }),
  {
    origen: 'grupos_vida',
    tipo: 'segmento',
    id: ID_GDV_SEGMENTO,
    parentEquipoId: ID_GDV,
    label: 'Segmento Hombres',
    activo: true,
    responsables: [responsable('Carlos Director', 'director_etapa')],
  },
  {
    origen: 'grupos_vida',
    tipo: 'grupo',
    id: ID_GDV_GRUPO,
    parentEquipoId: ID_GDV_SEGMENTO,
    label: 'Grupo Alfa',
    activo: true,
    responsables: [responsable('Lidia Líder', 'lider'), responsable('Colin Colíder', 'colider')],
  },
  real(ID_ATRACCION, 'Dirección de Atracción', undefined, { activo: false, experiencia: 'atraccion' }),
  real(ID_MINISTERIALES, 'Dirección de Servicios Ministeriales', undefined, {
    activo: false,
    experiencia: 'servicios_ministeriales',
  }),
]

export const arbolEstructura: readonly NodoArbol<NodoEquipoArbol>[] = construirArbol(nodosPlanos)

const ROLES_TALLER = ['director', 'coordinador', 'lider', 'voluntario', 'facilitador']

function rolesDe(equipoId: string, etiquetas: readonly string[], inactivos: readonly string[] = []): DreamTeamRol[] {
  return etiquetas.map((label) => ({
    id: `rol-${equipoId}-${label}`,
    equipoId,
    label,
    activo: !inactivos.includes(label),
  }))
}

export const rolesPorEquipoEstructura: Readonly<Record<string, readonly DreamTeamRol[]>> = {
  [ID_CONEXION]: rolesDe(ID_CONEXION, ['director', 'coordinador']),
  [ID_GCP]: rolesDe(ID_GCP, ['director', 'coordinador']),
  [ID_DHAH]: rolesDe(ID_DHAH, ROLES_TALLER, ['voluntario']),
  [ID_MDH]: rolesDe(ID_MDH, ROLES_TALLER),
  [ID_PAREJAS]: rolesDe(ID_PAREJAS, ROLES_TALLER),
  [ID_PDP]: rolesDe(ID_PDP, ROLES_TALLER),
  [ID_EXPERIENCIA]: rolesDe(ID_EXPERIENCIA, ['director']),
  [ID_GDV]: rolesDe(ID_GDV, ['director']),
  [ID_ATRACCION]: rolesDe(ID_ATRACCION, ['director']),
}

let secuencia = 0
export function servicio(
  equipoId: string,
  rol: string,
  estado: DreamTeamServicio['estado'] = 'activo',
): DreamTeamServicio {
  secuencia += 1
  return {
    id: `s-${secuencia}`,
    personaId: personaId(`persona-${secuencia}`),
    equipoId,
    rolId: `rol-${equipoId}-${rol}`,
    estado,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    motivoActual: 'admin_asignacion',
    version: 1,
  }
}

const muchos = (equipoId: string, rol: string, cantidad: number, estado: DreamTeamServicio['estado'] = 'activo') =>
  Array.from({ length: cantidad }, () => servicio(equipoId, rol, estado))

/** DHAH 9 (1 + 8, one of them in orientation), MDH 6, Parejas 8, PDP 14, Conexión's director; one retired ghost. */
export const serviciosEstructura: readonly DreamTeamServicio[] = [
  servicio(ID_CONEXION, 'director'),
  servicio(ID_DHAH, 'coordinador'),
  ...muchos(ID_DHAH, 'facilitador', 7),
  servicio(ID_DHAH, 'facilitador', 'en_orientacion'),
  ...muchos(ID_DHAH, 'facilitador', 1, 'retirado'),
  servicio(ID_MDH, 'coordinador'),
  ...muchos(ID_MDH, 'facilitador', 5),
  servicio(ID_PAREJAS, 'coordinador'),
  ...muchos(ID_PAREJAS, 'facilitador', 7),
  servicio(ID_PDP, 'coordinador'),
  ...muchos(ID_PDP, 'facilitador', 13),
]

export const talleresEstructura = {
  [ID_DHAH]: { href: '/talleres/de-hombre-a-hombre', nombre: 'De Hombre a Hombre' },
  [ID_PAREJAS]: { href: '/talleres/parejas', nombre: 'Parejas' },
}

export function entradaEstructura(overrides: Partial<EntradaVistaEstructura> = {}): EntradaVistaEstructura {
  return {
    arbol: arbolEstructura,
    rolesPorEquipo: rolesPorEquipoEstructura,
    uso: contarUso(serviciosEstructura),
    talleres: talleresEstructura,
    ...overrides,
  }
}
