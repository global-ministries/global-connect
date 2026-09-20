/**
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — REQUIERE_PUENTE
 * bridge, replacing this route's old read-only projection screen
 * (cohorte, período general, inscripciones, certificados, transition
 * actions). `/talleres/[taller]/[edicion]` (T4) is its replacement; this
 * page's only job now is resolving the edición id to that new path and
 * redirecting there — no lookup a static next.config.mjs redirect could
 * do, since the old URL never carried the taller slug the new tree
 * threads into the path (rutas.ts's REQUIERE_PUENTE).
 *
 * `./actions.ts` (openExistingEdicionAction, closeExistingEdicionAction)
 * is untouched and stays alive: `components/talleres/open-edicion-
 * button.tsx` still imports it directly, and that component is used by
 * the NEW `/talleres/[taller]/[edicion]` page too.
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { resolveEdicionBridge } from '@/lib/platform/talleres/bridges'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function EdicionBridgePage(ctx: RouteContext) {
  const { id } = await ctx.params

  if (isTalleresEnabled()) {
    const supabase = await createSupabaseServerClient()
    const destino = await resolveEdicionBridge(supabase, id)
    if (destino) redirect(destino)
  }

  // Not found, RLS-denied, or the flag is off — never a 404 (acceptance
  // criterion 1): fall back to the catalog, which itself renders the
  // disabled-module card when the flag is off.
  redirect(rutaCatalogo())
}
