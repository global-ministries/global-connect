/**
 * Fictitious data for the Estudiantes group management tests (C2 of
 * odd/tasks/estudiantes-fase-b.md). Every person is invented; they are minors
 * in the real screen, so no real name appears here.
 */
import type { GrupoGestion, Integrante, PersonaRol, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'

export const CAMPUS = 'c-bqto'
export const CAMPUS_OTRO = 'c-cabudare'
export const TRANSIT = 'a-transit'
export const INSIDE = 'a-inside'
export const TLR = 'a-tlr'
export const CHICAS = 's-transit-chicas'
export const CHICOS = 's-transit-chicos'
export const TLR_CHICAS = 's-tlr-chicas'

export function persona(id: string, nombre: string, rol = 'Líder'): PersonaRol {
  return { servicioId: `sv-${id}`, personaId: `p-${id}`, nombre, rol }
}

export function integrante(id: string, nombre: string, extra: Partial<Integrante> = {}): Integrante {
  return {
    personaId: id,
    nombre,
    telefono: null,
    fechaNacimiento: null,
    estado: 'miembro',
    desde: '2026-01-11',
    anioEtiqueta: '2do año',
    visitas: 0,
    sugerirConfirmar: false,
    representantes: [],
    ...extra,
  }
}

export function grupo(id: string, nombre: string, extra: Partial<GrupoGestion> = {}): GrupoGestion {
  return {
    id,
    nombre,
    campusId: CAMPUS,
    ambitoId: TRANSIT,
    ambito: 'Transit',
    experiencia: 'estudiantes',
    subareaId: CHICAS,
    subarea: 'Grupos de Chicas',
    anio: 2,
    anioEtiqueta: '2do año',
    zona: null,
    diaSemana: null,
    hora: null,
    activo: true,
    lideres: [],
    integrantes: [],
    ...extra,
  }
}

export function subarea(subareaId: string, extra: Partial<SubareaGestionable> = {}): SubareaGestionable {
  return {
    subareaId,
    subarea: subareaId === CHICOS ? 'Grupos de Chicos' : 'Grupos de Chicas',
    ambitoId: TRANSIT,
    ambito: 'Transit',
    experiencia: 'estudiantes',
    campusId: CAMPUS,
    campus: 'Barquisimeto',
    responsables: [],
    ...extra,
  }
}

/** Transit with both sub-áreas: five active groups and one deactivated. */
export const SUBAREAS_TRANSIT: readonly SubareaGestionable[] = [
  subarea(CHICAS, { responsables: [persona('lor', 'Lorena Salas', 'Director de grupo'), persona('car', 'Carmen Díaz', 'Entrenador')] }),
  subarea(CHICOS, { responsables: [persona('rau', 'Raúl Gómez', 'Director de grupo')] }),
]

export const GRUPOS_TRANSIT: readonly GrupoGestion[] = [
  grupo('g1', '1er año · Chicas', {
    anio: 1,
    anioEtiqueta: '1er año',
    lideres: [persona('fer', 'Fernanda Ochoa')],
    integrantes: [integrante('i1', 'Alejandra Acosta'), integrante('i2', 'Bárbara Bermúdez')],
  }),
  grupo('g2', '2do año · Chicas', {
    lideres: [persona('and', 'Andrea Molina'), persona('pao', 'Paola Ruiz')],
    integrantes: [
      integrante('i3', 'Camila Herrera'),
      integrante('i4', 'Sofía Linares', { estado: 'visitante', visitas: 3, sugerirConfirmar: true }),
      integrante('i5', 'Luciana Ferrer', { estado: 'visitante', visitas: 1 }),
    ],
  }),
  grupo('g3', '3er año · Chicas', { anio: 3, anioEtiqueta: '3er año', integrantes: [integrante('i6', 'Elisa Cordero')] }),
  grupo('g4', '1er año · Chicos', {
    subareaId: CHICOS,
    subarea: 'Grupos de Chicos',
    anio: 1,
    anioEtiqueta: '1er año',
    lideres: [persona('jes', 'Jesús Pacheco')],
    integrantes: [
      integrante('i7', 'Matías Paredes', { estado: 'visitante', visitas: 4, sugerirConfirmar: true }),
      integrante('i8', 'Hugo Navas'),
      integrante('i9', 'Gael Prieto'),
      integrante('i10', 'Pablo Medina'),
    ],
  }),
  grupo('g5', '2do año · Chicos', { subareaId: CHICOS, subarea: 'Grupos de Chicos' }),
  grupo('g8', 'Nuevos · Chicos', { subareaId: CHICOS, subarea: 'Grupos de Chicos', anio: 1, anioEtiqueta: '1er año', activo: false }),
]
