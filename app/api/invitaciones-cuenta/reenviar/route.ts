/**
 * /api/invitaciones-cuenta/reenviar — bulk resend of account invitations (T2 of
 * odd/tasks/invitaciones-pendientes.md).
 *
 * POST { ids: uuid[] (1–50) } → { resultados: [{ id, ok, email?, error? }] },
 * 200 even when some fail. Each person is re-invited, one at a time, to the
 * email of their latest invitation the caller may see; every send goes
 * through enviarInvitacionCuenta, so the database re-checks the authority.
 * See lib/platform/cuentas/invitaciones-pendientes.ts.
 */
import { NextRequest, NextResponse } from 'next/server'

import { dependencias, sesion } from '@/lib/platform/cuentas/dependencias-invitacion'
import {
  MAX_IDS_REENVIO,
  parseIds,
  reenviarInvitaciones,
} from '@/lib/platform/cuentas/invitaciones-pendientes'

// Sends run one at a time and each takes seconds; the client sends batches of 10.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const entrada = parseIds(body, MAX_IDS_REENVIO)
    if ('error' in entrada) return NextResponse.json({ error: entrada.error }, { status: 400 })
    if (entrada.ids.length === 0) {
      return NextResponse.json({ error: 'Selecciona al menos una persona' }, { status: 400 })
    }

    const r = await reenviarInvitaciones(dependencias(supabase), entrada.ids)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ resultados: r.resultados })
  } catch (error) {
    console.error('[invitaciones-cuenta/reenviar POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
