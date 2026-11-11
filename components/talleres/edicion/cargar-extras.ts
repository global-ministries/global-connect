/**
 * R3f (odd/tasks/talleres-rediseno.md) — the two columns of
 * `taller_inscripciones` the v2 edición list needs that
 * `loadAdminInscripciones` does not select: where the inscription came from
 * (`origen`: publico | app | admin) and whether a public reservation left
 * its identity unconfirmed (`por_verificar`,
 * 20261110121000_talleres_inscripcion_core).
 *
 * Same read as /talleres/pendientes' `cargarExtras`
 * (lib/platform/talleres/pendientes.ts, not exported): one batched select
 * under the caller's own RLS (the same `taller_inscripciones_select` that
 * already returned the rows). A failure leaves the map empty: the rows
 * still show, without origen or the identity flag.
 */

import { esOrigen, type ExtraInscripcion } from './modelo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
type AnyClient = any

export async function cargarExtrasInscripciones(
  client: AnyClient,
  ids: readonly string[],
): Promise<Map<string, ExtraInscripcion>> {
  const extras = new Map<string, ExtraInscripcion>()
  if (ids.length === 0) return extras
  try {
    const { data, error } = await client
      .from('taller_inscripciones')
      .select('id, origen, por_verificar')
      .in('id', ids)
    if (error) return extras
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      if (typeof r.id !== 'string') continue
      extras.set(r.id, {
        origen: esOrigen(r.origen) ? r.origen : null,
        porVerificar: r.por_verificar === true,
      })
    }
  } catch {
    return extras
  }
  return extras
}
