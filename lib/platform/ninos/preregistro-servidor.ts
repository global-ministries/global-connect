/**
 * Server half of the public pre-registration (N8): the salted IP hash and
 * the create flow used by POST /api/ninos/preregistro. Kept apart from
 * ./preregistro so the client form can reuse the parser without node:crypto.
 */
import { createHash, randomBytes } from 'node:crypto'

import { parsePreregistro } from './preregistro'
import { parseSolicitudAviso } from './preregistro-aviso'

/** Salted SHA-256 of the client IP: the database only ever sees this. */
export function hashIp(ip: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${ip}`).digest('hex')
}

/**
 * Client IP for the rate limit, from a header the client cannot forge.
 *
 * On Vercel, x-real-ip is set by the edge network to the address that
 * connected to it and overwrites any value the client sent, so it comes
 * first. Without it, the FIRST x-forwarded-for entry is whatever the client
 * wrote (it can rotate it to dodge the limit); each proxy appends the address
 * it saw, so the LAST entry is the hop added by the proxy in front of us, the
 * only one we can trust.
 */
export function ipDeSolicitud(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const saltos = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return saltos.at(-1) ?? 'desconocida'
}

type RespuestaRpc = { data: unknown; error: { code?: string; message?: string } | null }

/** SHA-256 of the "¿Vienen hoy?" token: the database only ever sees this. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 32 random bytes in base64url (43 characters). */
function nuevoToken(): string {
  return randomBytes(32).toString('base64url')
}

export type DependenciasPreregistro = {
  /** Service-role RPC (ninos_preregistro_crear is not callable by anon). */
  rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  sal: string
  hoy: string
  /** The notice token; random by default (tests pin it). */
  token?: () => string
}

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

const LISTO: RespuestaRuta = { status: 200, body: { ok: true } }

type Objeto = Record<string, unknown>

const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Today's services of the create answer, in the wizard's shape. */
function serviciosDe(data: Objeto) {
  const servicios = Array.isArray(data.servicios) ? data.servicios : []
  return servicios
    .filter((s): s is Objeto => esObjeto(s) && typeof s.turno_id === 'string')
    .map((s) => ({
      turnoId: s.turno_id as string,
      nombre: typeof s.nombre === 'string' ? s.nombre : '',
      hora: typeof s.hora === 'string' ? s.hora : '',
    }))
}

export async function crearPreregistro(deps: DependenciasPreregistro, body: unknown, ip: string): Promise<RespuestaRuta> {
  const r = parsePreregistro(body, deps.hoy)
  if (!r.ok) return { status: 400, body: { errores: r.errores } }
  // A bot filled the hidden field: answer like a success, store nothing.
  if (r.honeypot) return LISTO

  const token = (deps.token ?? nuevoToken)()
  const { data, error } = await deps.rpc('ninos_preregistro_crear', {
    p_campus_id: r.campusId,
    p_payload: r.payload,
    p_ip_hash: hashIp(ip, deps.sal),
    p_token_hash: hashToken(token),
  })
  if (error?.message === 'fuera_de_rango') {
    return { status: 400, body: { errores: ['Solo se registran en Niños los menores de 13 años con fecha de nacimiento.'] } }
  }
  if (error) {
    // Code only: the message may carry the submitted data.
    console.error('[ninos/preregistro] crear falló:', error.code ?? 'sin código')
    return { status: 500, body: { errores: ['No pudimos guardar tu registro. Intenta de nuevo o acércate a la mesa.'] } }
  }
  const estado = esObjeto(data) ? data.estado : data
  if (estado === 'limite') {
    return { status: 429, body: { errores: ['Recibimos varios registros seguidos. Espera unos minutos e intenta de nuevo.'] } }
  }
  // The id and the token only go back when there is a service to offer ("¿Vienen hoy?").
  const servicios = esObjeto(data) ? serviciosDe(data) : []
  if (!esObjeto(data) || typeof data.id !== 'string' || servicios.length === 0) return LISTO
  return { status: 200, body: { ok: true, aviso: { id: data.id, token, servicios } } }
}

export type DependenciasAviso = Pick<DependenciasPreregistro, 'rpc' | 'sal'>

const errorAviso = (status: number, texto: string): RespuestaRuta => ({ status, body: { errores: [texto] } })

const ERRORES_AVISO: Record<string, RespuestaRuta> = {
  fuera_de_horario: errorAviso(409, 'Este servicio ya no recibe avisos. Avísale a la mesa al llegar.'),
  ya_avisado: errorAviso(409, 'Ya le avisamos a la mesa que vienen a este servicio.'),
  sin_autoridad: errorAviso(403, 'No pudimos avisar a la mesa. Avísale al llegar.'),
}

/**
 * "¿Vienen hoy?" (P4) behind POST /api/ninos/preregistro/aviso: the family
 * that just pre-registered tells the table which service of today it comes to.
 * Only the token hash reaches the database, which binds the notice to that
 * pre-registration and applies the window, the one-per-service rule and the
 * per-IP-hash rate limit. The answer carries no data back.
 */
export async function avisarLlegada(deps: DependenciasAviso, body: unknown, ip: string): Promise<RespuestaRuta> {
  const s = parseSolicitudAviso(body)
  if (!s) return errorAviso(400, 'Aviso inválido.')
  const { data, error } = await deps.rpc('ninos_preregistro_avisar', {
    p_id: s.id,
    p_token_hash: hashToken(s.token),
    p_turno_id: s.turnoId,
    p_ip_hash: hashIp(ip, deps.sal),
  })
  if (error) {
    const conocido = ERRORES_AVISO[error.message ?? ''] ?? (error.code === '42501' ? ERRORES_AVISO.sin_autoridad : undefined)
    if (conocido) return conocido
    console.error('[ninos/preregistro/aviso] avisar falló:', error.code ?? 'sin código')
    return errorAviso(500, 'No pudimos avisar a la mesa. Intenta de nuevo o avísale al llegar.')
  }
  if (data === 'limite') return errorAviso(429, 'Recibimos varios avisos seguidos. Avísale a la mesa al llegar.')
  return LISTO
}
