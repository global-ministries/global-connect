/**
 * Shared wiring of POST /api/talleres/reserva/* (T5b of
 * odd/tasks/talleres-reserva-publica.md). No session: the public pages
 * /talleres/reservar[/slug] post here. The body is size-capped and parsed,
 * the handler of lib/platform/talleres/reserva-publica-servidor runs with the
 * service-role client (every RPC is service_role only), the salted IP hash
 * and the email senders. Errors are logged by name only. The notices email
 * (despacharAvisosTalleres, never throws) runs after the response.
 */
import { after, NextRequest, NextResponse } from 'next/server'

import { sendEmail } from '@/lib/email/send'
import { ipDeSolicitud } from '@/lib/platform/ninos/preregistro-servidor'
import { despacharAvisosTalleres } from '@/lib/platform/talleres/avisos-envio'
import { enviarInvitacionAcceso } from '@/lib/platform/talleres/invitacion-acceso-envio'
import { LIMITE_CUERPO, MENSAJES } from '@/lib/platform/talleres/reserva-publica'
import { rpcServicio, type DependenciasReserva, type RespuestaRuta } from '@/lib/platform/talleres/reserva-publica-servidor'

type Manejador = (deps: DependenciasReserva, body: unknown, ip: string) => Promise<RespuestaRuta>

function dependencias(): DependenciasReserva {
  return {
    rpc: rpcServicio(),
    sal: process.env.TALLERES_RESERVA_SAL ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'talleres-reserva',
    enviarCorreo: sendEmail,
    enviarInvitacion: (id) => enviarInvitacionAcceso(id),
    despacharAvisos: async () => {
      after(() => despacharAvisosTalleres())
    },
  }
}

export async function atender(req: NextRequest, accion: string, manejador: Manejador) {
  try {
    const crudo = await req.text()
    if (crudo.length > LIMITE_CUERPO) {
      return NextResponse.json({ estado: 'invalido', mensaje: MENSAJES.demasiadoGrande }, { status: 413 })
    }
    let body: unknown
    try {
      body = JSON.parse(crudo)
    } catch {
      return NextResponse.json({ estado: 'invalido', mensaje: MENSAJES.solicitudInvalida }, { status: 400 })
    }
    const r = await manejador(dependencias(), body, ipDeSolicitud(req.headers))
    return NextResponse.json(r.body, { status: r.status })
  } catch (error) {
    console.error(`[talleres/reserva/${accion}] error:`, error instanceof Error ? error.name : 'desconocido')
    return NextResponse.json({ estado: 'error', mensaje: MENSAJES.error }, { status: 500 })
  }
}
