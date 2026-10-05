import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Campus service shifts ("turnos", D12 in odd/tasks/ninos-voluntarios-waumba.md).
 *
 * A shift belongs to a CAMPUS and every Dream Team dirección shares it. A node
 * of the tree may narrow the shifts it serves in (descendants inherit it, per
 * campus); a servicio is assigned by hand to one or more shifts of the
 * person's principal campus. The database enforces all of it
 * (supabase/migrations/20261005100000_dream_team_turnos.sql); this module holds
 * the pure rules the screens share plus the few queries they run.
 */

type DbClient = SupabaseClient<Database, 'public'>

export interface Turno {
  readonly id: string
  readonly campusId: string
  readonly nombre: string
  /** 0 = domingo … 6 = sábado, as Date#getDay. */
  readonly diaSemana: number
  /** "HH:MM". */
  readonly hora: string
  readonly orden: number
  readonly activo: boolean
}

export const DIAS_SEMANA: readonly string[] = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Filter value for "servicios without a shift". Never a uuid, so it cannot collide with a shift id. */
export const SIN_TURNO = 'sin_turno'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/
const NOMBRE_MAX = 60
const TURNOS_MAX = 20

// ── Pure rules ───────────────────────────────────────────────────────────

/** "Sábado · 17:30". */
export function detalleTurno(turno: Pick<Turno, 'diaSemana' | 'hora'>): string {
  return `${DIAS_SEMANA[turno.diaSemana] ?? '—'} · ${turno.hora}`
}

