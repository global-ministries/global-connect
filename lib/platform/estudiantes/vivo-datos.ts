/**
 * Estudiantes — the data of the live view (/estudiantes/vivo, C4b of
 * odd/tasks/estudiantes-fase-b.md), turned from the RPC rows and jsonb into
 * plain serializable shapes the client island can hold.
 *
 * Sources:
 * - estudiantes_vivo_opciones(dias?) (20261101100000_estudiantes_vivo_acceso.sql):
 *   the (ámbito, campus, fecha, turno) the caller may open, newest first per
 *   ámbito and campus.
 * - estudiantes_en_vivo(ámbito, fecha, turno) (20261029100100_estudiantes_asistencia_rpcs.sql):
 *   per visible group presentes (visitors included), ausentes, visitantes and
 *   sin_marcar (active members without a mark), and the visitors present
 *   today with who marked them and when.
 *
 * Every jsonb value is read defensively: a missing or malformed field becomes
 * `null` / `0` / an empty list, never a crash of the page.
 */
import type { Database, Json } from '@/lib/supabase/database.types'

import { esObjeto, lista, nombreCompleto, numero, texto, type Objeto } from './grupos-datos'

export type FilaOpcionVivo = Database['public']['Functions']['estudiantes_vivo_opciones']['Returns'][number]

/** A live view the caller may open: one ámbito of one campus at one meeting. */
export interface OpcionVivo {
  readonly ambitoId: string
  readonly ambito: string
  readonly campusId: string
  readonly campus: string
  readonly fecha: string
  readonly turnoId: string
  readonly turno: string
  /** "HH:MM:SS". */
  readonly hora: string | null
}

export function aOpcionesVivo(filas: readonly FilaOpcionVivo[]): OpcionVivo[] {
  return filas.map((fila) => ({
    ambitoId: fila.ambito_id,
    ambito: fila.ambito,
    campusId: fila.campus_id,
    campus: fila.campus,
    fecha: fila.fecha,
    turnoId: fila.turno_id,
    turno: fila.turno,
    hora: fila.hora ?? null,
  }))
}

export interface GrupoVivo {
  readonly grupoId: string
  readonly nombre: string
  /** The sub-área label ("Grupos de Chicas"). */
  readonly subarea: string
  readonly anio: number | null
  readonly anioEtiqueta: string | null
  readonly lideres: readonly string[]
  /** Visitors included. */
  readonly presentes: number
  readonly ausentes: number
  /** Present visitors. */
  readonly visitantes: number
  /** Active members without a mark yet. */
  readonly sinMarcar: number
}

export interface VisitanteHoy {
  readonly personaId: string
  readonly nombre: string
  readonly grupoId: string | null
  readonly grupo: string | null
  readonly anioEtiqueta: string | null
  /** Who marked them. */
  readonly registradoPor: string | null
  /** When (ISO instant). */
  readonly registradoAt: string | null
  /** Joined the group at this meeting (first time). */
  readonly esNuevo: boolean
}

export interface DatosVivo {
  readonly ambitoId: string | null
  readonly fecha: string | null
  readonly turnoId: string | null
  readonly grupos: readonly GrupoVivo[]
  readonly visitantesHoy: readonly VisitanteHoy[]
}

const entero = (objeto: Objeto, clave: string): number => Math.max(0, Math.trunc(numero(objeto, clave) ?? 0))

const textos = (valor: Json | undefined): string[] =>
  Array.isArray(valor) ? valor.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

function aGrupoVivo(objeto: Objeto): GrupoVivo | null {
  const grupoId = texto(objeto, 'grupo_id')
  if (!grupoId) return null
  return {
    grupoId,
    nombre: texto(objeto, 'nombre') ?? '',
    subarea: texto(objeto, 'subarea') ?? '',
    anio: numero(objeto, 'anio'),
    anioEtiqueta: texto(objeto, 'anio_etiqueta'),
    lideres: textos(objeto.lideres),
    presentes: entero(objeto, 'presentes'),
    ausentes: entero(objeto, 'ausentes'),
    visitantes: entero(objeto, 'visitantes'),
    sinMarcar: entero(objeto, 'sin_marcar'),
  }
}

function aVisitanteHoy(objeto: Objeto): VisitanteHoy | null {
  const personaId = texto(objeto, 'persona_id')
  if (!personaId) return null
  return {
    personaId,
    nombre: nombreCompleto(objeto),
    grupoId: texto(objeto, 'grupo_id'),
    grupo: texto(objeto, 'grupo'),
    anioEtiqueta: texto(objeto, 'anio_etiqueta'),
    registradoPor: texto(objeto, 'registrado_por')?.trim() || null,
    registradoAt: texto(objeto, 'registrado_at'),
    esNuevo: objeto.es_nuevo === true,
  }
}

/** The estudiantes_en_vivo payload; `null` when it is not an object. */
export function aDatosVivo(valor: Json | null | undefined): DatosVivo | null {
  if (valor === null || valor === undefined || !esObjeto(valor)) return null
  return {
    ambitoId: texto(valor, 'ambito_id'),
    fecha: texto(valor, 'fecha'),
    turnoId: texto(valor, 'turno_id'),
    grupos: lista(valor.grupos)
      .map(aGrupoVivo)
      .filter((g): g is GrupoVivo => g !== null),
    visitantesHoy: lista(valor.visitantes_hoy)
      .map(aVisitanteHoy)
      .filter((v): v is VisitanteHoy => v !== null),
  }
}
