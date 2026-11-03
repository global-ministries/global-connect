/**
 * Dream Team — POST /api/dream-team/solicitudes-cambio-area/[id]
 * (odd/tasks/dream-team-cambiar-area.md, T2, T3, S5, S7).
 *
 * { aprobar, respuesta? } → { id }: a director of both áreas or the Atención
 * al Voluntario coordinator of the dirección (never the requester) approves (the
 * move happens; `id` is the new servicio) or rejects (`id` null) a pending
 * request, through dream_team_resolver_solicitud_cambio_area, which checks
 * the authority and that the servicio did not change (42501 → 403, 22023 →
 * 422, with its Spanish message).
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { mapCambioAreaError, parseResolverSolicitud, rpcCambioArea } from '@/lib/platform/dream-team/cambiar-area'

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!esUuid(id)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const input = parseResolverSolicitud(body)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const { data, error } = await rpcCambioArea(await createSupabaseServerClient())('dream_team_resolver_solicitud_cambio_area', {
      p_solicitud: id,
      p_aprobar: input.aprobar,
      p_respuesta: input.respuesta,
    })
    if (error) {
      const f = mapCambioAreaError(error)
      if (f.status === 500) console.error('[dream-team/solicitudes-cambio-area/[id] POST] error:', error)
      return NextResponse.json({ error: f.error }, { status: f.status })
    }
    return NextResponse.json({ id: data ?? null })
  } catch (error) {
    console.error('[dream-team/solicitudes-cambio-area/[id] POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
