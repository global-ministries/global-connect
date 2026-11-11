/**
 * R3j (odd/tasks/talleres-rediseno.md, S9) — how many people asked
 * «Avísame si se libera un lugar» for this edición and were not notified
 * yet. `taller_avisame_lugar` is revoked for `authenticated`, so the count
 * comes from talleres_avisame_lugar_contar
 * (20261111140000_talleres_origen_admin_y_avisame_conteo): count only, no
 * names or emails, and only for ediciones the caller directs or coordinates (no row
 * otherwise).
 *
 * Best effort: an error, a thrown call, a missing row or a malformed value
 * all read as 0, and the page then shows nothing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
type AnyClient = any

export async function cargarEsperanLugar(client: AnyClient, edicionId: string): Promise<number> {
  try {
    const { data, error } = await client.rpc('talleres_avisame_lugar_contar', { p_edicion_ids: [edicionId] })
    if (error || !Array.isArray(data)) return 0
    const fila = (data as Array<Record<string, unknown>>).find((r) => r.edicion_id === edicionId)
    const pendientes = fila?.pendientes
    return typeof pendientes === 'number' && Number.isInteger(pendientes) && pendientes > 0 ? pendientes : 0
  } catch {
    return 0
  }
}
