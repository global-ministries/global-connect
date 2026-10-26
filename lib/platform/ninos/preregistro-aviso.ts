/**
 * "¿Vienen hoy?" in the public QR wizard (odd/tasks/ninos-precheck.md P4).
 *
 * After the pre-registration is stored, POST /api/ninos/preregistro answers
 * the row id, a random token and today's services of its campus that still
 * take notices. The wizard keeps them in memory only and, if the family picks
 * a service, posts { id, token, turnoId } to /api/ninos/preregistro/aviso. The
 * SQL (ninos_preregistro_avisar) checks the token hash, the window and the
 * one-notice-per-service rule; this module only shapes both bodies. Kept free
 * of node:crypto so the client wizard can import it.
 */
import { horaServicio } from './precheck'

/** A service of today that still takes notices. */
export type ServicioHoy = { turnoId: string; nombre: string; hora: string }

/** What the wizard needs to offer the step; null skips it. */
export type AvisoPreregistro = { id: string; token: string; servicios: ServicioHoy[] }

export type SolicitudAviso = { id: string; token: string; turnoId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** 32 random bytes in base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/

type Objeto = Record<string, unknown>

const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The notice offer in the create answer, or null when there is nothing to offer. */
export function parseAvisoPreregistro(body: unknown): AvisoPreregistro | null {
  if (!esObjeto(body) || !esObjeto(body.aviso)) return null
  const { id, token, servicios } = body.aviso
  if (typeof id !== 'string' || !UUID.test(id) || typeof token !== 'string' || !TOKEN.test(token) || !Array.isArray(servicios)) {
    return null
  }
  const lista = servicios
    .filter((s): s is Objeto => esObjeto(s) && typeof s.turnoId === 'string' && UUID.test(s.turnoId))
    .map((s) => ({ turnoId: s.turnoId as string, nombre: texto(s.nombre), hora: texto(s.hora) }))
  return lista.length > 0 ? { id, token, servicios: lista } : null
}

/** "9:00", or the service name when it has no start time. */
export function etiquetaServicio(s: ServicioHoy): string {
  return horaServicio(s.hora) || s.nombre
}

/** The untrusted POST /api/ninos/preregistro/aviso body. */
export function parseSolicitudAviso(body: unknown): SolicitudAviso | null {
  if (!esObjeto(body)) return null
  const { id, token, turnoId } = body
  if (typeof id !== 'string' || !UUID.test(id)) return null
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  if (typeof turnoId !== 'string' || !UUID.test(turnoId)) return null
  return { id, token, turnoId }
}
