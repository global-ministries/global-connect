/**
 * Usuarios ficha, Asistencia tab — loads ONE person's own attendance across
 * Grupos de Vida, Estudiantes (Transit, Inside Out, The Living Room) and
 * Talleres (S13 of odd/tasks/sistema-diseno-v2.md).
 *
 * Source: public.obtener_asistencia_persona (20261030100000). The database
 * decides who may see it with the gate of obtener_reporte_asistencia_usuario
 * (self; admin; pastor and director general of the person's campus; a leader
 * of a group of the person; the director de etapa of a current group; a direct
 * relation); NULL means "not allowed" and this loader returns null.
 *
 * Only the kinds with records come back (a kind is present when it has a
 * group). Each group carries its marks (presente yes/no, era_visitante) and
 * its totals; the tab's curve, KPIs and historial are in ./asistencia-vista.
 */
import type { createSupabaseServerClient } from '@/lib/supabase/server'

type Cliente = Pick<Awaited<ReturnType<typeof createSupabaseServerClient>>, 'rpc'>

export type TipoAsistencia = 'gdv' | 'estudiantes' | 'talleres'

export const TIPOS_ASISTENCIA: readonly TipoAsistencia[] = ['gdv', 'estudiantes', 'talleres']

export interface MarcaAsistencia {
  /** ISO date (YYYY-MM-DD) of the meeting or sesión. */
  readonly fecha: string
  readonly presente: boolean
  /** Estudiantes: the person was a visitor of the group when marked. */
  readonly eraVisitante: boolean
}

export interface TotalesAsistencia {
  readonly reuniones: number
  readonly presentes: number
  /** Rounded 0–100, or null with no meetings. */
  readonly porcentaje: number | null
}

export interface GrupoAsistencia {
  readonly tipo: TipoAsistencia
  readonly id: string
  /** Group name; for Talleres, the taller. */
  readonly nombre: string
  /** GdV: the segmento; Estudiantes: "<ámbito> · <sub-área>"; Talleres: the group. */
  readonly area: string | null
  /** 'Líder' | 'Colíder' | 'Miembro' | 'Visitante' | 'Participante' (Talleres). */
  readonly rol: string
  readonly actual: boolean
  /** Start of the current membership, when known. */
  readonly desde: string | null
  /** The date the person left ("Salió el …"), for a past group. */
  readonly salio: string | null
  /** Talleres only: the group finished. */
  readonly completado: boolean | null
  /** Talleres only: the group's sesiones that were not cancelled. */
  readonly totalSesiones: number | null
  /** Oldest first, only inside the range. */
  readonly marcas: readonly MarcaAsistencia[]
  readonly totales: TotalesAsistencia
}

export interface AsistenciaPersona {
  readonly desde: string
  readonly hasta: string
  readonly grupos: readonly GrupoAsistencia[]
}

export interface ConsultaAsistencia {
  readonly usuarioId: string
  /** The caller's auth id (must be the session user). */
  readonly authId: string
  /** ISO dates; default: the last 12 months up to today. */
  readonly desde?: string
  readonly hasta?: string
}

type Registro = Readonly<Record<string, unknown>>

const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const booleano = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const esTipo = (v: unknown): v is TipoAsistencia => (TIPOS_ASISTENCIA as readonly unknown[]).includes(v)

/** Meetings, presences and the rounded percentage of a set of marks. */
export function totalesDeMarcas(marcas: readonly MarcaAsistencia[]): TotalesAsistencia {
  const presentes = marcas.filter((m) => m.presente).length
  return {
    reuniones: marcas.length,
    presentes,
    porcentaje: marcas.length === 0 ? null : Math.round((presentes / marcas.length) * 100),
  }
}

function aMarca(fila: Registro): MarcaAsistencia | null {
  const fecha = texto(fila.fecha)
  if (fecha === null) return null
  return { fecha, presente: fila.presente === true, eraVisitante: fila.era_visitante === true }
}

function aGrupo(fila: Registro): GrupoAsistencia | null {
  const id = texto(fila.id)
  if (!esTipo(fila.tipo) || id === null) return null
  const marcas = (Array.isArray(fila.marcas) ? (fila.marcas as Registro[]) : [])
    .map(aMarca)
    .filter((m): m is MarcaAsistencia => m !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  return {
    tipo: fila.tipo,
    id,
    nombre: texto(fila.nombre) ?? '',
    area: texto(fila.area),
    rol: texto(fila.rol) ?? 'Miembro',
    actual: fila.actual === true,
    desde: texto(fila.desde),
    salio: texto(fila.salio),
    completado: booleano(fila.completado),
    totalSesiones: numero(fila.total_sesiones),
    marcas,
    totales: totalesDeMarcas(marcas),
  }
}

/** Maps the RPC payload; unknown kinds and malformed rows are dropped. */
export function aAsistenciaPersona(datos: unknown): AsistenciaPersona {
  const r = (datos ?? {}) as Registro
  const grupos = Array.isArray(r.grupos) ? (r.grupos as Registro[]) : []
  return {
    desde: texto(r.desde) ?? '',
    hasta: texto(r.hasta) ?? '',
    grupos: grupos.map(aGrupo).filter((g): g is GrupoAsistencia => g !== null),
  }
}

export async function cargarAsistenciaPersona(
  supabase: Cliente,
  consulta: ConsultaAsistencia,
): Promise<AsistenciaPersona | null> {
  const { data, error } = await supabase.rpc('obtener_asistencia_persona', {
    p_usuario_id: consulta.usuarioId,
    p_auth_id: consulta.authId,
    ...(consulta.desde ? { p_fecha_inicio: consulta.desde } : {}),
    ...(consulta.hasta ? { p_fecha_fin: consulta.hasta } : {}),
  })
  if (error) throw new Error(`obtener_asistencia_persona: ${error.message}`)
  if (data === null || data === undefined) return null
  return aAsistenciaPersona(data)
}
