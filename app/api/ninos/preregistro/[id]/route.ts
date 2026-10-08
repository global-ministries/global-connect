/**
 * POST /api/ninos/preregistro/[id] — the anfitrión confirms or discards a
 * pre-registration at the table (N8 of odd/tasks/ninos-checkin.md).
 *
 * { accion: 'descartar' } | { accion: 'confirmar', payload, email? }
 * The RPC runs AS THE CALLER (ninos_preregistro_resolver checks the campus
 * authority and registers the family). With an email: the welcome email and,
 * when the parent has no account, the account invitation — the shared flow
 * of lib/platform/cuentas/invitacion-cuenta.ts, created through
 * ninos_preregistro_invitar (only the confirming operator, only that email).
 */
import { createElement } from 'react'
import { after, NextRequest, NextResponse } from 'next/server'

import { sendEmail } from '@/lib/email/send'
import { InvitacionCuentaEmail } from '@/lib/email/invitacion-cuenta-email'
import { NinosBienvenidaEmail } from '@/lib/email/ninos-bienvenida-email'
import { enviarInvitacionCuenta, type DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import { parseResolucion, resolverPreregistro } from '@/lib/platform/ninos/preregistro-resolver'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

import { rpcSinTipos, sesion } from '../../_lib/avisos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> }

function urlBaseSitio(): string {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL
  if (configurada) return configurada.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'https://miembros.yosoyglobal.org'
}

/** The shared invitation flow; only its first step is the preregistro-bound RPC. */
function dependenciasInvitacion(cliente: { rpc: unknown }, id: string): DependenciasInvitacion {
  const admin = createSupabaseAdminClient()
  const rpcUsuario = rpcSinTipos(cliente)
  return {
    rpcUsuario: (_nombre, args) => rpcUsuario('ninos_preregistro_invitar', { p_id: id, p_email: args.p_email }),
    admin: {
      rpc: rpcSinTipos(admin),
      obtenerUsuario: async (uid) => {
        const { data, error } = await admin.auth.admin.getUserById(uid)
        if (error || !data?.user) return null
        return { email: data.user.email ?? '', email_confirmed_at: data.user.email_confirmed_at ?? null }
      },
      borrarUsuario: async (uid) => {
        const { error } = await admin.auth.admin.deleteUser(uid)
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
      sendEmail({ to, subject, template: createElement(InvitacionCuentaEmail, { nombre, urlAceptar: enlace }), idempotencyKey }),
    urlBase: urlBaseSitio(),
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await ctx.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Pre-registro inválido' }, { status: 400 })
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }) }
    const entrada = parseResolucion(body)
    if ('error' in entrada) return NextResponse.json({ error: entrada.error }, { status: 400 })

    const r = await resolverPreregistro(
      {
        rpcUsuario: rpcSinTipos(supabase),
        enviarBienvenida: ({ to, nombre, idempotencyKey }) =>
          sendEmail({
            to,
            subject: 'Bienvenidos a Waumba Land / UpStreet',
            template: createElement(NinosBienvenidaEmail, { nombre }),
            idempotencyKey,
          }),
        enSegundoPlano: (tarea) => after(tarea),
        invitar: async (email) => {
          const inv = await enviarInvitacionCuenta(dependenciasInvitacion(supabase, id), id, { email, reemplazarEmail: false })
          return inv.ok ? { ok: true } : { ok: false, codigo: inv.codigo }
        },
      },
      id,
      entrada,
    )
    return NextResponse.json(r.body, { status: r.status })
  } catch {
    console.error('[ninos/preregistro/[id]] error inesperado')
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
