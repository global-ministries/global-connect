/**
 * Bodies of POST /api/ninos/checkin and /api/ninos/checkout (N9) and the
 * HTTP status for an RPC error. The screens keep mapping the error code to
 * Spanish (mensajeDeErrorCheckin / mensajeDeErrorRetiro), so only the code
 * travels back; the RPC message may name a room or a child.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_NINOS = 20

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const esUuids = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && UUID.test(x))

export type EntradaCheckin = { ninoIds: string[]; salonIds: string[]; turnoId: string; fecha: string }
export type EntradaCheckout = { codigo: string; turnoId: string; fecha: string; retiradoPor: string }

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
  return { ninoIds, salonIds, ...s }
}

export function parseCheckout(body: unknown): EntradaCheckout | null {
  if (!esObjeto(body)) return null
  const s = servicio(body)
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''
  const retiradoPor = typeof body.retiradoPor === 'string' ? body.retiradoPor.trim() : ''
  if (!s || !/^\d{3,4}$/.test(codigo) || !retiradoPor || retiradoPor.length > 200) return null
  return { codigo, retiradoPor, ...s }
}

export function statusDeError(code: string | undefined): number {
  if (code === '42501') return 403
  if (code === '23505') return 409
  if (code === '22023') return 422
  if (code === '53000') return 503
  return 500
}
