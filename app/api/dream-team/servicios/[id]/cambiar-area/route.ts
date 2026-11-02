/**
 * Dream Team — /api/dream-team/servicios/[id]/cambiar-area
 * (odd/tasks/dream-team-cambiar-area.md, T2, S3 and S5).
 *
 * GET  → { destinos, nivelActual }: the áreas the servicio may move to
 *        (dream_team_cambiar_area_destinos: every active área but its own,
 *        with `dirige` and the active roles) and the nivel of its current rol,
 *        so the dialog proposes the same nivel in the destination.
 * POST { modo, equipoId, rolId, motivo, nota? } → { modo, id }: `directo`
 *        moves it (dream_team_cambiar_area → the new servicio), `solicitud`
 *        asks a director of both áreas (dream_team_solicitar_cambio_area →
 *        the request).
 *
 * No capability gate here, as in the ficha route: the functions check
 * director authority over the current área (and the destination for a direct
 * move) and answer 42501 → 403 or 22023 → 422 with a Spanish message the
 * dialog shows as is.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import {
  mapCambioAreaError,
  mapDestinos,
  parseCambioArea,
  rpcCambioArea,
} from '@/lib/platform/dream-team/cambiar-area'

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

function fallo(error: { code?: string; message?: string }, metodo: string) {
  const f = mapCambioAreaError(error)
  if (f.status === 500) console.error(`[dream-team/servicios/[id]/cambiar-area ${metodo}] error:`, error)
  return NextResponse.json({ error: f.error }, { status: f.status })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!esUuid(id)) return NextResponse.json({ error: 'Servicio inválido' }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const { data, error } = await rpcCambioArea(supabase)('dream_team_cambiar_area_destinos', { p_servicio: id })
    if (error) return fallo(error, 'GET')

    // The authority check passed, so the caller reads the servicio and its roles (RLS).
    const repo = createSupabaseDreamTeamRepository(supabase)
    const servicio = await repo.getServicioById(id)
    const rol = servicio ? (await repo.listRolesPorEquipo(servicio.equipoId)).find((r) => r.id === servicio.rolId) : undefined
    return NextResponse.json({ destinos: mapDestinos(data), nivelActual: rol?.nivel ?? null })
  } catch (error) {
    console.error('[dream-team/servicios/[id]/cambiar-area GET] error:', error)
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
    const input = parseCambioArea(body)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })
    const { modo, equipoId, rolId, motivo, nota } = input.datos

    const funcion = modo === 'directo' ? 'dream_team_cambiar_area' : 'dream_team_solicitar_cambio_area'
    const { data, error } = await rpcCambioArea(await createSupabaseServerClient())(funcion, {
      p_servicio: id,
      p_equipo_destino: equipoId,
      p_rol_destino: rolId,
      p_motivo: motivo,
      p_nota: nota,
    })
    if (error) return fallo(error, 'POST')
    return NextResponse.json({ modo, id: data })
  } catch (error) {
    console.error('[dream-team/servicios/[id]/cambiar-area POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
