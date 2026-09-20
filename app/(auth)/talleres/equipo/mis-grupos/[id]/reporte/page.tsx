/**
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — REQUIERE_PUENTE
 * bridge, replacing the old líder-only reporte final screen.
 *
 * Parent's control before deleting the old content (2026-09-20): this
 * screen was read-only (wrote nothing). The new grupo home
 * (`/talleres/[taller]/[edicion]/[grupo]`, T5) is its replacement per
 * the "Decisiones" tree ("su gente · clases · asistencia · reporte"),
 * so redirecting there loses no real functionality.
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { resolveGrupoBridge } from '@/lib/platform/talleres/bridges'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function ReporteBridgePage(ctx: RouteContext) {
  const { id } = await ctx.params

  if (isTalleresEnabled()) {
    const supabase = await createSupabaseServerClient()
    const destino = await resolveGrupoBridge(supabase, id)
    if (destino) redirect(destino)
  }

  redirect(rutaCatalogo())
}
