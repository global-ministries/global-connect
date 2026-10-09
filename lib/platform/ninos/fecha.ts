/**
 * Dates for the Niños module (odd/tasks/ninos-checkin.md). The church runs on
 * Caracas time while the server (Vercel) runs on UTC, so "today" and "the
 * coming Sunday" are always computed in America/Caracas.
 */

export const ZONA_NINOS = 'America/Caracas'

/** Today's date in Caracas, YYYY-MM-DD. */
export function hoyEnCaracas(ahora: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_NINOS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/** `hoy` (YYYY-MM-DD) when it is a Sunday, otherwise the coming Sunday. */
export function fechaServicioPorDefecto(hoy: string): string {
  const d = new Date(`${hoy}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
}

/** The default service date: today in Caracas if Sunday, else the coming Sunday. */
export function fechaServicioCaracas(ahora: Date = new Date()): string {
  return fechaServicioPorDefecto(hoyEnCaracas(ahora))
}

/** HH:mm of an instant in Caracas; empty for null. */
export function horaEnCaracas(instante: string | null): string {
  if (!instante) return ''
  return new Intl.DateTimeFormat('es-VE', { timeZone: ZONA_NINOS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(instante),
  )
}