export function ordenarTurnos(turnos: readonly Turno[]): Turno[] {
  return [...turnos].sort(
    (a, b) => a.orden - b.orden || a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/** Whether a servicio with these shifts passes the shift filter (`null` = no filter). */
export function coincideTurno(turnoIds: readonly string[] | undefined, filtro: string | null): boolean {
  if (filtro === null) return true
  if (filtro === SIN_TURNO) return (turnoIds?.length ?? 0) === 0
  return turnoIds?.includes(filtro) ?? false
}

export type ResultadoValidacion<T> = { readonly ok: true } & T | { readonly ok: false; readonly message: string }

/** Validates the body of "these are the shifts" (a servicio's or a node's). */
export function validarTurnoIds(valor: unknown): ResultadoValidacion<{ readonly turnoIds: readonly string[] }> {
  if (!Array.isArray(valor)) return { ok: false, message: 'turnoIds debe ser una lista.' }
  if (!valor.every((id) => typeof id === 'string' && UUID.test(id))) {
    return { ok: false, message: 'turnoIds contiene un identificador inválido.' }
  }
  const turnoIds = [...new Set(valor as string[])]
  if (turnoIds.length > TURNOS_MAX) return { ok: false, message: `No se pueden asignar más de ${TURNOS_MAX} turnos.` }
  return { ok: true, turnoIds }
}

export interface DatosTurno {
  readonly nombre: string
  readonly diaSemana: number
  readonly hora: string
  readonly orden: number
}

export interface EntradaTurno {
  readonly nombre?: unknown
  readonly diaSemana?: unknown
  readonly hora?: unknown
  readonly orden?: unknown
}

export function validarDatosTurno(entrada: EntradaTurno): ResultadoValidacion<{ readonly datos: DatosTurno }> {
  const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.trim() : ''
  if (!nombre) return { ok: false, message: 'El nombre del turno es obligatorio.' }
  if (nombre.length > NOMBRE_MAX) return { ok: false, message: `El nombre no puede superar los ${NOMBRE_MAX} caracteres.` }
  const dia = entrada.diaSemana
  if (typeof dia !== 'number' || !Number.isInteger(dia) || dia < 0 || dia > 6) {
    return { ok: false, message: 'Elige un día de la semana.' }
  }
  const hora = typeof entrada.hora === 'string' ? HORA.exec(entrada.hora.trim()) : null
  if (!hora) return { ok: false, message: 'La hora debe tener el formato HH:MM.' }
  const orden = entrada.orden === undefined ? 0 : entrada.orden
  if (typeof orden !== 'number' || !Number.isInteger(orden)) return { ok: false, message: 'El orden debe ser un número entero.' }
  return {
    ok: true,
    datos: { nombre, diaSemana: dia, hora: `${hora[1].padStart(2, '0')}:${hora[2]}`, orden },
  }
}

export function cambiosDeTurnos(
  actuales: readonly string[],
  deseados: readonly string[],
): { readonly agregar: readonly string[]; readonly quitar: readonly string[] } {
  return {
    agregar: deseados.filter((id) => !actuales.includes(id)),
    quitar: actuales.filter((id) => !deseados.includes(id)),
  }
}

// ── Queries ──────────────────────────────────────────────────────────────

interface TurnoRow {
  readonly id: string
  readonly campus_id: string
  readonly nombre: string
  readonly dia_semana: number
  readonly hora: string
  readonly orden: number
  readonly activo: boolean
}

function aTurno(row: TurnoRow): Turno {
  return {
    id: row.id,
    campusId: row.campus_id,
    nombre: row.nombre,
    diaSemana: row.dia_semana,
    hora: row.hora.slice(0, 5),
    orden: row.orden,
    activo: row.activo,
  }
}

function fallar(error: unknown): never {
  const mensaje = (error as { message?: string } | null)?.message ?? 'Error de base de datos'
  throw Object.assign(new Error(mensaje), { code: (error as { code?: string } | null)?.code })
}

/** Every shift of every campus, active or not (shift names are readable by any session). */
export async function fetchTurnos(client: DbClient): Promise<Turno[]> {
  const { data, error } = await client
    .from('dream_team_turnos')
    .select('id, campus_id, nombre, dia_semana, hora, orden, activo')
    .order('orden')
  if (error) fallar(error)
  return ordenarTurnos(((data ?? []) as TurnoRow[]).map(aTurno))
}

const LOTE = 150

/** Shift ids per servicio, for the servicios the caller can read (RLS follows the servicio). */
export async function fetchTurnosDeServicios(
  client: DbClient,
  servicioIds: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const unicos = [...new Set(servicioIds)]
  const mapa = new Map<string, string[]>()
  for (let i = 0; i < unicos.length; i += LOTE) {
    const { data, error } = await client
      .from('dream_team_servicio_turnos')
      .select('servicio_id, turno_id')
      .in('servicio_id', unicos.slice(i, i + LOTE))
    if (error) fallar(error)
    for (const row of (data ?? []) as { servicio_id: string; turno_id: string }[]) {
      const lista = mapa.get(row.servicio_id)
      if (lista) lista.push(row.turno_id)
      else mapa.set(row.servicio_id, [row.turno_id])
    }
  }
  return mapa
}

/**
 * The active shift ids a node serves in, across the campuses that have
 * shifts. The inheritance walk runs in the database
 * (dream_team_turnos_del_equipo), where the ancestors are visible.
 */
export async function fetchTurnosDisponibles(
  client: DbClient,
  equipoId: string,
  turnos: readonly Turno[],
): Promise<string[]> {
  const campus = [...new Set(turnos.map((turno) => turno.campusId))]
  const respuestas = await Promise.all(
    campus.map((campusId) => client.rpc('dream_team_turnos_del_equipo', { p_equipo_id: equipoId, p_campus_id: campusId })),
  )
  return respuestas.flatMap(({ data, error }) => {
    if (error) fallar(error)
    return (data ?? []) as string[]
  })
}

/** The shifts a node restricts itself to (empty = it inherits). */
export async function fetchTurnosPropiosDeEquipo(client: DbClient, equipoId: string): Promise<string[]> {
  const { data, error } = await client.from('dream_team_equipo_turnos').select('turno_id').eq('equipo_id', equipoId)
  if (error) fallar(error)
  return ((data ?? []) as { turno_id: string }[]).map((row) => row.turno_id)
}

async function reemplazar(
  client: DbClient,
  tabla: 'dream_team_servicio_turnos' | 'dream_team_equipo_turnos',
  columna: 'servicio_id' | 'equipo_id',
  id: string,
  turnoIds: readonly string[],
): Promise<void> {
  const { data, error } = await client.from(tabla).select('turno_id').eq(columna, id)
  if (error) fallar(error)
  const actuales = ((data ?? []) as { turno_id: string }[]).map((row) => row.turno_id)
  const { agregar, quitar } = cambiosDeTurnos(actuales, turnoIds)
  if (quitar.length > 0) {
    const { error: errorBorrar } = await client.from(tabla).delete().eq(columna, id).in('turno_id', [...quitar])
    if (errorBorrar) fallar(errorBorrar)
  }
  if (agregar.length > 0) {
    const filas = agregar.map((turnoId) => ({ [columna]: id, turno_id: turnoId }))
    const { error: errorInsertar } = await client.from(tabla).insert(filas as never)
    if (errorInsertar) fallar(errorInsertar)
  }
}

/** Replaces the shifts of a servicio. The database rejects a shift the servicio cannot take (23514). */
export function guardarTurnosDeServicio(client: DbClient, servicioId: string, turnoIds: readonly string[]): Promise<void> {
  return reemplazar(client, 'dream_team_servicio_turnos', 'servicio_id', servicioId, turnoIds)
}

/** Replaces the restriction of a node; an empty list makes it inherit again. */
export function guardarTurnosDeEquipo(client: DbClient, equipoId: string, turnoIds: readonly string[]): Promise<void> {
  return reemplazar(client, 'dream_team_equipo_turnos', 'equipo_id', equipoId, turnoIds)
}
