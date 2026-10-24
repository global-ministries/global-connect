/**
 * POST /api/ninos/familia/[id]/invitar — right after "Nueva familia" at the
 * table, the operator invites the NEW adult to create an account (G5 of
 * odd/tasks/ninos-cobertura.md).
 *
 * { email } → { ok, email } | { error, codigo? }. The invitation row is
 * created by ninos_familia_invitar AS THE CALLER, for exactly the ficha of
 * the URL: only the operator who registered it, within one hour.
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
    const deps = dependenciasInvitacionNinos((email) => rpc('ninos_familia_invitar', { p_padre_id: id, p_email: email }))
    const r = await invitarFamiliaNueva(deps, id, body)
    return NextResponse.json(r.body, { status: r.status })
  } catch {
    console.error('[ninos/familia/invitar] error inesperado')
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
