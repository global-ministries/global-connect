/**
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — REQUIERE_PUENTE
 * bridge, replacing the old líder-only asistencia screen.
 *
 * Parent's control before deleting the old content (2026-09-20): this
 * screen was read-only (wrote nothing) and only ever rendered anything
 * once the caller hand-typed `?sesion_id=<uuid>` into the address bar —
 * otherwise it showed "Proporcioná ?sesion_id=<id> en la URL." The new
 * grupo home (`/talleres/[taller]/[edicion]/[grupo]`, T5) already shows
 * attendance per clase without that manual step, so redirecting there
 * loses no real functionality; the `?sesion_id=` query string itself
 * (never anything more than a plain uuid) has no meaning outside the old
 * screen and is not preserved.
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { resolveGrupoBridge } from '@/lib/platform/talleres/bridges'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function AsistenciaBridgePage(ctx: RouteContext) {
  const { id } = await ctx.params

  if (isTalleresEnabled()) {
    const supabase = await createSupabaseServerClient()
    const destino = await resolveGrupoBridge(supabase, id)
    if (destino) redirect(destino)
  }

  redirect(rutaCatalogo())
}
