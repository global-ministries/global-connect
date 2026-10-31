/**
 * Usuarios dates: the one month abbreviation and short date of the list, the
 * person panel and the ficha ("1 sept 2026", as in the prototypes under
 * docs/design-system/prototipos/usuarios/). Only the YYYY-MM-DD prefix is
 * read, so a date never shifts with the browser's time zone. No I/O.
 */

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const

function partes(iso: string | null | undefined): { anio: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? { anio, mes, dia } : null
}

/** "1 sept 2026"; '' without a valid date. */
export function fechaCorta(iso: string | null | undefined): string {
  const p = partes(iso)
  return p ? `${p.dia} ${MESES_CORTOS[p.mes - 1]} ${p.anio}` : ''
}

/** "11 ago" (the curve's weeks and the historial); '' without a valid date. */
export function diaMes(iso: string | null | undefined): string {
  const p = partes(iso)
  return p ? `${p.dia} ${MESES_CORTOS[p.mes - 1]}` : ''
}
