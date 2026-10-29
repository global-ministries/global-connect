/**
 * Estudiantes — the data of the group management screen (/estudiantes/grupos,
 * C2 of odd/tasks/estudiantes-fase-b.md), turned from the RPC rows into plain
 * serializable shapes the client island can hold.
 *
 * Sources (supabase/migrations/20261029100100_estudiantes_asistencia_rpcs.sql,
 * 20261029130000_estudiantes_gestion_grupos.sql):
 * - estudiantes_subareas_gestionables(): the Grupos de Chicas / Chicos
 *   sub-áreas and campuses the caller manages, with their entrenadores and
 *   directores de grupo (`responsables`).
 * - estudiantes_mis_grupos(p_incluir_inactivos): the groups, with leaders.
 * - estudiantes_grupo_integrantes(grupo): members and visitors of one group,
 *   with contacts and representantes (jsonb).
 * - estudiantes_escala_campus(campus): the school scale of a campus.
 *
 * Every jsonb value is read defensively: a missing or malformed field becomes
 * `null` / an empty list, never a crash of the page.
 */
import type { Database, Json } from '@/lib/supabase/database.types'

type Funciones = Database['public']['Functions']

export type FilaSubarea = Funciones['estudiantes_subareas_gestionables']['Returns'][number]
export type FilaMisGrupos = Funciones['estudiantes_mis_grupos']['Returns'][number]
export type FilaEscala = Funciones['estudiantes_escala_campus']['Returns'][number]

/** Transit / Inside Out ("estudiantes", by año) or The Living Room (by zona, weekly meeting). */
export type Experiencia = 'estudiantes' | 'the_living_room'

/** A Dream Team servicio of a person: a leader, an entrenador, a director de grupo. */
export interface PersonaRol {
  readonly servicioId: string
  readonly personaId: string
  /** "Nombre Apellido". */
  readonly nombre: string
  readonly rol: string
}

export interface SubareaGestionable {
  readonly subareaId: string
  readonly subarea: string
  readonly ambitoId: string
  readonly ambito: string
  readonly experiencia: Experiencia
  readonly campusId: string
  readonly campus: string
  /** Entrenadores and directores de grupo of the sub-área in that campus. */
  readonly responsables: readonly PersonaRol[]
}

export interface Representante {
  readonly personaId: string
  readonly nombre: string
  readonly telefono: string | null
  /** padre, tutor, abuelo, … (relaciones_usuarios). */
  readonly tipo: string
}

export type EstadoIntegrante = 'miembro' | 'visitante'

export interface Integrante {
  readonly personaId: string
  readonly nombre: string
  readonly telefono: string | null
  readonly fechaNacimiento: string | null
  readonly estado: EstadoIntegrante
  /** Date (ISO) they joined the group. */
  readonly desde: string | null
  readonly anioEtiqueta: string | null
  readonly visitas: number
  /** A visitor from the 3rd visit (A2): "Confirmar como miembro". */
  readonly sugerirConfirmar: boolean
  readonly representantes: readonly Representante[]
}

export interface GrupoGestion {
  readonly id: string
  readonly nombre: string
  readonly campusId: string
  readonly ambitoId: string
  readonly ambito: string
  readonly experiencia: Experiencia
  readonly subareaId: string
  readonly subarea: string
  readonly anio: number | null
  readonly anioEtiqueta: string | null
  readonly zona: string | null
  /** 0 Sunday … 6 Saturday; The Living Room only. */
  readonly diaSemana: number | null
  /** "HH:MM:SS"; The Living Room only. */
  readonly hora: string | null
  readonly activo: boolean
  readonly lideres: readonly PersonaRol[]
  /** Members and visitors (estado tells them apart). */
  readonly integrantes: readonly Integrante[]
}

export interface GradoEscala {
  readonly numero: number
  readonly etiqueta: string
  /** The Transit / Inside Out node the year belongs to. */
  readonly ambitoId: string
}

