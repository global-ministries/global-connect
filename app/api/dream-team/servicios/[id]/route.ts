import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { hasDreamTeamReadCapability, hasDreamTeamWriteCapability, isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { DREAM_TEAM_MOTIVOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamMotivo } from '@/lib/platform/dream-team/types'
import { transitionWithGrants } from '@/lib/platform/dream-team/servicios'
import { createPlatformGrantAudit } from '@/lib/platform/grants'

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const servicio = await repo.getServicioById(id)
    if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    const [historial, verificaciones] = await Promise.all([repo.listHistorial(id), repo.listRequisitoVerificaciones(id)])
    return NextResponse.json({ servicio, historial, verificaciones })
  } catch (error) {
    console.error('[dream-team/servicios/[id]] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const { estado, motivo, detalleMotivo, expectedVersion } = body as Record<string, unknown>
    if (!motivo || typeof motivo !== 'string' || !DREAM_TEAM_MOTIVOS.includes(motivo as never)) return bad('motivo es requerido y debe ser válido')
    if (expectedVersion === undefined || typeof expectedVersion !== 'number') return bad('expectedVersion es requerido')
    if (!estado || typeof estado !== 'string') return bad('estado es requerido')
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const servicio = await repo.getServicioById(id)
    if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    // equipo/rol mirror POST's lookup pattern (repo.listEquipos() / repo.listRolesPorEquipo(...)
    // by id). Without them, applyGrantsForTransition (called inside transitionWithGrants)
    // returns 'noop' and mints nothing — see lib/platform/dream-team/grants.ts.
    const equipoRow = (await repo.listEquipos()).find((e) => e.id === servicio.equipoId)
    const equipo = equipoRow ? { id: equipoRow.id, experiencia: equipoRow.experiencia } : undefined
    const rolRow = equipoRow
      ? (await repo.listRolesPorEquipo(equipoRow.id)).find((r) => r.id === servicio.rolId)
      : undefined
    const rol = rolRow ? { id: rolRow.id, label: rolRow.label } : undefined

    // previousSnapshot is intentionally NOT passed: with equipo + rol available but no
    // snapshot, applyGrantsForTransition recomputes the same set via buildGrantsForServicio,
    // so en_pausa → activo yields an identical grant set to what was revoked. And
    // dream_team_apply_servicio_grants is idempotent on 'grant' — it reactivates an
    // already-revoked row — so this round trip is correct either way. Persisting the
    // snapshot is a future optimization (skip recomputation), not a correctness requirement.
    const result = await transitionWithGrants({
      servicio,
      estadoNuevo: estado as DreamTeamEstado,
      motivo: motivo as DreamTeamMotivo,
      detalleMotivo: typeof detalleMotivo === 'string' ? detalleMotivo : undefined,
      actorPersonaId: s.personaId,
      fecha: new Date().toISOString(),
      audit: createPlatformGrantAudit(),
      equipo,
      rol,
    })
    if (!result.ok) return NextResponse.json({ error: result.error.message }, { status: 400 })

    let updated
    try {
      // Update the servicio FIRST, then apply capability grants. The servicio update has
      // optimistic locking (expectedVersion): if we minted/revoked capabilities before it and
      // the update then failed, we'd be left with orphaned grants and no matching state change.
      // In this order, a capability-apply failure below still leaves the servicio transitioned,
      // which the caller can safely retry — dream_team_apply_servicio_grants is idempotent.
      updated = await repo.updateServicio(id, { estado: estado as DreamTeamEstado, motivoActual: motivo as DreamTeamMotivo, detalleMotivo: typeof detalleMotivo === 'string' ? detalleMotivo : undefined, expectedVersion })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'CONCURRENCY_CONFLICT') return NextResponse.json({ error: 'Conflicto de versión' }, { status: 409 })
      throw error
    }

    const { grantsDecision } = result
    if (grantsDecision.action !== 'noop') {
      const accion = grantsDecision.action === 'revoke' ? 'revoke' : 'grant'
      try {
        await repo.applyServicioGrants(servicio.personaId, accion, grantsDecision.grants)
      } catch (grantError) {
        console.error('[dream-team/servicios/[id]] PATCH: servicio state changed but applyServicioGrants failed:', grantError)
        return NextResponse.json(
          { error: 'El estado del servicio se actualizó pero las capacidades no se pudieron aplicar. Reintentá la transición (es idempotente) o contactá a soporte.' },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ servicio: updated, historial: await repo.listHistorial(id) })
  } catch (error) {
    console.error('[dream-team/servicios/[id]] PATCH error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
