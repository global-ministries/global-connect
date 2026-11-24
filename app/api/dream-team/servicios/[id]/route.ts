import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { borrarServicioRetirado, createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { hasDreamTeamReadCapability, hasDreamTeamWriteCapability, isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { DREAM_TEAM_MOTIVOS, personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamMotivo, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { transitionWithGrants } from '@/lib/platform/dream-team/servicios'
import { guardaHistorialServicio } from '@/lib/platform/dream-team/historial-servicio'
import { createPlatformGrantAudit } from '@/lib/platform/grants'

type Ctx = { params: Promise<{ id: string }> | { id: string } }
type Sesion = NonNullable<Awaited<ReturnType<typeof requireDreamTeamSession>>>
type Repo = ReturnType<typeof createSupabaseDreamTeamRepository>
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })
const conflicto = () => NextResponse.json({ error: 'Conflicto de versión' }, { status: 409 })

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

/** The session allowed to change a servicio, or the response that refuses it. */
async function sesionDeEscritura(): Promise<Sesion | NextResponse> {
  if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const s = await requireDreamTeamSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!hasDreamTeamWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
  return s
}

interface Transicion {
  readonly estado: DreamTeamEstado
  readonly motivo: DreamTeamMotivo
  readonly detalleMotivo?: string
  readonly expectedVersion: number
}

/**
 * One state change with its capability grants — the PATCH, and the retire
 * behind «Quitar de este equipo» (DELETE). Uses the user's client, so RLS
 * decides whether this session may update the servicio.
 */
async function transicionar(
  repo: Repo,
  s: Sesion,
  id: string,
  t: Transicion,
): Promise<{ readonly ok: true; readonly servicio: DreamTeamServicio } | { readonly ok: false; readonly respuesta: NextResponse }> {
  const servicio = await repo.getServicioById(id)
  if (!servicio) return { ok: false, respuesta: NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 }) }

  // equipo/rol mirror POST's lookup pattern (repo.listEquipos() / repo.listRolesPorEquipo(...)
  // by id). Without them, applyGrantsForTransition (called inside transitionWithGrants)
  // returns 'noop' and mints nothing — see lib/platform/dream-team/grants.ts. The rol's
  // nivel, not its label, decides the grants (odd/tasks/uno-a-uno.md, T6).
  const equipoRow = (await repo.listEquipos()).find((e) => e.id === servicio.equipoId)
  const equipo = equipoRow ? { id: equipoRow.id, experiencia: equipoRow.experiencia } : undefined
  const rolRow = equipoRow
    ? (await repo.listRolesPorEquipo(equipoRow.id)).find((r) => r.id === servicio.rolId)
    : undefined
  const rol = rolRow ? { id: rolRow.id, label: rolRow.label, nivel: rolRow.nivel } : undefined

  // previousSnapshot is intentionally NOT passed: with equipo + rol available but no
  // snapshot, applyGrantsForTransition recomputes the same set via buildGrantsForServicio,
  // so en_pausa → activo yields an identical grant set to what was revoked. And
  // dream_team_apply_servicio_grants is idempotent on 'grant' — it reactivates an
  // already-revoked row — so this round trip is correct either way. Persisting the
  // snapshot is a future optimization (skip recomputation), not a correctness requirement.
  // The actor is the session user (usuarios.id), never the volunteer: it signs both the
  // grant audit events and the history row the update appends.
  const actorPersonaId = personaId(s.personaId)
  const result = await transitionWithGrants({
    servicio,
    estadoNuevo: t.estado,
    motivo: t.motivo,
    detalleMotivo: t.detalleMotivo,
    actorPersonaId,
    fecha: new Date().toISOString(),
    audit: createPlatformGrantAudit(),
    equipo,
    rol,
  })
  if (!result.ok) return { ok: false, respuesta: NextResponse.json({ error: result.error.message }, { status: 400 }) }

  let updated
  try {
    // Update the servicio FIRST, then apply capability grants. The servicio update has
    // optimistic locking (expectedVersion): if we minted/revoked capabilities before it and
    // the update then failed, we'd be left with orphaned grants and no matching state change.
    // In this order, a capability-apply failure below still leaves the servicio transitioned,
    // which the caller can safely retry — dream_team_apply_servicio_grants is idempotent.
    updated = await repo.updateServicio(id, { estado: t.estado, motivoActual: t.motivo, detalleMotivo: t.detalleMotivo, expectedVersion: t.expectedVersion, actorPersonaId })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'CONCURRENCY_CONFLICT') return { ok: false, respuesta: conflicto() }
    throw error
  }

  const { grantsDecision } = result
  if (grantsDecision.action !== 'noop') {
    const accion = grantsDecision.action === 'revoke' ? 'revoke' : 'grant'
    try {
      await repo.applyServicioGrants(servicio.personaId, accion, grantsDecision.grants)
    } catch (grantError) {
      console.error('[dream-team/servicios/[id]] servicio state changed but applyServicioGrants failed:', grantError)
      return {
        ok: false,
        respuesta: NextResponse.json(
          { error: 'El estado del servicio se actualizó pero las capacidades no se pudieron aplicar. Reintentá la transición (es idempotente) o contactá a soporte.' },
          { status: 500 },
        ),
      }
    }
  }

  return { ok: true, servicio: updated }
}

