/**
 * Dream Team — /api/dream-team/servicios/[id]/cambiar-rol
 * (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S3).
 *
 * GET  → { roles }: the roles of the servicio's own equipo with the current
 *        one marked (`actual`) and those the caller may pick (`asignable`)
 *        (dream_team_servicio_roles_cambiables).
 * POST { rolId, nota? } → { servicioId, rolAnteriorId, rolId, rolLabel }:
 *        changes the rol at once (dream_team_servicio_cambiar_rol).
 *
 * No capability gate here, as in the cambiar-área route: the functions check
 * the authority of «Cambiar de área» (dream_team_puede_solicitar_cambio_area)
 * and the guards for coordinators, and answer 42501 → 403 or 22023 → 422 with
 * a code this route turns into plain Spanish (mapCambioRolError).
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { rpcCambioArea } from '@/lib/platform/dream-team/cambiar-area'
import { mapCambioRolError, mapRolesCambiables, parseCambioRol } from '@/lib/platform/dream-team/cambiar-rol'

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

function fallo(error: { code?: string; message?: string }, metodo: string) {
  const f = mapCambioRolError(error)
  if (f.status === 500) console.error(`[dream-team/servicios/[id]/cambiar-rol ${metodo}] error:`, error)
  return NextResponse.json({ error: f.error }, { status: f.status })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!esUuid(id)) return NextResponse.json({ error: 'Servicio inválido' }, { status: 400 })

    const { data, error } = await rpcCambioArea(await createSupabaseServerClient())('dream_team_servicio_roles_cambiables', {
      p_servicio: id,
    })
    if (error) return fallo(error, 'GET')
    return NextResponse.json({ roles: mapRolesCambiables(data) })
  } catch (error) {
    console.error('[dream-team/servicios/[id]/cambiar-rol GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!esUuid(id)) return NextResponse.json({ error: 'Servicio inválido' }, { status: 400 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const input = parseCambioRol(body)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const { data, error } = await rpcCambioArea(await createSupabaseServerClient())('dream_team_servicio_cambiar_rol', {
      p_servicio: id,
      p_rol: input.datos.rolId,
      p_nota: input.datos.nota,
    })
    if (error) return fallo(error, 'POST')
    const r = (data ?? {}) as Record<string, unknown>
    return NextResponse.json({
      servicioId: r.servicio_id ?? id,
      rolAnteriorId: r.rol_anterior_id ?? null,
      rolId: r.rol_id ?? input.datos.rolId,
      rolLabel: r.rol_label ?? null,
    })
  } catch (error) {
    console.error('[dream-team/servicios/[id]/cambiar-rol POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
