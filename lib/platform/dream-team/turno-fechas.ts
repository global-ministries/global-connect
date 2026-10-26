/**
 * Dated service shifts ("turnos por fechas", odd/tasks/tlr-calendario-servicios.md).
 *
 * A turno is `semanal` (every week on its weekday, as always) or `fechas`: it
 * happens only on the dates its coordinator plans (fecha, an optional hora
 * that overrides the turno's, an optional nota), and for each date the
 * coordinator picks, among the volunteers assigned to the turno, who serves
 * ("Todos" in one click). The database owns the rules and the authority
 * (supabase/migrations/20261026140000_dream_team_turnos_fechas.sql); this
 * module holds the pure helpers the screens and routes share.
 *
 * Dates are ISO "YYYY-MM-DD" calendar days, read in UTC so a timezone never
 * shifts a day (as frecuencia-turno.ts does).
 */

export type TipoTurno = 'semanal' | 'fechas'

/** How a dated shift reads where a weekly one shows its weekday or frequency. */
export const TEXTO_POR_FECHAS = 'Por fechas'

export interface FechaTurno {
  readonly id: string
  readonly turnoId: string
  /** "YYYY-MM-DD". */
  readonly fecha: string
  /** "HH:MM" overriding the turno's hour on this date; null = the turno's. */
  readonly hora: string | null
  readonly nota: string | null
  /** The servicio ids that serve on this date (those the caller can read). */
  readonly servidores: readonly string[]
}

export type ResultadoValidacion<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly message: string }

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const HORA = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const NOTA_MAX = 200
const SERVIDORES_MAX = 500

/** The UTC Date of an ISO calendar day, or null when it is not a real day. */
function fechaUtc(iso: string): Date | null {
  const partes = ISO.exec(iso)
  if (!partes) return null
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  return fecha
}

/** "HH:MM" of an hour that may carry seconds ("10:30:00"), or null when it is not one. */
function horaCorta(hora: string): string | null {
  const partes = HORA.exec(hora.trim())
  return partes ? `${partes[1].padStart(2, '0')}:${partes[2]}` : null
}

// ── Listing ──────────────────────────────────────────────────────────────

