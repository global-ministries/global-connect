/**
 * T1 (odd/tasks/proximo-paso.md, S1) — the cadencia anchor of a taller
 * (talleres.ancla_ediciones, migration 20261110150000_talleres_ancla_
 * ediciones.sql). Anchored to `primer_domingo_mes`, every edición starts on
 * the first Sunday of its month, one per month.
 *
 * These helpers mirror talleres_crear_edicion's anchored branch so the
 * "Crear edición" form can preview the dates; the RPC stays the authority
 * (it refuses with FECHA_NO_ES_PRIMER_DOMINGO). Dates are `YYYY-MM-DD`
 * strings computed in UTC so they never shift with the viewer's timezone.
 */

export type AnclaEdiciones = 'primer_domingo_mes'

export const ANCLAS_EDICIONES: readonly AnclaEdiciones[] = ['primer_domingo_mes']

function parseFecha(fecha: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function formatFecha(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** True when `fecha` (YYYY-MM-DD) is a Sunday in the first 7 days of its month. */
export function esPrimerDomingoDelMes(fecha: string): boolean {
  const date = parseFecha(fecha)
  if (!date || Number.isNaN(date.getTime())) return false
  return date.getUTCDay() === 0 && date.getUTCDate() <= 7
}

/** First Sunday of the month that is `meses` months after `fecha`'s own month. */
function primerDomingo(fecha: Date, meses: number): Date {
  const primeroDelMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + meses, 1))
  const dias = (7 - primeroDelMes.getUTCDay()) % 7
  return new Date(primeroDelMes.getTime() + dias * 86_400_000)
}

/**
 * Start dates of the ediciones an anchored taller creates from
 * `fechaInicio` with `adelantar` more: the first Sunday of each month.
 */
export function fechasEdicionesAncladas(fechaInicio: string, adelantar: number): string[] {
  const inicio = parseFecha(fechaInicio)
  if (!inicio) return []
  return Array.from({ length: adelantar + 1 }, (_, i) => formatFecha(primerDomingo(inicio, i)))
}
