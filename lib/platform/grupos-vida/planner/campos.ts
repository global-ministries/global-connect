/**
 * Planner — defensive readers for single values of an RPC row. Each returns
 * `null` (or an empty list) instead of throwing, so the row parsers in
 * tipos.ts decide whether a missing value drops the row.
 */

export type Objeto = Readonly<Record<string, unknown>>

export const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

/** A non-blank string (ids, required names), trimmed. */
export const id = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null)

/** An optional text as it comes; blank or non-string is null. */
export const textoOpcional = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() !== '' ? valor : null)

/** A name part: missing is ''. */
export const textoOVacio = (valor: unknown): string => (typeof valor === 'string' ? valor : '')

/** An integer; PostgREST may send a bigint as text. */
export const entero = (valor: unknown): number | null => {
  const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor
  return typeof numero === 'number' && Number.isInteger(numero) ? numero : null
}

export const booleano = (valor: unknown): boolean | null => (typeof valor === 'boolean' ? valor : null)

/** The non-blank strings of a list; anything else is skipped. */
export const ids = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.map(id).filter((elemento): elemento is string => elemento !== null) : []

/** Counts what a parser drops, across rows and nested lists. */
export class Descartes {
  private cantidad = 0

  contar(n = 1): void {
    this.cantidad += n
  }

  get total(): number {
    return this.cantidad
  }
}

/** Reads a list with `leer`; null results are dropped and counted. */
export function lista<T>(valor: unknown, leer: (elemento: unknown) => T | null, descartes: Descartes): T[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((elemento) => {
    const leido = leer(elemento)
    if (leido === null) descartes.contar()
    return leido === null ? [] : [leido]
  })
}
