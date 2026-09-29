/**
 * Venezuelan phone rule. TypeScript mirror of the SQL function
 * `public.normalizar_telefono_ve` (supabase/migrations/
 * 20260929100000_usuarios_telefono_normalizado.sql): both share the same table
 * of cases (supabase/tests/usuarios-telefono-normalizado.test.sql and
 * __tests__/lib/utils/telefono.test.ts). Keep the three in sync.
 *
 * Canonical stored format: `04XXXXXXXXX`. Values that do not fit (foreign
 * numbers, zero filler, incomplete, text) are returned exactly as given.
 */

const MOVIL = '(?:412|414|416|422|424|426)'
const MARCAS_INVISIBLES = /[​-‏‪-‮⁠-⁩﻿]/g
const SOLO_CARACTERES_DE_TELEFONO = /^\+?[0-9  .()-]+$/

const REGLAS: ReadonlyArray<readonly [RegExp, (d: string) => string]> = [
  [new RegExp(`^0${MOVIL}\\d{7}$`), (d) => d],
  [new RegExp(`^${MOVIL}\\d{7}$`), (d) => `0${d}`],
  [new RegExp(`^58${MOVIL}\\d{7}$`), (d) => `0${d.slice(2)}`],
  [new RegExp(`^580${MOVIL}\\d{7}$`), (d) => d.slice(2)],
  [new RegExp(`^0058${MOVIL}\\d{7}$`), (d) => `0${d.slice(4)}`],
  [/^02\d{2}\d{7}$/, (d) => d],
  [/^582\d{2}\d{7}$/, (d) => `0${d.slice(2)}`],
]

const MOVIL_CANONICO = new RegExp(`^0${MOVIL}\\d{7}$`)
const FIJO_CANONICO = /^02\d{2}\d{7}$/

/** Applies the canonical rule; NULL stays NULL and unrecognized input is returned as is. */
export function normalizarTelefono(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const limpio = valor
    .replace(MARCAS_INVISIBLES, '')
    .replace(/^[\s ]+|[\s ]+$/g, '')
  if (limpio === '') return valor
  if (!SOLO_CARACTERES_DE_TELEFONO.test(limpio)) return valor
  const digitos = limpio.replace(/\D/g, '')
  for (const [patron, aplicar] of REGLAS) {
    if (patron.test(digitos)) return aplicar(digitos)
  }
  return valor
}

/** True when the value is (or normalizes to) a recognized Venezuelan number. */
export function esTelefonoReconocible(valor: string | null | undefined): boolean {
  const canonico = normalizarTelefono(valor)
  if (!canonico) return false
  return MOVIL_CANONICO.test(canonico) || FIJO_CANONICO.test(canonico)
}

/** `0412 545 7346`; a value that is not recognized is returned as given. */
export function formatearTelefono(valor: string | null | undefined): string {
  if (!valor) return ''
  if (!esTelefonoReconocible(valor)) return valor
  const c = normalizarTelefono(valor) as string
  return `${c.slice(0, 4)} ${c.slice(4, 7)} ${c.slice(7)}`
}

/** `https://wa.me/58412…`, only for valid Venezuelan mobile numbers. */
export function enlaceWhatsapp(valor: string | null | undefined): string | null {
  const canonico = normalizarTelefono(valor)
  if (!canonico || !MOVIL_CANONICO.test(canonico)) return null
  return `https://wa.me/58${canonico.slice(1)}`
}