/** Upcoming dates (today included), soonest first, and past ones, latest first. */
export function separarFechas<F extends Pick<FechaTurno, 'fecha'>>(
  fechas: readonly F[],
  hoy: string,
): { readonly proximas: F[]; readonly pasadas: F[] } {
  const ordenadas = [...fechas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return {
    proximas: ordenadas.filter((f) => f.fecha >= hoy),
    pasadas: ordenadas.filter((f) => f.fecha < hoy).reverse(),
  }
}

/** "Domingo 8 nov", or "Domingo 3 ene 2027" when the year is not the one of `hoy`. */
export function etiquetaFecha(fecha: string, hoy: string): string {
  const dia = fechaUtc(fecha)
  if (!dia) return fecha
  const base = `${DIAS[dia.getUTCDay()]} ${dia.getUTCDate()} ${MESES[dia.getUTCMonth()]}`
  return hoy.slice(0, 4) === fecha.slice(0, 4) ? base : `${base} ${dia.getUTCFullYear()}`
}

/** The hour of a planned date: its own when set, the turno's otherwise. */
export function horaDeFecha(fecha: Pick<FechaTurno, 'hora'>, horaTurno: string): string {
  return (fecha.hora && horaCorta(fecha.hora)) || horaTurno
}

// ── Who serves on a date ─────────────────────────────────────────────────

/** "Todos": every assigned volunteer, in one step. */
export function todosSeleccionados(servicioIds: readonly string[]): ReadonlySet<string> {
  return new Set(servicioIds)
}

export function alternarSeleccion(seleccion: ReadonlySet<string>, servicioId: string): ReadonlySet<string> {
  const siguiente = new Set(seleccion)
  if (siguiente.has(servicioId)) siguiente.delete(servicioId)
  else siguiente.add(servicioId)
  return siguiente
}

/** "2 de 3 sirven". */
export function textoSirven(sirven: number, asignados: number): string {
  return `${sirven} de ${asignados} sirven`
}

/**
 * The servicio ids to save for a date: the chosen ones among those this
 * screen lists, plus whoever already serves and is not listed here (another
 * team's volunteer), so saving one card never drops them. The database
 * function replaces the whole set.
 */
export function idsParaGuardar(
  elegidos: ReadonlySet<string>,
  visibles: readonly string[],
  actuales: readonly string[],
): string[] {
  const listados = new Set(visibles)
  return [...visibles.filter((id) => elegidos.has(id)), ...actuales.filter((id) => !listados.has(id))]
}

// ── Validation ───────────────────────────────────────────────────────────

export interface DatosFechaTurno {
  readonly fecha: string
  readonly hora: string | null
  readonly nota: string | null
}

/** Validates a planned date from a request: a real day, an optional "HH:MM" and a note up to 200 characters. */
export function validarFechaTurno(entrada: {
  readonly fecha?: unknown
  readonly hora?: unknown
  readonly nota?: unknown
}): ResultadoValidacion<{ readonly datos: DatosFechaTurno }> {
  if (typeof entrada.fecha !== 'string' || !fechaUtc(entrada.fecha)) return { ok: false, message: 'Elige una fecha válida.' }
  let hora: string | null = null
  if (typeof entrada.hora === 'string' && entrada.hora.trim() !== '') {
    hora = horaCorta(entrada.hora)
    if (!hora) return { ok: false, message: 'La hora debe tener el formato HH:MM.' }
  } else if (entrada.hora !== undefined && entrada.hora !== null && typeof entrada.hora !== 'string') {
    return { ok: false, message: 'La hora debe tener el formato HH:MM.' }
  }
  const nota = typeof entrada.nota === 'string' ? entrada.nota.trim() : ''
  if (nota.length > NOTA_MAX) return { ok: false, message: `La nota no puede superar los ${NOTA_MAX} caracteres.` }
  return { ok: true, datos: { fecha: entrada.fecha, hora, nota: nota || null } }
}

/** Validates the body of "these serve on the date": a list of servicio uuids, deduplicated (empty clears the date). */
export function validarServicioIds(valor: unknown): ResultadoValidacion<{ readonly servicioIds: readonly string[] }> {
  if (!Array.isArray(valor)) return { ok: false, message: 'servicioIds debe ser una lista.' }
  if (!valor.every((id) => typeof id === 'string' && UUID.test(id))) {
    return { ok: false, message: 'servicioIds contiene un identificador inválido.' }
  }
  const servicioIds = [...new Set(valor as string[])]
  if (servicioIds.length > SERVIDORES_MAX) return { ok: false, message: 'Demasiadas personas en una fecha.' }
  return { ok: true, servicioIds }
}

// ── Errors of the database functions ─────────────────────────────────────

type ErrorBase = { readonly code?: string; readonly message?: string } | null | undefined

const MENSAJES: Readonly<Record<string, string>> = {
  sin_autoridad: 'No tienes permiso para planificar las fechas de este turno.',
  turno_invalido: 'El turno no existe, está desactivado o no es por fechas.',
  fecha_invalida: 'Elige una fecha válida.',
  fecha_duplicada: 'Ese turno ya tiene esa fecha planificada.',
  turno_fecha_invalida: 'Esa fecha ya no existe. Recarga la página.',
  servicio_invalido: 'Alguna persona ya no tiene asignado este turno. Recarga la página.',
  servicios_invalidos: 'Alguna persona ya no tiene asignado este turno. Recarga la página.',
}

/** A Spanish message for an error of dream_team_turno_fecha_guardar / _borrar / _servidores_fijar. */
export function mensajeErrorTurnoFecha(error: ErrorBase): string {
  const porMensaje = error?.message ? MENSAJES[error.message] : undefined
  if (porMensaje) return porMensaje
  if (error?.code === '42501') return MENSAJES.sin_autoridad
  if (error?.code === '23505') return MENSAJES.fecha_duplicada
  return 'No se pudo guardar. Intenta de nuevo.'
}

/** The HTTP status of such an error: 403 no authority, 409 duplicate date, 422 refused input, 500 the rest. */
export function estadoErrorTurnoFecha(error: ErrorBase): number {
  if (error?.code === '42501') return 403
  if (error?.code === '23505') return 409
  if (error?.code === '22023' || error?.code === '23514') return 422
  return 500
}
