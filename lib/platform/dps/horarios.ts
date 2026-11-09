/**
 * DPS planning — each plan's own horarios (odd/tasks/dps-asistencia-pco.md,
 * S10, T13): one or more services with their start, and the llegada of the
 * team. A Cena del Señor can be one evening service ("19:00"). The database
 * checks the same rules (dps_plan_horarios_guardar in
 * supabase/migrations/20261108208000_dps_orden_servicio.sql); the end of each
 * service is not stored: it comes from the order (orden.ts). Pure: safe on
 * the client.
 */

export const MAX_SERVICIOS = 4

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DIA = 24 * 3600
/** "+ Servicio" proposes the last start plus this; the first one is the usual Sunday start. */
const ESPACIO_SERVICIOS = 2 * 3600
const PRIMER_SERVICIO = '09:15'

/** 'HH:MM' as seconds of the day, or null. */
export function segundosHora(hora: string): number | null {
  const m = HORA_RE.exec(hora)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null
}

/** Seconds of the day as the short hour of the screen: "9:15", "19:00" (wraps past midnight). */
export function horaCortaSegundos(segundos: number): string {
  const minutos = Math.floor((((segundos % DIA) + DIA) % DIA) / 60)
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`
}

const aHora = (segundos: number): string =>
  `${String(Math.floor(segundos / 3600)).padStart(2, '0')}:${String(Math.floor((segundos % 3600) / 60)).padStart(2, '0')}`

/** The code dps_plan_horarios_guardar would raise, or null: 1 to 4 'HH:MM', strictly ascending, llegada not after the first. */
export function validarHorarios(horarios: readonly string[], llegada: string): 'horarios_invalidos' | 'llegada_invalida' | null {
  const segundos = horarios.map(segundosHora)
  if (segundos.length < 1 || segundos.length > MAX_SERVICIOS || segundos.some((s) => s === null)) return 'horarios_invalidos'
  if (segundos.some((s, i) => i > 0 && s! <= segundos[i - 1]!)) return 'horarios_invalidos'
  const inicio = segundosHora(llegada)
  if (inicio === null || inicio > segundos[0]!) return 'llegada_invalida'
  return null
}

/** The start "+ Servicio" proposes: two hours after the last one, or null past the day or at four services. */
export function siguienteHorario(horarios: readonly string[]): string | null {
  if (horarios.length >= MAX_SERVICIOS) return null
  const ultimo = horarios.length > 0 ? segundosHora(horarios[horarios.length - 1]!) : null
  if (ultimo === null) return horarios.length === 0 ? PRIMER_SERVICIO : null
  const siguiente = ultimo + ESPACIO_SERVICIOS
  return siguiente < DIA ? aHora(siguiente) : null
}
