/**
 * POST /api/ninos/checkin — N4 check-in moved behind a route for N9 emails.
 *
 * { ninoIds, salonIds, turnoId, fecha, forzadoIds? } → { filas } (the ninos_checkin rows).
 * forzadoIds (T2d, S9.1): the children whose full salón the desk forced; it
 * travels as p_forzados only when present, so a call without it is unchanged.
 * The RPC runs AS THE USER, so the authority stays in SQL. Then the parents
 * with an email get one email per family visit, sent after the response with
 * after() (best effort: a failure is logged without personal data and the
 * check-in still succeeds).
 *
 * An optional `estacionId` (the desk's print station, T3a, S10) queues the
 * labels after the response too, as the user (ninos_impresion_encolar). Best
 * effort: a missing or malformed station, or a failed enqueue, never changes
 * the response nor its status (printing never blocks the check-in).
 */
import { after, NextRequest, NextResponse } from 'next/server'

import { encolarEtiquetas, estacionDeCheckin } from '@/lib/platform/ninos/impresion'
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
      ...(e.forzadoIds && { p_forzados: e.forzadoIds }),
    })
    if (error) return NextResponse.json({ error: { code: error.code } }, { status: statusDeError(error.code) })

    after(() => enviarAvisos(dependenciasAvisos(supabase), { ninoIds: e.ninoIds, turnoId: e.turnoId, fecha: e.fecha, evento: 'ingreso' }))
    const estacionId = estacionDeCheckin(body)
    if (estacionId) {
      after(() => encolarEtiquetas(rpcSinTipos(supabase), { estacionId, turnoId: e.turnoId, fecha: e.fecha, ninoIds: e.ninoIds }))
    }
    return NextResponse.json({ filas: data ?? [] })
  } catch {
    console.error('[ninos/checkin] error inesperado')
    return NextResponse.json({ error: { code: '500' } }, { status: 500 })
  }
}
