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
 */
import { createElement } from 'react'
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { InvitacionCuentaEmail } from '@/lib/email/invitacion-cuenta-email'
import {
  enviarInvitacionCuenta,
  mapEstadoInvitacion,
  parseInvitacion,
  type DependenciasInvitacion,
} from '@/lib/platform/cuentas/invitacion-cuenta'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The functions are not in the generated database types yet, so the call is untyped.
type Rpc = DependenciasInvitacion['rpcUsuario']
const rpcSinTipos = (cliente: { rpc: unknown }): Rpc =>
  (cliente.rpc as (...a: unknown[]) => ReturnType<Rpc>).bind(cliente) as Rpc

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

async function sesion() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data?.user ? null : supabase
}

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

function dependencias(supabase: { rpc: unknown }): DependenciasInvitacion {
  const admin = createSupabaseAdminClient()
  return {
    rpcUsuario: rpcSinTipos(supabase),
    admin: {
      rpc: rpcSinTipos(admin),
      obtenerUsuario: async (id) => {
        const { data, error } = await admin.auth.admin.getUserById(id)
        if (error || !data?.user) return null
        return { email: data.user.email ?? '', email_confirmed_at: data.user.email_confirmed_at ?? null }
      },
      borrarUsuario: async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id)
        return { error: error ? { message: error.message } : null }
      },
      generarEnlace: async ({ tipo, email, datos }) => {
        const { data, error } = await admin.auth.admin.generateLink({ type: tipo, email, options: { data: datos } })
        if (error || !data?.user || !data.properties?.hashed_token) {
          return { data: null, error: { message: error?.message ?? 'sin enlace' } }
        }
        return { data: { userId: data.user.id, hashedToken: data.properties.hashed_token }, error: null }
      },
    },
    enviarCorreo: ({ to, subject, nombre, enlace, idempotencyKey }) =>
      sendEmail({
        to,
        subject,
        template: createElement(InvitacionCuentaEmail, { nombre, urlAceptar: enlace }),
        idempotencyKey,
      }),
    urlBase: process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org',
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
