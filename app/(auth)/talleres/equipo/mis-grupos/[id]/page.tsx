/**
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — REQUIERE_PUENTE
 * bridge for the old `/talleres/equipo/mis-grupos/[id]` grupo detail.
 * This id never had a page of its own (only its `asistencia` and
 * `reporte` subroutes did — see rutas.ts), but the old→new inventory
 * covers it too: a bookmark or shared link to it must not 404. Resolves
 * the grupo id to its new home, `/talleres/[taller]/[edicion]/[grupo]`
 * (T5), via `resolveGrupoBridge` — no lookup a static redirect could do,
 * since the old URL never carried the taller slug or edición id the new
 * tree threads into the path.
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { resolveGrupoBridge } from '@/lib/platform/talleres/bridges'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function MisGrupoBridgePage(ctx: RouteContext) {
  const { id } = await ctx.params

  if (isTalleresEnabled()) {
    const supabase = await createSupabaseServerClient()
    const destino = await resolveGrupoBridge(supabase, id)
    if (destino) redirect(destino)
  }

  // Not found, RLS-denied, or the flag is off — never a 404 (acceptance
  // criterion 1): fall back to the catalog, which itself renders the
  // disabled-module card when the flag is off.
  redirect(rutaCatalogo())
}
