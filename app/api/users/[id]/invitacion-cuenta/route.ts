/**
 * /api/users/[id]/invitacion-cuenta — account invitations by email (T12 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 *
 * GET  → { estado: { sinCuenta, emailFicha, invitacion } } for whoever may
 *        invite (admin, pastor, or the volunteer coordinator over the
 *        person's area); 404 for anyone else.
 * POST { email, reemplazarEmail? } → { ok, email }: records the invitation
 *        as the caller (the database is the authority:
 *        invitacion_cuenta_crear, 20261008120000), creates the auth account
 *        and mails the link. See lib/platform/cuentas/invitacion-cuenta.ts.
 * DELETE → { ok }: cancels the open invitation as the caller
 *        (invitacion_cuenta_cancelar, 20261102160000) and deletes its auth
 *        account when it was never confirmed (S6 of
 *        odd/tasks/invitaciones-pendientes.md). 403 sin_autoridad, 409 when
 *        there is no open invitation.
 */
import { NextRequest, NextResponse } from 'next/server'

import { dependencias, rpcSinTipos, sesion } from '@/lib/platform/cuentas/dependencias-invitacion'
import {
  enviarInvitacionCuenta,
  mapEstadoInvitacion,
  parseInvitacion,
} from '@/lib/platform/cuentas/invitacion-cuenta'
import { cancelarInvitacionCuenta } from '@/lib/platform/cuentas/invitaciones-pendientes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!UUID.test(id)) return NextResponse.json({ error: 'Persona inválida' }, { status: 400 })

    const { data, error } = await rpcSinTipos(supabase)('invitacion_cuenta_estado', { p_usuario_id: id })
    if (error) {
      console.error('[users/[id]/invitacion-cuenta GET] error:', error.code)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
    const estado = mapEstadoInvitacion(data)
    if (!estado) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
    return NextResponse.json({ estado })
  } catch (error) {
    console.error('[users/[id]/invitacion-cuenta GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!UUID.test(id)) return NextResponse.json({ error: 'Persona inválida' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const entrada = parseInvitacion(body)
    if ('error' in entrada) return NextResponse.json({ error: entrada.error }, { status: 400 })

    const r = await enviarInvitacionCuenta(dependencias(supabase), id, entrada)
    if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status })
    return NextResponse.json({ ok: true, email: r.email })
  } catch (error) {
    console.error('[users/[id]/invitacion-cuenta POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!UUID.test(id)) return NextResponse.json({ error: 'Persona inválida' }, { status: 400 })

    const r = await cancelarInvitacionCuenta(dependencias(supabase), id)
    if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[users/[id]/invitacion-cuenta DELETE] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
