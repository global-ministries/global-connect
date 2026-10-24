/**
 * A parent saves a child's data from Mis hijos (odd/tasks/ninos-mis-hijos.md,
 * M6c, decision D2), behind POST /api/ninos/mis-hijos/[id].
 *
 * The save runs AS THE USER (ninos_mis_hijos_guardar decides whether the child
 * is theirs). When the pickup list changed, the other linked parents get an
 * email after the response: the recipients are read with the service role
 * (ninos_aviso_autorizados, bound to the change this account just made), so
 * the parent's client never receives another parent's email address. Email
 * problems never undo the save, and logs carry no personal data.
 */

type RespuestaRpc = { data: unknown; error: { code?: string; message?: string } | null }
type Rpc = (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>

export type AvisoAutorizados = {
  cambioId: string
  ninoNombre: string
  actorNombre: string
  autorizados: { nombre: string; relacion: string | null }[]
  destinatarios: { id: string; nombre: string; email: string }[]
}

export type CorreoAutorizados = {
  to: string
  subject: string
  nombre: string
  lineas: string[]
  idempotencyKey: string
}

export type DependenciasGuardarHijo = {
  /** RPC with the parent's session. */
  rpcUsuario: Rpc
  /** RPC with the service role; only for ninos_aviso_autorizados. */
  rpcAdmin: () => Rpc
  enviar: (correo: CorreoAutorizados) => Promise<{ success: boolean }>
  /** Runs a task after the response is sent (next/server after() in the route). */
  enSegundoPlano: (tarea: () => Promise<void>) => void
}

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Parses ninos_aviso_autorizados (null when there is no recent pickup change by this account). */
export function parseAvisoAutorizados(data: unknown): AvisoAutorizados | null {
  if (!esObjeto(data) || typeof data.cambio_id !== 'string') return null
  return {
    cambioId: data.cambio_id,
    ninoNombre: texto(data.nino_nombre),
    actorNombre: texto(data.actor_nombre),
    autorizados: (Array.isArray(data.autorizados) ? data.autorizados.filter(esObjeto) : []).map((a) => ({
      nombre: texto(a.nombre),
      relacion: typeof a.relacion === 'string' && a.relacion.trim() ? a.relacion : null,
    })),
    destinatarios: (Array.isArray(data.destinatarios) ? data.destinatarios.filter(esObjeto) : [])
      .filter((d) => typeof d.id === 'string' && texto(d.email).includes('@'))
      .map((d) => ({ id: d.id as string, nombre: texto(d.nombre), email: texto(d.email) })),
  }
}

/** One email per other parent; the idempotency key is per change and recipient. */
export function armarCorreosAutorizados(a: AvisoAutorizados): CorreoAutorizados[] {
  const nino = a.ninoNombre || 'tu hijo'
  const lista =
    a.autorizados.length > 0
      ? a.autorizados.map((p) => (p.relacion ? `${p.nombre} (${p.relacion})` : p.nombre))
      : ['Ya no hay personas autorizadas en la lista.']
  return a.destinatarios.map((d) => ({
    to: d.email,
    subject: `Cambió la lista de quién puede retirar a ${nino}`,
    nombre: d.nombre,
    lineas: [
      `${a.actorNombre || 'Otro representante'} actualizó en Mis hijos las personas autorizadas para retirar a ${nino}. La lista ahora es:`,
      ...lista,
    ],
    idempotencyKey: `ninos-autorizados-${a.cambioId}-${d.id}`,
  }))
}

/** Reads the recipients and sends the emails. Never throws. */
export async function avisarCambioAutorizados(deps: DependenciasGuardarHijo, authId: string, ninoId: string): Promise<void> {
  try {
    const { data, error } = await deps.rpcAdmin()('ninos_aviso_autorizados', { p_nino_id: ninoId, p_auth_id: authId })
    if (error) {
      console.error('[ninos/mis-hijos] destinatarios fallaron:', error.code ?? 'sin código')
      return
    }
    const aviso = parseAvisoAutorizados(data)
    if (!aviso) return
    for (const correo of armarCorreosAutorizados(aviso)) {
      let ok = false
      try {
        ok = (await deps.enviar(correo)).success
      } catch {
        ok = false
      }
      if (!ok) console.error('[ninos/mis-hijos] aviso de autorizados falló:', aviso.cambioId)
    }
  } catch {
    console.error('[ninos/mis-hijos] aviso de autorizados falló')
  }
}

function errorRpc(error: { code?: string; message?: string }): RespuestaRuta {
  const status = error.code === '42501' ? 403 : error.code === '22023' ? 422 : 500
  if (status === 500) {
    console.error('[ninos/mis-hijos] guardar falló:', error.code ?? 'sin código')
    return { status, body: { error: { code: error.code ?? '500' } } }
  }
  // The RPC raises a snake_case code as the message; the client turns it into Spanish.
  return { status, body: { error: { code: error.code, message: (error.message ?? '').trim() } } }
}

/** Saves through ninos_mis_hijos_guardar and, when the pickup list changed, schedules the email. */
export async function guardarMiHijo(
  deps: DependenciasGuardarHijo,
  e: { authId: string; ninoId: string; payload: Objeto },
): Promise<RespuestaRuta> {
  const { data, error } = await deps.rpcUsuario('ninos_mis_hijos_guardar', { p_nino_id: e.ninoId, p: e.payload })
  if (error) return errorRpc(error)
  const campos = esObjeto(data) && Array.isArray(data.campos) ? data.campos.filter((c): c is string => typeof c === 'string') : []
  if (campos.includes('autorizados')) {
    deps.enSegundoPlano(() => avisarCambioAutorizados(deps, e.authId, e.ninoId))
  }
  return { status: 200, body: { campos } }
}
