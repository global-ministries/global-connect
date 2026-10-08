/**
 * POST /api/ninos/checkin — N4 check-in moved behind a route for N9 emails.
 *
 * { ninoIds, salonIds, turnoId, fecha } → { filas } (the ninos_checkin rows).
 * The RPC runs AS THE USER, so the authority stays in SQL. Then the parents
 * with an email get one email per family visit (best effort: a failure is
 * logged without personal data and the check-in still succeeds).
 */
import { NextRequest, NextResponse } from 'next/server'

import { enviarAvisos } from '@/lib/platform/ninos/notificaciones'
import { parseCheckin, statusDeError } from '@/lib/platform/ninos/visita-api'

import { dependenciasAvisos, rpcSinTipos, sesion } from '../_lib/avisos'

export async function POST(req: NextRequest) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: { code: '401' } }, { status: 401 })
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: { code: '22023' } }, { status: 400 }) }
    const e = parseCheckin(body)
    if (!e) return NextResponse.json({ error: { code: '22023' } }, { status: 400 })

    const { data, error } = await rpcSinTipos(supabase)('ninos_checkin', {
      p_nino_ids: e.ninoIds,
      p_salon_ids: e.salonIds,
      p_turno_id: e.turnoId,
      p_fecha: e.fecha,
    })
    if (error) return NextResponse.json({ error: { code: error.code } }, { status: statusDeError(error.code) })

    await enviarAvisos(dependenciasAvisos(supabase), { ninoIds: e.ninoIds, turnoId: e.turnoId, fecha: e.fecha, evento: 'ingreso' })
    return NextResponse.json({ filas: data ?? [] })
  } catch {
    console.error('[ninos/checkin] error inesperado')
    return NextResponse.json({ error: { code: '500' } }, { status: 500 })
  }
}
