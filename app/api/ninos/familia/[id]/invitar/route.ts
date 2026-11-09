/**
 * POST /api/ninos/familia/[id]/invitar — the desk invites the parent of a
 * family without an account to create one: right after "Nueva familia" (G5
 * of odd/tasks/ninos-cobertura.md) or at any later visit from the family
 * card (T2k of odd/tasks/ninos-checkin-pco.md, S9.9).
 *
 * { email } → { ok, email } | { error, codigo? }. The invitation row is
 * created by ninos_familia_cuenta_invitar AS THE CALLER, for exactly the
 * ficha of the URL: anfitriones and coordinación of the family's campus,
 * one invitation per family every 10 minutes (429 invitacion_reciente).
 */
import { NextRequest, NextResponse } from 'next/server'

import { invitarFamiliaNueva } from '@/lib/platform/ninos/invitar-familia'

import { rpcSinTipos, sesion } from '../../../_lib/avisos'
import { dependenciasInvitacionNinos } from '../../../_lib/invitacion'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await ctx.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Persona inválida' }, { status: 400 })
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }) }

    const rpc = rpcSinTipos(supabase)
    const deps = dependenciasInvitacionNinos((email) => rpc('ninos_familia_cuenta_invitar', { p_padre_id: id, p_email: email }))
    const r = await invitarFamiliaNueva(deps, id, body)
    return NextResponse.json(r.body, { status: r.status })
  } catch {
    console.error('[ninos/familia/invitar] error inesperado')
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
