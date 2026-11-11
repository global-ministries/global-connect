/**
 * T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — the practical
 * details of an edición that travel in the notices: «Lugar»
 * (taller_ediciones.lugar, 1..200) and «Indicaciones para los
 * participantes» (taller_ediciones.indicaciones, ..500: what to bring,
 * where to enter, parking). Shared by the create form, the edit dialog and
 * their server actions, so the limits and the blank → NULL rule live in
 * one place (the table CHECKs are the last word).
 */

export const LUGAR_MAX = 200
export const INDICACIONES_MAX = 500

export const MENSAJE_LUGAR_LARGO = `El lugar no puede superar los ${LUGAR_MAX} caracteres.`
export const MENSAJE_INDICACIONES_LARGAS = `Las indicaciones no pueden superar los ${INDICACIONES_MAX} caracteres.`

export interface DatosPracticos {
  readonly lugar: string | null
  readonly indicaciones: string | null
}

export type DatosPracticosValidados =
  | ({ readonly ok: true } & DatosPracticos)
  | { readonly ok: false; readonly message: string }

function limpiar(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const recortado = valor.trim()
  return recortado === '' ? null : recortado
}

/** Trims both fields (blank → null) and checks their length. */
export function validarDatosPracticos(entrada: {
  readonly lugar?: unknown
  readonly indicaciones?: unknown
}): DatosPracticosValidados {
  const lugar = limpiar(entrada.lugar)
  const indicaciones = limpiar(entrada.indicaciones)
  if (lugar !== null && lugar.length > LUGAR_MAX) return { ok: false, message: MENSAJE_LUGAR_LARGO }
  if (indicaciones !== null && indicaciones.length > INDICACIONES_MAX) {
    return { ok: false, message: MENSAJE_INDICACIONES_LARGAS }
  }
  return { ok: true, lugar, indicaciones }
}

export function tieneDatosPracticos(datos: DatosPracticos): boolean {
  return datos.lugar !== null || datos.indicaciones !== null
}
