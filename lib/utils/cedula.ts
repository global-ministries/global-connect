/**
 * Venezuelan cedula rule. TypeScript mirror of the SQL function
 * `public.normalizar_cedula_ve` (supabase/migrations/
 * 20260929120000_usuarios_cedula_normalizada.sql): both share the same table
 * of cases (supabase/tests/usuarios-cedula-normalizada.test.sql and
 * __tests__/lib/utils/cedula.test.ts). Keep the three in sync.
 *
 * Canonical stored format: Venezuelan = 6 to 8 digits (`22328215`, the V is
 * dropped); foreign = `E` + 6 to 9 digits (`E81110494`). Values that do not fit
 * (phones, foreign numbers, zero filler, text) are returned exactly as given.
 */

const MARCAS_INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g
const SEPARADORES = /[\s\u00A0.\-]/g
const VENEZOLANA = /^V?(\d{6,8})$/
const EXTRANJERA = /^E\d{6,9}$/

/** Applies the canonical rule; NULL stays NULL and unrecognized input is returned as is. */
export function normalizarCedula(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const limpio = valor
    .replace(MARCAS_INVISIBLES, '')
    .replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '')
  if (limpio === '') return valor
  const clave = limpio.replace(SEPARADORES, '').toUpperCase()
  const venezolana = VENEZOLANA.exec(clave)
  if (venezolana) return venezolana[1]
  if (EXTRANJERA.test(clave)) return clave
  return valor
}

/** True when the value is (or normalizes to) a recognized cedula. */
export function esCedulaReconocible(valor: string | null | undefined): boolean {
  const canonica = normalizarCedula(valor)
  if (!canonica) return false
  return /^\d{6,8}$/.test(canonica) || EXTRANJERA.test(canonica)
}

/** `22.328.215` for Venezuelan, `E-81110494` for foreign; unrecognized values are returned as given. */
export function formatearCedula(valor: string | null | undefined): string {
  if (!valor) return ''
  if (!esCedulaReconocible(valor)) return valor
  const canonica = normalizarCedula(valor) as string
  if (canonica.startsWith('E')) return `E-${canonica.slice(1)}`
  return canonica.replace(/\B(?=(\d{3})+$)/g, '.')
}