/**
 * Until 2027-01-01 (S7, T8/T8b of odd/tasks/dream-team-estructura-correcciones.md),
 * a servicio this request just retired — grants already revoked — is deleted with
 * the admin client (`authenticated` has no DELETE) through
 * dream_team_servicio_borrar_si_sin_historial, the function the cambiar-área RPCs
 * call too; its history cascades with it. `true` when deleted, `false` when the
 * function kept it retired (attendance records, or the date passed), or the 500
 * that says it stayed retired when the delete failed.
 */
async function borrarSinRastro(id: string, metodo: string, mensaje: string): Promise<boolean | NextResponse> {
  try {
    return await borrarServicioRetirado(createSupabaseAdminClient(), id)
  } catch (error) {
    console.error(`[dream-team/servicios/[id]] ${metodo}: servicio retired but the delete failed:`, error)
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}

/**
 * «Cambiar etapa». Body: `{ estado, motivo, detalleMotivo?, expectedVersion }` →
 * `{ servicio, historial }`. Until 2027-01-01 00:00 Caracas a change to
 * `retirado` then deletes the servicio (`borrarSinRastro`) and answers
 * `{ servicio, historial: [], borrado: true }`: no retirado row nor history
 * remains (S7, T8b). If it was kept, or from that date on, the answer is the
 * usual one.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const s = await sesionDeEscritura()
    if (s instanceof NextResponse) return s
    const sinRastro = !guardaHistorialServicio(new Date())
    const id = await resolveId(ctx)
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const { estado, motivo, detalleMotivo, expectedVersion } = body as Record<string, unknown>
    if (!motivo || typeof motivo !== 'string' || !DREAM_TEAM_MOTIVOS.includes(motivo as never)) return bad('motivo es requerido y debe ser válido')
    if (expectedVersion === undefined || typeof expectedVersion !== 'number') return bad('expectedVersion es requerido')
    if (!estado || typeof estado !== 'string') return bad('estado es requerido')
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const r = await transicionar(repo, s, id, {
      estado: estado as DreamTeamEstado,
      motivo: motivo as DreamTeamMotivo,
      detalleMotivo: typeof detalleMotivo === 'string' ? detalleMotivo : undefined,
      expectedVersion,
    })
    if (!r.ok) return r.respuesta
    if (sinRastro && r.servicio.estado === 'retirado') {
      const borrado = await borrarSinRastro(id, 'PATCH', 'Se retiró, pero no se pudo borrar sin rastro: quedó como retirado.')
      if (borrado instanceof NextResponse) return borrado
      if (borrado) return NextResponse.json({ servicio: r.servicio, historial: [], borrado: true })
    }
    return NextResponse.json({ servicio: r.servicio, historial: await repo.listHistorial(id) })
  } catch (error) {
    console.error('[dream-team/servicios/[id]] PATCH error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

/**
 * «Quitar de este equipo» (S3, S7 of odd/tasks/dream-team-estructura-correcciones.md).
 * Body: `{ expectedVersion }`. Retires the servicio exactly as the PATCH to
 * `retirado` (same permission, version check, history row and grants revocation).
 * Until 2027-01-01 00:00 Caracas (`guardaHistorialServicio`) the retired row is
 * then deleted (`borrarSinRastro`) and the answer is `{ borrado: true }`: no
 * trace. If the delete fails the row stays retired (500 that says so); if the
 * SQL function keeps it (attendance records) the answer is the one from that
 * date on: it only retires, `{ servicio, historial }`.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const s = await sesionDeEscritura()
    if (s instanceof NextResponse) return s
    const sinRastro = !guardaHistorialServicio(new Date())
    const id = await resolveId(ctx)
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const { expectedVersion } = body as Record<string, unknown>
    if (expectedVersion === undefined || typeof expectedVersion !== 'number') return bad('expectedVersion es requerido')
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const r = await transicionar(repo, s, id, { estado: 'retirado', motivo: 'admin_retiro', expectedVersion })
    if (!r.ok) return r.respuesta
    if (sinRastro) {
      const borrado = await borrarSinRastro(id, 'DELETE', 'Se quitó de este equipo, pero no se pudo borrar sin rastro: quedó como retirado.')
      if (borrado instanceof NextResponse) return borrado
      if (borrado) return NextResponse.json({ borrado: true })
    }
    return NextResponse.json({ servicio: r.servicio, historial: await repo.listHistorial(id) })
  } catch (error) {
    console.error('[dream-team/servicios/[id]] DELETE error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
