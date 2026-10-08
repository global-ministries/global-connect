/**
 * Resolving a pre-registration at the check-in table (N8 of
 * odd/tasks/ninos-checkin.md), behind POST /api/ninos/preregistro/[id].
 *
 * The RPC ninos_preregistro_resolver runs AS THE CALLER (the database checks
 * ninos_puede_operar on the campus) and, on 'confirmar', registers the
 * reviewed family through ninos_registrar_familia in the same transaction,
 * so an existing parent is reused only when the anfitrión chose it (padre.id).
 * Afterwards, when the family gave an email: a welcome email and, if the
 * parent has no account, an account invitation (ninos_preregistro_invitar +
 * the shared invitation flow). Email problems never undo the confirmation.
 */
import { mensajeDeErrorFamilia, type FamiliaPayload } from './familia'

export type Resolucion =
  | { accion: 'descartar' }
  | { accion: 'confirmar'; payload: FamiliaPayload; email: string | null }

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)

function esEmailValido(email: string): boolean {
  if (email.length > 254 || /\s/.test(email)) return false
  const partes = email.split('@')
  if (partes.length !== 2 || !partes[0]) return false
  const etiquetas = partes[1].split('.')
  return etiquetas.length >= 2 && etiquetas.every((e) => e.length > 0)
}

export function parseResolucion(body: unknown): Resolucion | { error: string } {
  if (!esObjeto(body)) return { error: 'Solicitud inválida.' }
  if (body.accion === 'descartar') return { accion: 'descartar' }
  if (body.accion !== 'confirmar') return { error: 'Acción inválida.' }
  const payload = body.payload
  if (!esObjeto(payload) || !esObjeto(payload.padre) || !Array.isArray(payload.hijos)) {
    return { error: 'Faltan los datos de la familia.' }
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email && !esEmailValido(email)) return { error: 'Escribe un correo válido.' }
  return { accion: 'confirmar', payload: payload as unknown as FamiliaPayload, email: email || null }
}

type RespuestaRpc = { data: unknown; error: { code?: string; message?: string } | null }
type ResultadoInvitar = { ok: true } | { ok: false; codigo?: string }

export type DependenciasResolver = {
  rpcUsuario: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  enviarBienvenida: (correo: { to: string; nombre: string; idempotencyKey: string }) => Promise<{ success: boolean }>
  invitar: (email: string) => Promise<ResultadoInvitar>
}

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

function errorRpc(error: { code?: string; message?: string }): RespuestaRuta {
  const codigo = (error.message ?? '').trim()
  if (codigo === 'preregistro_resuelto') {
    return { status: 409, body: { error: 'Este pre-registro ya fue resuelto.', codigo } }
  }
  const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : error.code === '22023' ? 422 : 500
  if (status === 500) console.error('[ninos/preregistro] resolver falló:', error.code ?? 'sin código')
  return { status, body: { error: mensajeDeErrorFamilia(error), ...(codigo && status !== 500 ? { codigo } : {}) } }
}

export async function resolverPreregistro(deps: DependenciasResolver, id: string, r: Resolucion): Promise<RespuestaRuta> {
  if (r.accion === 'descartar') {
    const { error } = await deps.rpcUsuario('ninos_preregistro_resolver', { p_id: id, p_accion: 'descartar' })
    if (error) return errorRpc(error)
    return { status: 200, body: { ok: true, estado: 'descartado' } }
  }

  const payload = { ...r.payload, padre: { ...r.payload.padre, email: r.email } }
  const { data, error } = await deps.rpcUsuario('ninos_preregistro_resolver', {
    p_id: id,
    p_accion: 'confirmar',
    p_payload: payload,
  })
  if (error) return errorRpc(error)
  const padreId = esObjeto(data) && typeof data.padre_id === 'string' ? data.padre_id : null

  let correo: 'enviado' | 'fallo' | 'sin_correo' = 'sin_correo'
  let invitacion: 'enviada' | 'no' | 'fallo' = 'no'
  if (r.email) {
    const nombre = 'nombre' in r.payload.padre ? r.payload.padre.nombre : ''
    try {
      const envio = await deps.enviarBienvenida({ to: r.email, nombre, idempotencyKey: `ninos-bienvenida-${id}` })
      correo = envio.success ? 'enviado' : 'fallo'
    } catch {
      correo = 'fallo'
    }
    if (correo === 'fallo') console.error('[ninos/preregistro] bienvenida falló:', id)
    try {
      const inv = await deps.invitar(r.email)
      invitacion = inv.ok ? 'enviada' : inv.codigo === 'ya_tiene_cuenta' || inv.codigo === 'email_distinto' ? 'no' : 'fallo'
    } catch {
      invitacion = 'fallo'
    }
    if (invitacion === 'fallo') console.error('[ninos/preregistro] invitación falló:', id)
  }

  return { status: 200, body: { ok: true, estado: 'confirmado', padreId, correo, invitacion } }
}
