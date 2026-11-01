/**
 * Estudiantes — the data of the leader list (/estudiantes/grupos/[grupoId],
 * C3b of odd/tasks/estudiantes-fase-b.md), turned from the RPC rows and jsonb
 * into plain serializable shapes the client island can hold.
 *
 * Sources (supabase/migrations/20261029100100_estudiantes_asistencia_rpcs.sql,
 * 20261031110000_estudiantes_sesiones.sql):
 * - estudiantes_grupo_lista(grupo, fecha, turno?): the group, the meeting and
 *   every active member with their mark, visits and representantes.
 * - estudiantes_grupo_sesiones(grupo, dias?): the meetings the group can mark
 *   (newest first) with their counts.
 * - estudiantes_grupo_historial(grupo, n?): the last meetings with marks,
 *   oldest first, and each member's mark at each.
 * - estudiantes_mis_grupos(): the groups the caller sees (entry page and the
 *   entrenador's "Grupo que estás marcando").
 *
 * Every jsonb value is read defensively: a missing or malformed field becomes
 * `null` / an empty list, never a crash of the page.
 */
import type { Database, Json } from '@/lib/supabase/database.types'

import {
  esObjeto,
  experienciaDe,
  lista,
  nombreCompleto,
  numero,
  texto,
  type EstadoIntegrante,
  type Experiencia,
  type FilaMisGrupos,
  type Objeto,
  type Representante,
} from './grupos-datos'

export type FilaSesion = Database['public']['Functions']['estudiantes_grupo_sesiones']['Returns'][number]

/** A saved mark; no mark is `null` ("Sin marcar"). */
export type Marca = 'presente' | 'ausente'

const aMarca = (valor: Json | undefined): Marca | null => (valor === 'presente' || valor === 'ausente' ? valor : null)

/** A meeting the group can mark: Transit / Inside Out by (fecha, turno), The Living Room by fecha. */
export interface Sesion {
  readonly fecha: string
  readonly turnoId: string | null
  readonly turno: string | null
  /** "HH:MM:SS". */
  readonly hora: string | null
  /** `null` until the first mark opens the meeting. */
  readonly reunionId: string | null
  readonly lugar: string | null
  readonly presentes: number
  readonly ausentes: number
  readonly visitantes: number
  readonly marcados: number
}

export interface GrupoLista {
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
  /** 0 Sunday … 6 Saturday; The Living Room. */
  readonly diaSemana: number | null
  readonly hora: string | null
}

export interface PersonaLista {
  readonly personaId: string
  readonly nombre: string
  readonly genero: string | null
  readonly telefono: string | null
  readonly fechaNacimiento: string | null
  readonly estado: EstadoIntegrante
  /** Date (ISO) they joined the group. */
  readonly desde: string | null
  readonly anio: number | null
  readonly anioEtiqueta: string | null
  readonly marca: Marca | null
  /** Instant (ISO) of the mark. */
  readonly marcadoAt: string | null
  /** Times present at the group's meetings up to this one. */
  readonly visitas: number
  /** A visitor from the 3rd visit (A2). */
  readonly sugerirConfirmar: boolean
  readonly representantes: readonly Representante[]
}

export interface ListaGrupo {
  readonly grupo: GrupoLista
  readonly fecha: string
  readonly turnoId: string | null
  readonly reunionId: string | null
  readonly lugar: string | null
  readonly puedeVerVivo: boolean
  readonly puedeGestionar: boolean
  readonly personas: readonly PersonaLista[]
}

