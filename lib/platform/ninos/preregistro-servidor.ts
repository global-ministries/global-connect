/**
 * Server half of the public pre-registration (N8): the salted IP hash and
 * the create flow used by POST /api/ninos/preregistro. Kept apart from
 * ./preregistro so the client form can reuse the parser without node:crypto.
 */
import { createHash } from 'node:crypto'

import { parsePreregistro } from './preregistro'

/** Salted SHA-256 of the client IP: the database only ever sees this. */
export function hashIp(ip: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${ip}`).digest('hex')
}

export function ipDeSolicitud(headers: Headers): string {
  const reenviada = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return reenviada || headers.get('x-real-ip')?.trim() || 'desconocida'
}

type RespuestaRpc = { data: unknown; error: { code?: string; message?: string } | null }

export type DependenciasPreregistro = {
  /** Service-role RPC (ninos_preregistro_crear is not callable by anon). */
  rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  sal: string
  hoy: string
}

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

const LISTO: RespuestaRuta = { status: 200, body: { ok: true } }

export async function crearPreregistro(deps: DependenciasPreregistro, body: unknown, ip: string): Promise<RespuestaRuta> {
  const r = parsePreregistro(body, deps.hoy)
  if (!r.ok) return { status: 400, body: { errores: r.errores } }
  // A bot filled the hidden field: answer like a success, store nothing.
  if (r.honeypot) return LISTO

  const { data, error } = await deps.rpc('ninos_preregistro_crear', {
    p_campus_id: r.campusId,
    p_payload: r.payload,
    p_ip_hash: hashIp(ip, deps.sal),
  })
  if (error) {
    // Code only: the message may carry the submitted data.
    console.error('[ninos/preregistro] crear falló:', error.code ?? 'sin código')
    return { status: 500, body: { errores: ['No pudimos guardar tu registro. Intenta de nuevo o acércate a la mesa.'] } }
  }
  if (data === 'limite') {
    return { status: 429, body: { errores: ['Recibimos varios registros seguidos. Espera unos minutos e intenta de nuevo.'] } }
  }
  return LISTO
}