type Objeto = { readonly [clave: string]: Json | undefined }

function esObjeto(valor: Json | undefined): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function lista(valor: Json | undefined): readonly Objeto[] {
  return Array.isArray(valor) ? valor.filter(esObjeto) : []
}

function texto(objeto: Objeto, clave: string): string | null {
  const valor = objeto[clave]
  return typeof valor === 'string' && valor !== '' ? valor : null
}

function numero(objeto: Objeto, clave: string): number | null {
  const valor = objeto[clave]
  return typeof valor === 'number' ? valor : null
}

function nombreCompleto(objeto: Objeto): string {
  return [texto(objeto, 'nombre'), texto(objeto, 'apellido')].filter(Boolean).join(' ')
}

function aPersonaRol(objeto: Objeto): PersonaRol {
  return {
    servicioId: texto(objeto, 'servicio_id') ?? '',
    personaId: texto(objeto, 'persona_id') ?? '',
    nombre: nombreCompleto(objeto),
    rol: texto(objeto, 'rol') ?? '',
  }
}

const experienciaDe = (valor: string | null): Experiencia => (valor === 'the_living_room' ? 'the_living_room' : 'estudiantes')

function aIntegrante(objeto: Objeto): Integrante {
  return {
    personaId: texto(objeto, 'persona_id') ?? '',
    nombre: nombreCompleto(objeto),
    telefono: texto(objeto, 'telefono'),
    fechaNacimiento: texto(objeto, 'fecha_nacimiento'),
    estado: texto(objeto, 'estado') === 'visitante' ? 'visitante' : 'miembro',
    desde: texto(objeto, 'desde'),
    anioEtiqueta: texto(objeto, 'anio_etiqueta'),
    visitas: numero(objeto, 'visitas') ?? 0,
    sugerirConfirmar: objeto.sugerir_confirmar === true,
    representantes: lista(objeto.representantes).map((r) => ({
      personaId: texto(r, 'persona_id') ?? '',
      nombre: nombreCompleto(r),
      telefono: texto(r, 'telefono'),
      tipo: texto(r, 'tipo') ?? '',
    })),
  }
}

export function aSubareas(filas: readonly FilaSubarea[]): SubareaGestionable[] {
  return filas.map((fila) => ({
    subareaId: fila.subarea_id,
    subarea: fila.subarea,
    ambitoId: fila.ambito_id,
    ambito: fila.ambito,
    experiencia: experienciaDe(fila.experiencia),
    campusId: fila.campus_id,
    campus: fila.campus,
    responsables: lista(fila.responsables).map(aPersonaRol),
  }))
}

/** A group of estudiantes_mis_grupos plus the jsonb of estudiantes_grupo_integrantes (`null` when unread). */
export function aGrupo(fila: FilaMisGrupos, integrantes: Json | null): GrupoGestion {
  const personas = esObjeto(integrantes ?? undefined) ? lista((integrantes as Objeto).personas) : []
  return {
    id: fila.grupo_id,
    nombre: fila.nombre,
    campusId: fila.campus_id,
    ambitoId: fila.ambito_id,
    ambito: fila.ambito,
    experiencia: experienciaDe(fila.experiencia),
    subareaId: fila.subarea_id,
    subarea: fila.subarea,
    anio: fila.anio ?? null,
    anioEtiqueta: fila.anio_etiqueta ?? null,
    zona: fila.zona ?? null,
    diaSemana: fila.dia_semana ?? null,
    hora: fila.hora ?? null,
    activo: fila.activo,
    lideres: lista(fila.lideres ?? undefined).map(aPersonaRol),
    integrantes: personas.map(aIntegrante),
  }
}

export function aEscala(filas: readonly FilaEscala[]): GradoEscala[] {
  return filas.map((fila) => ({ numero: fila.numero, etiqueta: fila.etiqueta, ambitoId: fila.ambito_id }))
}
