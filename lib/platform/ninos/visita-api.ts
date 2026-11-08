/**
 * Bodies of POST /api/ninos/checkin and /api/ninos/checkout (N9) and the
 * HTTP status for an RPC error. The screens keep mapping the error code to
 * Spanish (mensajeDeErrorCheckin / mensajeDeErrorRetiro), so only the code
 * travels back (plus a message only when it is a fixed code, errorPublico);
 * the RPC message may name a room or a child.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_NINOS = 20

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const esUuids = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && UUID.test(x))

/** forzadoIds only when the desk forced a full salón for some children (T2d, S9.1); absent = none. */
export type EntradaCheckin = { ninoIds: string[]; salonIds: string[]; turnoId: string; fecha: string; forzadoIds?: string[] }
/** ninoIds only when the door marked some of the code's children (T2a); absent = the whole code. */
export type EntradaCheckout = {
  codigo: string
  turnoId: string
  fecha: string
  retiradoPor: string
  motivoOtra: string | null
  ninoIds?: string[]
}

function servicio(o: Objeto): { turnoId: string; fecha: string } | null {
  const { turnoId, fecha } = o
  if (typeof turnoId !== 'string' || !UUID.test(turnoId) || typeof fecha !== 'string' || !ISO_DATE.test(fecha)) return null
  return { turnoId, fecha }
}

export function parseCheckin(body: unknown): EntradaCheckin | null {
  if (!esObjeto(body)) return null
  const s = servicio(body)
  const { ninoIds, salonIds } = body
  if (!s || !esUuids(ninoIds) || !esUuids(salonIds)) return null
  if (ninoIds.length === 0 || ninoIds.length > MAX_NINOS || ninoIds.length !== salonIds.length) return null
  const entrada: EntradaCheckin = { ninoIds, salonIds, ...s }
  // Forced over quota: absent, null or empty keeps the body as before.
  if (body.forzadoIds === undefined || body.forzadoIds === null) return entrada
  if (!esUuids(body.forzadoIds) || !body.forzadoIds.every((id) => ninoIds.includes(id))) return null
  const forzadoIds = [...new Set(body.forzadoIds)]
  return forzadoIds.length ? { ...entrada, forzadoIds } : entrada
}

export function parseCheckout(body: unknown): EntradaCheckout | null {
  if (!esObjeto(body)) return null
  const s = servicio(body)
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''
  const retiradoPor = typeof body.retiradoPor === 'string' ? body.retiradoPor.trim() : ''
  // "Otra persona" (someone outside the child's list) travels with a reason.
  const motivoOtra = typeof body.motivoOtra === 'string' ? body.motivoOtra.trim() : ''
  if (!s || !/^\d{3,4}$/.test(codigo) || !retiradoPor || retiradoPor.length > 200 || motivoOtra.length > 300) return null
  const entrada: EntradaCheckout = { codigo, retiradoPor, motivoOtra: motivoOtra || null, ...s }
  // Pickup per child: absent or null keeps the whole code (as before).
  if (body.ninoIds === undefined || body.ninoIds === null) return entrada
  if (!esUuids(body.ninoIds)) return null
  const ninoIds = [...new Set(body.ninoIds)]
  if (ninoIds.length === 0 || ninoIds.length > MAX_NINOS) return null
  return { ...entrada, ninoIds }
}

/** RPC messages that are fixed codes (never data), safe to send to the screen. */
const MENSAJES_PUBLICOS = new Set(['retiro_no_autorizado', 'nino_no_esta_adentro', 'sin_ninos'])

export function errorPublico(error: { code?: string; message?: string }): { code?: string; message?: string } {
  const message = (error.message ?? '').trim()
  return MENSAJES_PUBLICOS.has(message) ? { code: error.code, message } : { code: error.code }
}

export function statusDeError(code: string | undefined): number {
  if (code === '42501') return 403
  if (code === '23505') return 409
  if (code === '22023') return 422
  if (code === '53000') return 503
  return 500
}
