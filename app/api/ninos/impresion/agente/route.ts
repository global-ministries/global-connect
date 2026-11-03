/**
 * /api/ninos/impresion/agente — the print agent's API (odd/tasks/ninos-v2.md,
 * S10, N6b; contract in docs/ninos/impresion.md).
 *
 * No session: the agent sends `Authorization: Bearer <station token>`. The
 * token is hashed here (sha256) and only the hash reaches the database,
 * through the service client (the agent RPCs are service_role only); the
 * stored hash is compared again in constant time. Anything else is a 401.
 *   GET  ?max=1–20          → { estacion: { id, nombre, ancho_mm, alto_mm, dpi }, trabajos }
 *   POST { id, estado, error? } → { id, estado }
 * Logs carry neither the token nor label data.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  errorImpresion,
  hashToken,
  hashesIguales,
  maxTrabajos,
  parseReporte,
  respuestaAgente,
  tokenDeAutorizacion,
} from '@/lib/platform/ninos/impresion'
import { statusDeError } from '@/lib/platform/ninos/visita-api'

import { rpcSinTipos } from '../../_lib/avisos'

type Rpc = ReturnType<typeof rpcSinTipos>
type Estacion = Record<string, unknown> & { id: string }

const SIN_CACHE = { 'Cache-Control': 'no-store' }
const noAutorizado = () => NextResponse.json({ error: { code: '401' } }, { status: 401, headers: SIN_CACHE })
const fallo = () => NextResponse.json({ error: { code: '500' } }, { status: 500, headers: SIN_CACHE })

/** The active station of the Bearer token (also its heartbeat), or null. */
async function estacionDelToken(req: NextRequest): Promise<{ rpc: Rpc; estacion: Estacion } | null> {
  const token = tokenDeAutorizacion(req.headers.get('authorization'))
  if (!token) return null
  const hash = hashToken(token)
  const rpc = rpcSinTipos(createSupabaseAdminClient())
  const { data, error } = await rpc('ninos_impresion_agente_estacion', { p_token_hash: hash })
  if (error) throw new Error('agente_estacion')
  const estacion = data as Estacion | null
  if (!estacion || typeof estacion.id !== 'string' || !hashesIguales(hash, estacion.token_hash)) return null
  return { rpc, estacion }
}

export async function GET(req: NextRequest) {
  try {
    const sesion = await estacionDelToken(req)
    if (!sesion) return noAutorizado()
    const { data, error } = await sesion.rpc('ninos_impresion_agente_reclamar', {
      p_estacion_id: sesion.estacion.id,
      p_max: maxTrabajos(req.nextUrl.searchParams.get('max')),
    })
    if (error) {
      console.error('[ninos/impresion/agente] no se reclamaron trabajos:', error.code ?? 'sin código')
      return fallo()
    }
    return NextResponse.json(respuestaAgente(sesion.estacion, data), { headers: SIN_CACHE })
  } catch (err) {
    console.error('[ninos/impresion/agente] error inesperado:', err instanceof Error ? err.name : 'desconocido')
    return fallo()
  }
}

export async function POST(req: NextRequest) {
  try {
    const sesion = await estacionDelToken(req)
    if (!sesion) return noAutorizado()
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: { code: '22023' } }, { status: 400, headers: SIN_CACHE }) }
    const r = parseReporte(body)
    if (!r) return NextResponse.json({ error: { code: '22023' } }, { status: 400, headers: SIN_CACHE })

    const { data, error } = await sesion.rpc('ninos_impresion_agente_reportar', {
      p_estacion_id: sesion.estacion.id,
      p_impresion_id: r.id,
      p_estado: r.estado,
      p_error: r.error,
    })
    if (error) return NextResponse.json({ error: errorImpresion(error) }, { status: statusDeError(error.code), headers: SIN_CACHE })
    return NextResponse.json(data, { headers: SIN_CACHE })
  } catch (err) {
    console.error('[ninos/impresion/agente] error inesperado:', err instanceof Error ? err.name : 'desconocido')
    return fallo()
  }
}