function aPersona(objeto: Objeto): PersonaLista {
  return {
    personaId: texto(objeto, 'persona_id') ?? '',
    nombre: nombreCompleto(objeto),
    genero: texto(objeto, 'genero'),
    telefono: texto(objeto, 'telefono'),
    fechaNacimiento: texto(objeto, 'fecha_nacimiento'),
    estado: texto(objeto, 'estado') === 'visitante' ? 'visitante' : 'miembro',
    desde: texto(objeto, 'desde'),
    anio: numero(objeto, 'anio'),
    anioEtiqueta: texto(objeto, 'anio_etiqueta'),
    marca: aMarca(objeto.marca),
    marcadoAt: texto(objeto, 'marcado_at'),
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

/** The jsonb of estudiantes_grupo_lista; `null` when it carries no group. */
export function aListaGrupo(valor: Json | null): ListaGrupo | null {
  if (!esObjeto(valor ?? undefined)) return null
  const objeto = valor as Objeto
  const g = objeto.grupo
  if (!esObjeto(g)) return null
  const fecha = texto(objeto, 'fecha')
  const id = texto(g, 'id')
  if (!fecha || !id) return null
  return {
    grupo: {
      id,
      nombre: texto(g, 'nombre') ?? '',
      campusId: texto(g, 'campus_id') ?? '',
      ambitoId: texto(g, 'ambito_id') ?? '',
      ambito: texto(g, 'ambito') ?? '',
      experiencia: experienciaDe(texto(g, 'experiencia')),
      subareaId: texto(g, 'subarea_id') ?? '',
      subarea: texto(g, 'subarea') ?? '',
      anio: numero(g, 'anio'),
      anioEtiqueta: texto(g, 'anio_etiqueta'),
      zona: texto(g, 'zona'),
      diaSemana: numero(g, 'dia_semana'),
      hora: texto(g, 'hora'),
    },
    fecha,
    turnoId: texto(objeto, 'turno_id'),
    reunionId: texto(objeto, 'reunion_id'),
    lugar: texto(objeto, 'lugar'),
    puedeVerVivo: objeto.puede_ver_vivo === true,
    puedeGestionar: objeto.puede_gestionar === true,
    personas: lista(objeto.personas).map(aPersona),
  }
}

export function aSesiones(filas: readonly FilaSesion[]): Sesion[] {
  return filas.map((fila) => ({
    fecha: fila.fecha,
    turnoId: fila.turno_id ?? null,
    turno: fila.turno ?? null,
    hora: fila.hora ?? null,
    reunionId: fila.reunion_id ?? null,
    lugar: fila.lugar ?? null,
    presentes: fila.presentes ?? 0,
    ausentes: fila.ausentes ?? 0,
    visitantes: fila.visitantes ?? 0,
    marcados: fila.marcados ?? 0,
  }))
}

export interface ReunionHistorial {
  readonly reunionId: string
  readonly fecha: string
}

export interface Historial {
  /** Oldest first. */
  readonly reuniones: readonly ReunionHistorial[]
  /** Each member's mark at each meeting, in the same order. */
  readonly estados: Readonly<Record<string, readonly (Marca | null)[]>>
}

export const HISTORIAL_VACIO: Historial = { reuniones: [], estados: {} }

/** The jsonb of estudiantes_grupo_historial. */
export function aHistorial(valor: Json | null): Historial {
  if (!esObjeto(valor ?? undefined)) return HISTORIAL_VACIO
  const objeto = valor as Objeto
  const reuniones = lista(objeto.reuniones)
    .map((r) => ({ reunionId: texto(r, 'reunion_id') ?? '', fecha: texto(r, 'fecha') ?? '' }))
    .filter((r) => r.fecha !== '')
  const estados: Record<string, (Marca | null)[]> = {}
  for (const p of lista(objeto.personas)) {
    const id = texto(p, 'persona_id')
    if (!id) continue
    const marcas = Array.isArray(p.estados) ? p.estados : []
    estados[id] = reuniones.map((_, i) => aMarca(marcas[i]))
  }
  return { reuniones, estados }
}

/** A group of estudiantes_mis_grupos for the entry page and the entrenador selector. */
export interface GrupoMio {
  readonly grupoId: string
  readonly nombre: string
  readonly campusId: string
  readonly ambito: string
  readonly experiencia: Experiencia
  readonly subareaId: string
  readonly subarea: string
  /** "2do año" or the zona. */
  readonly detalle: string | null
  readonly soyLider: boolean
  readonly puedeVerVivo: boolean
  readonly puedeGestionar: boolean
  readonly miembros: number
  readonly visitantes: number
  readonly lideres: readonly string[]
}

export function aGruposMios(filas: readonly FilaMisGrupos[]): GrupoMio[] {
  return filas.map((fila) => ({
    grupoId: fila.grupo_id,
    nombre: fila.nombre,
    campusId: fila.campus_id,
    ambito: fila.ambito,
    experiencia: experienciaDe(fila.experiencia),
    subareaId: fila.subarea_id,
    subarea: fila.subarea,
    detalle: fila.anio_etiqueta ?? fila.zona ?? null,
    soyLider: fila.soy_lider === true,
    puedeVerVivo: fila.puede_ver_vivo === true,
    puedeGestionar: fila.puede_gestionar === true,
    miembros: fila.miembros ?? 0,
    visitantes: fila.visitantes ?? 0,
    lideres: lista(fila.lideres ?? undefined).map(nombreCompleto),
  }))
}
