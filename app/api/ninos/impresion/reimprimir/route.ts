/**
 * POST /api/ninos/impresion/reimprimir — the desk re-queues the labels of an
 * open visit (odd/tasks/ninos-checkin-pco.md, S10 "Anfitriones y
 * coordinación, con motivo", S6; the desk UI is T3b).
 *
 * { estacionId, turnoId, fecha, codigo, tipo: 'todas' | 'representante' | 'nino', ninoId?,
 *   motivo: 'se_trabo' | 'se_perdio' | 'otro', nota? (≤ 200, required for otro) }
 *   → { ninos, representantes } (labels queued).
 * The RPC runs AS THE USER, so the authority stays in SQL (the same as the
 * check-in: operate the room of every child, a station of that campus) and it
 * records who and when. The pickup código never changes. Only the error code
 * travels back, plus the message when it is a fixed code.
 */
import { NextRequest, NextResponse } from 'next/server'

import { errorImpresion, parseReimpresion } from '@/lib/platform/ninos/impresion'
import { statusDeError } from '@/lib/platform/ninos/visita-api'

import { rpcSinTipos, sesion } from '../../_lib/avisos'

export async function POST(req: NextRequest) {
  try {
    const supabase = await sesion()
    if (!supabase) return NextResponse.json({ error: { code: '401' } }, { status: 401 })
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: { code: '22023' } }, { status: 400 }) }
    const e = parseReimpresion(body)
    if (!e) return NextResponse.json({ error: { code: '22023' } }, { status: 400 })

    const { data, error } = await rpcSinTipos(supabase)('ninos_impresion_reimprimir', {
      p_estacion_id: e.estacionId,
      p_turno_id: e.turnoId,
      p_fecha: e.fecha,
      p_codigo: e.codigo,
      p_tipo: e.tipo,
      p_nino_id: e.ninoId,
      p_motivo: e.motivo,
      p_nota: e.nota,
    })
    if (error) return NextResponse.json({ error: errorImpresion(error) }, { status: statusDeError(error.code) })
    return NextResponse.json(data)
  } catch {
    console.error('[ninos/impresion/reimprimir] error inesperado')
    return NextResponse.json({ error: { code: '500' } }, { status: 500 })
  }
}
