/**
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — id-resolving bridges
 * for the old dynamic-id routes that have no straight-through static
 * redirect (rutas.ts's REQUIERE_PUENTE entries): a grupo id or an
 * edición id alone doesn't carry the taller SLUG the new tree threads
 * into the URL, so a plain next.config.mjs `source`/`destination` pair
 * (positional, no DB access) can't build the new path — see lib/
 * platform/talleres/rutas.ts's "Decisiones": "las de id dinámico, con
 * una página puente que resuelve el slug".
 *
 * Both resolvers compose EXISTING loaders (loadEdicionLocalDetalle,
 * loadGrupoDetalle) — no new query, no new RLS surface — and return
 * `null` on any failure (not found, or RLS denies the read) so the
 * calling bridge page always has a safe fallback and never renders a
 * 404 (odd/tasks/talleres-consolidar-pantallas.md, acceptance
 * criterion 1).
 */

import { loadEdicionLocalDetalle } from './operacional'
import { loadGrupoDetalle } from './grupo-detalle'
import { rutaEdicion, rutaGrupo } from './rutas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
type AnyClient = any

/**
 * `/admin/talleres/edicion/[id]` -> `/talleres/[taller]/[edicion]`.
 * `id` is the edición's own id — loadEdicionLocalDetalle already joins
 * to the abstract taller for its slug, so one lookup is enough.
 */
export async function resolveEdicionBridge(
  client: AnyClient,
  edicionId: string,
): Promise<string | null> {
  const edicion = await loadEdicionLocalDetalle(client, edicionId)
  if (!edicion) return null
  return rutaEdicion(edicion.taller_slug, edicion.id)
}

/**
 * `/talleres/equipo/mis-grupos/[id]` (and its `.../asistencia`,
 * `.../reporte` subroutes) -> `/talleres/[taller]/[edicion]/[grupo]`.
 * `id` is the grupo's own id, which only carries its edición id
 * (loadGrupoDetalle) — a second lookup resolves that edición's taller
 * slug the same way resolveEdicionBridge does.
 */
export async function resolveGrupoBridge(
  client: AnyClient,
  grupoId: string,
): Promise<string | null> {
  const grupo = await loadGrupoDetalle(client, grupoId)
  if (!grupo) return null
  const edicion = await loadEdicionLocalDetalle(client, grupo.edicionId)
  if (!edicion) return null
  return rutaGrupo(edicion.taller_slug, grupo.edicionId, grupo.id)
}
