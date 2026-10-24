/**
 * Who sees "Mis 1 a 1" (odd/tasks/uno-a-uno.md, T7, S7.5): whoever leads
 * someone, supervises a chain (or is admin/pastor) or takes part in a 1:1,
 * from uno_a_uno_acceso() (supabase/migrations/20261024120000_uno_a_uno_supervision.sql).
 * Fails closed: an error or an unexpected payload means no access.
 */

export interface AccesoUnoAUno {
  readonly lidera: boolean
  readonly supervisa: boolean
  readonly participa: boolean
}

export const SIN_ACCESO_UNO_A_UNO: AccesoUnoAUno = { lidera: false, supervisa: false, participa: false }

export function parsearAccesoUnoAUno(
  resultado: { readonly data: unknown; readonly error: unknown } | null | undefined,
): AccesoUnoAUno {
  if (!resultado || resultado.error || !resultado.data || typeof resultado.data !== 'object') {
    return SIN_ACCESO_UNO_A_UNO
  }
  const { lidera, supervisa, participa } = resultado.data as Record<string, unknown>
  return { lidera: lidera === true, supervisa: supervisa === true, participa: participa === true }
}

export function veMisUnoAUno(acceso: AccesoUnoAUno): boolean {
  return acceso.lidera || acceso.supervisa || acceso.participa
}
