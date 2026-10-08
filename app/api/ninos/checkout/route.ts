/**
 * POST /api/ninos/checkout — N5 check-out moved behind a route for N9 emails.
 *
 * { codigo, turnoId, fecha, retiradoPor } → { filas } (children released).
 * The RPC runs AS THE USER (authority in SQL); then one email per family
 * visit to the parents with an email (best effort, never fails the call).
 */
import { NextRequest, NextResponse } from 'next/server'

import { enviarAvisos } from '@/lib/platform/ninos/notificaciones'
import { parseCheckout, statusDeError } from '@/lib/platform/ninos/visita-api'

import { dependenciasAvisos, rpcSinTipos, sesion } from '../_lib/avisos'

export async function POST(req: NextRequest) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: { code: '401' } }, { status: 401 })
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: { code: '22023' } }, { status: 400 }) }
    const e = parseCheckout(body)
    if (!e) return NextResponse.json({ error: { code: '22023' } }, { status: 400 })

    const { data, error } = await rpcSinTipos(supabase)('ninos_checkout', {
      p_codigo: e.codigo,
      p_turno_id: e.turnoId,
      p_fecha: e.fecha,
      p_retirado_por: e.retiradoPor,
    })
    if (error) return NextResponse.json({ error: { code: error.code } }, { status: statusDeError(error.code) })

    const filas = Array.isArray(data) ? (data as { nino_id: string }[]) : []
    if (filas.length > 0) {
      await enviarAvisos(dependenciasAvisos(supabase), {
        ninoIds: filas.map((f) => f.nino_id),
        turnoId: e.turnoId,
        fecha: e.fecha,
        evento: 'retiro',
      })
    }
    return NextResponse.json({ filas })
  } catch {
    console.error('[ninos/checkout] error inesperado')
    return NextResponse.json({ error: { code: '500' } }, { status: 500 })
  }
}
