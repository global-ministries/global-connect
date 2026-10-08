/**
 * Service frequency of a shift assignment (T10, D13 in
 * odd/tasks/ninos-voluntarios-waumba.md).
 *
 * `semanal` serves every week. `quincenal` serves every other week, counted
 * from an anchor Sunday: the volunteer serves on a Sunday when the whole number
 * of weeks between it and the anchor is even. The database stores the same
 * rule (dream_team_turno_sirve_en, migration 20261008130000).
 *
 * Dates are ISO "YYYY-MM-DD" calendar days, computed in UTC so a timezone or a
 * daylight-saving change never shifts a day.
 */

export type Frecuencia = 'semanal' | 'quincenal'

export interface FrecuenciaTurno {
  readonly frecuencia: Frecuencia
  /** The anchor Sunday of a `quincenal` assignment; null for `semanal`. */
  readonly fechaAncla: string | null
}

export const FRECUENCIA_SEMANAL: FrecuenciaTurno = { frecuencia: 'semanal', fechaAncla: null }

/** Week A is the one of this Sunday and every other week from it; week B is the rest. */
const DOMINGO_SEMANA_A = '2026-01-04'
const DIA_MS = 86_400_000
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** Days since the epoch of an ISO date, or null when it is not a real calendar day. */
function diaDe(iso: string): number | null {
  const partes = ISO.exec(iso)
  if (!partes) return null
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const ms = Date.UTC(anio, mes - 1, dia)
  const fecha = new Date(ms)
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  return ms / DIA_MS
}

function isoDe(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10)
}

function diaObligatorio(iso: string): number {
  const dia = diaDe(iso)
  if (dia === null) throw new Error(`Fecha inválida: ${iso}`)
  return dia
}

export function esDomingo(iso: string): boolean {
  const dia = diaDe(iso)
  return dia !== null && new Date(dia * DIA_MS).getUTCDay() === 0
}

function semanasPares(desde: number, hasta: number): boolean {
  return Math.floor((hasta - desde) / 7) % 2 === 0
}

/** Whether the assignment serves on this Sunday. */
export function sirveEnDomingo(frecuencia: FrecuenciaTurno, domingo: string): boolean {
  if (frecuencia.frecuencia === 'semanal' || frecuencia.fechaAncla === null) return true
  return semanasPares(diaObligatorio(frecuencia.fechaAncla), diaObligatorio(domingo))
}

/** The first Sunday on or after `desde` on which the assignment serves. */
export function proximoDomingoDeServicio(frecuencia: FrecuenciaTurno, desde: string): string {
  const dia = diaObligatorio(desde)
  const domingo = dia + ((7 - new Date(dia * DIA_MS).getUTCDay()) % 7)
  const iso = isoDe(domingo)
  return sirveEnDomingo(frecuencia, iso) ? iso : isoDe(domingo + 7)
}

/** "A" or "B": which of the two alternating weeks the anchor falls in. */
export function semanaDeAncla(fechaAncla: string): 'A' | 'B' {
  return semanasPares(diaObligatorio(DOMINGO_SEMANA_A), diaObligatorio(fechaAncla)) ? 'A' : 'B'
}

/** "Semanal", or "Quincenal (semana A) · próximo 18 oct". */
export function textoFrecuencia(frecuencia: FrecuenciaTurno, hoy: string): string {
  if (frecuencia.frecuencia === 'semanal' || frecuencia.fechaAncla === null) return 'Semanal'
  const proximo = new Date(diaObligatorio(proximoDomingoDeServicio(frecuencia, hoy)) * DIA_MS)
  return `Quincenal (semana ${semanaDeAncla(frecuencia.fechaAncla)}) · próximo ${proximo.getUTCDate()} ${MESES[proximo.getUTCMonth()]}`
}

export type ResultadoFrecuencia =
  | { readonly ok: true; readonly valor: FrecuenciaTurno }
  | { readonly ok: false; readonly message: string }

/** Validates `{ frecuencia, fechaAncla }` from a request; absent = `semanal`. */
export function validarFrecuencia(entrada: unknown): ResultadoFrecuencia {
  if (entrada === undefined || entrada === null) return { ok: true, valor: FRECUENCIA_SEMANAL }
  const { frecuencia, fechaAncla } = entrada as { frecuencia?: unknown; fechaAncla?: unknown }
  if (frecuencia === undefined || frecuencia === 'semanal') return { ok: true, valor: FRECUENCIA_SEMANAL }
  if (frecuencia !== 'quincenal') return { ok: false, message: 'La frecuencia debe ser semanal o quincenal.' }
  if (typeof fechaAncla !== 'string' || !esDomingo(fechaAncla)) {
    return { ok: false, message: 'Un turno quincenal necesita un domingo de referencia.' }
  }
  return { ok: true, valor: { frecuencia: 'quincenal', fechaAncla } }
}
