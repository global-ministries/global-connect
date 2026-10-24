/**
 * Dates for the 1:1 screens (odd/tasks/uno-a-uno.md, T4). The church runs on
 * Caracas time (UTC-04:00 all year, no DST) while browsers and the server
 * (Vercel, UTC) may not, so a picked date and time always mean Caracas time
 * and every instant is shown in Caracas time.
 */

export const ZONA_UNO_A_UNO = 'America/Caracas'
const OFFSET_CARACAS = '-04:00'

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/
// The browser's time input may add seconds (step < 60).
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/

function esFechaReal(fecha: string): boolean {
  const m = FECHA_RE.exec(fecha)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

/**
 * A date (YYYY-MM-DD) and a time (HH:mm) read as Caracas time, as an ISO
 * timestamptz with its offset. Null when either one is not a real value.
 */
export function fechaHoraCaracasAIso(fecha: string, hora: string): string | null {
  if (!esFechaReal(fecha)) return null
  const h = HORA_RE.exec(hora)
  if (!h) return null
  return `${fecha}T${h[1]}:${h[2]}:00${OFFSET_CARACAS}`
}

function instanteValido(instante: string | null): Date | null {
  if (!instante) return null
  const date = new Date(instante)
  return Number.isNaN(date.getTime()) ? null : date
}

const FORMATO_LARGO = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONA_UNO_A_UNO,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const FORMATO_CORTO = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONA_UNO_A_UNO,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const FORMATO_PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_UNO_A_UNO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partes(formato: Intl.DateTimeFormat, date: Date): Record<string, string> {
  const result: Record<string, string> = {}
  for (const p of formato.formatToParts(date)) result[p.type] = p.value
  return result
}

/** "viernes 16 de octubre de 2026, 15:30" in Caracas time; empty for null or garbage. */
export function formatearFechaHora(instante: string | null): string {
  const date = instanteValido(instante)
  if (!date) return ''
  const p = partes(FORMATO_LARGO, date)
  return `${p.weekday} ${p.day} de ${p.month} de ${p.year}, ${p.hour}:${p.minute}`
}

/** "20 oct 2026" in Caracas time, for the supervision table (T8); empty for null or garbage. */
export function formatearFecha(instante: string | null): string {
  const date = instanteValido(instante)
  if (!date) return ''
  const p = partes(FORMATO_CORTO, date)
  return `${p.day} ${p.month.replace('.', '')} ${p.year}`
}

/** The Caracas date and time of an instant, ready for date and time inputs. */
export function partesEnCaracas(instante: string | null): { fecha: string; hora: string } {
  const date = instanteValido(instante)
  if (!date) return { fecha: '', hora: '' }
  const p = partes(FORMATO_PARTES, date)
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

/** Today's date in Caracas, YYYY-MM-DD. */
export function hoyEnCaracas(ahora: Date = new Date()): string {
  return partesEnCaracas(ahora.toISOString()).fecha
}

const MS_POR_DIA = 86_400_000

/** The instant `dias` days before `ahora`, as ISO, for the windows of the supervision view. */
export function desdeHaceDias(dias: number, ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - dias * MS_POR_DIA).toISOString()
}
