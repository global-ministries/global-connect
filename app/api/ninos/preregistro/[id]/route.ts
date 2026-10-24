/**
 * POST /api/ninos/preregistro/[id] — the anfitrión confirms or discards a
 * pre-registration at the table (N8 of odd/tasks/ninos-checkin.md).
 *
 * { accion: 'descartar' } | { accion: 'confirmar', payload, email? }
 * | { accion: 'invitar', email } (resend a failed invitation: same RPC, so
 * still only the confirming operator, only that email, within the hour)
 * The RPC runs AS THE CALLER (ninos_preregistro_resolver checks the campus
 * authority and registers the family). With an email: the welcome email and,
 * when the parent has no account, the account invitation — the shared flow
 * of lib/platform/cuentas/invitacion-cuenta.ts, created through
 * ninos_preregistro_invitar (only the confirming operator, only that email).
 */
import { createElement } from 'react'
import { after, NextRequest, NextResponse } from 'next/server'

import { DESTINO_MIS_HIJOS } from '@/lib/auth/destino-mis-hijos'
import { sendEmail } from '@/lib/email/send'
import { NinosBienvenidaEmail } from '@/lib/email/ninos-bienvenida-email'
import { enviarInvitacionCuenta } from '@/lib/platform/cuentas/invitacion-cuenta'
import { parseResolucion, resolverPreregistro } from '@/lib/platform/ninos/preregistro-resolver'

import { rpcSinTipos, sesion } from '../../_lib/avisos'
import { dependenciasInvitacionNinos, urlBaseSitio } from '../../_lib/invitacion'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> }

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
            template: createElement(NinosBienvenidaEmail, { nombre, urlMisHijos: `${urlBaseSitio()}${DESTINO_MIS_HIJOS}` }),
            idempotencyKey,
          }),
        enSegundoPlano: (tarea) => after(tarea),
        invitar: async (email) => {
          const rpc = rpcSinTipos(supabase)
          const deps = dependenciasInvitacionNinos((correo) => rpc('ninos_preregistro_invitar', { p_id: id, p_email: correo }))
          const inv = await enviarInvitacionCuenta(deps, id, { email, reemplazarEmail: false })
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
