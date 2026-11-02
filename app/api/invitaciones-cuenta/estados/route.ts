/**
 * /api/invitaciones-cuenta/estados — account invitation states in batch (T2 of
 * odd/tasks/invitaciones-pendientes.md).
 *
 * POST { ids: uuid[] (max 2000) } → { invitaciones: ResumenInvitacion[] }, one
 * per person with at least one invitation the caller may see (the database
 * filters by invitacion_cuenta_puede_invitar: invitacion_cuenta_estados,
 * 20261102160000, called AS THE CALLER). See
 * lib/platform/cuentas/invitaciones-pendientes.ts.
 */
import { NextRequest, NextResponse } from 'next/server'

import { rpcSinTipos, sesion } from '@/lib/platform/cuentas/dependencias-invitacion'
import {
  MAX_IDS_ESTADOS,
  parseFilasEstados,
  parseIds,
  resumirInvitaciones,
} from '@/lib/platform/cuentas/invitaciones-pendientes'

export async function POST(req: NextRequest) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const entrada = parseIds(body, MAX_IDS_ESTADOS)
    if ('error' in entrada) return NextResponse.json({ error: entrada.error }, { status: 400 })
    if (entrada.ids.length === 0) return NextResponse.json({ invitaciones: [] })

    const { data, error } = await rpcSinTipos(supabase)('invitacion_cuenta_estados', { p_usuario_ids: entrada.ids })
    if (error) {
      console.error('[invitaciones-cuenta/estados POST] error:', error.code)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
    return NextResponse.json({ invitaciones: resumirInvitaciones(parseFilasEstados(data), new Date()) })
  } catch (error) {
    console.error('[invitaciones-cuenta/estados POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
