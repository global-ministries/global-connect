/**
 * PR20 — Coordinador scoped grupo management for one edición (C).
 *
 * A coordinador administers the grupos of THEIR taller exactly like an admin,
 * but confined to their dream_team equipo. This page mirrors the admin edición
 * detail's <GruposSection> (create/edit/cancel grupos, assign/remove líderes),
 * gated by requireOperacionalRole() plus a fail-closed equipo scope check:
 *   - 'D' (global director/admin) bypasses;
 *   - 'C' must own the cohorte's equipo (scopedEquipoIds);
 *   - anything else is notFound().
 *
 * The route [id] is the EDICIÓN id (taller_ediciones.id), matching
 * loadEdicionLocalDetalle. RLS + the /api/talleres/grupos* capability gates are
 * the real security wall; the scope check only keeps a coordinador off a page
 * whose grupos their row-level scope would forbid them to edit.
 */
import { notFound } from 'next/navigation'

import { DashboardPage } from '@/components/talleres/dashboard-page'
import { GruposSection } from '@/app/(auth)/admin/talleres/edicion/[id]/grupos-section'

import {
  coordPuedeGestionarEquipo,
  loadEdicionLocalDetalle,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Grupos del taller' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function CoordEdicionGruposPage(routeCtx: RouteContext) {
  const ctx = await requireOperacionalRole()
  const { id } = await routeCtx.params

  const detalle = await loadEdicionLocalDetalle(ctx.supabase, id)
  if (!detalle || !detalle.cohorte) {
    notFound()
  }

  // Fail-closed equipo scope: a coordinador may only manage grupos of an
  // edición whose cohorte belongs to one of their scoped equipos. A global
  // director ('D') bypasses; leads ('L') are denied.
  if (!coordPuedeGestionarEquipo(ctx, detalle.cohorte.dream_team_equipo_id)) {
    notFound()
  }

  return (
    <DashboardPage
      titulo={detalle.nombre_snapshot}
      botonRegreso={{ href: '/talleres/coordinacion/talleres', texto: 'Talleres' }}
    >
      <GruposSection cohorteId={detalle.cohorte.id} />
    </DashboardPage>
  )
}
