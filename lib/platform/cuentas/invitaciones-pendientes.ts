/**
 * Pending account invitations in Servidores (T2 of
 * odd/tasks/invitaciones-pendientes.md).
 *
 * The database returns every invitation of the fichas the caller may invite
 * (invitacion_cuenta_estados, 20261102160000, called AS THE CALLER) and this
 * module summarizes them per person: the latest invitation decides the state,
 * and an 'enviada' one older than 24 h shows as vencida (S4: Supabase's
 * maximum email link lifetime). Cancelling (S6) closes the open invitation as
 * the caller and deletes its auth account when it was never confirmed, so the
 * old link stops working. Resending reuses enviarInvitacionCuenta with the
 * email of the latest invitation. Logs carry the invitation id only.
 */
import {
  enviarInvitacionCuenta,
  type DependenciasInvitacion,
  type ErrorRpc,
} from '@/lib/platform/cuentas/invitacion-cuenta'

/** S4: an 'enviada' invitation older than this shows as "Invitación vencida". */
export const VENCE_INVITACION_MS = 24 * 60 * 60 * 1000
export const MAX_IDS_ESTADOS = 2000
export const MAX_IDS_REENVIO = 50

type EstadoFila = 'enviada' | 'aceptada' | 'cancelada' | 'expirada'
const ESTADOS = new Set<string>(['enviada', 'aceptada', 'cancelada', 'expirada'])

export interface FilaEstado {
  readonly usuarioId: string
  readonly id: string
  readonly estado: EstadoFila
  readonly email: string
  readonly createdAt: string
  readonly aceptadaAt: string | null
  readonly invitadoPorNombre: string | null
}

export type EstadoResumen = 'enviada' | 'vencida' | 'registrada' | 'sin_invitar'

export interface EnvioHistorial {
  readonly estado: EstadoFila
  readonly email: string
  readonly fecha: string
  readonly invitadoPor: string | null
}

export interface ResumenInvitacion {
  readonly usuarioId: string
  readonly estado: EstadoResumen
  readonly email: string
  readonly enviadaEl: string
  readonly aceptadaEl: string | null
  readonly invitadoPor: string | null
  readonly envios: number
  readonly historial: readonly EnvioHistorial[]
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function fecha(v: unknown): string | null {
  const t = texto(v)
  return t && !Number.isNaN(Date.parse(t)) ? t : null
}

function parseFila(raw: unknown): FilaEstado | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  const usuarioId = texto(f.usuario_id)
  const id = texto(f.id)
  const estado = texto(f.estado)
  const email = texto(f.email)
  const createdAt = fecha(f.created_at)
  if (!usuarioId || !id || !estado || !ESTADOS.has(estado) || !email || !createdAt) return null
  return {
    usuarioId,
    id,
    estado: estado as EstadoFila,
    email,
    createdAt,
    aceptadaAt: fecha(f.aceptada_at),
    invitadoPorNombre: texto(f.invitado_por_nombre),
  }
}

/** Rows of invitacion_cuenta_estados; malformed rows are dropped. */
export function parseFilasEstados(raw: unknown): FilaEstado[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseFila).filter((f): f is FilaEstado => f !== null)
}

/** Rows grouped per person (first-seen order), oldest first within each person. */
function agrupar(filas: readonly FilaEstado[]): Map<string, FilaEstado[]> {
  const grupos = new Map<string, FilaEstado[]>()
  for (const f of filas) {
    const grupo = grupos.get(f.usuarioId)
    if (grupo) grupo.push(f)
    else grupos.set(f.usuarioId, [f])
  }
  for (const grupo of grupos.values()) grupo.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  return grupos
}

function estadoResumen(ultima: FilaEstado, ahora: Date): EstadoResumen {
  if (ultima.estado === 'aceptada') return 'registrada'
  if (ultima.estado !== 'enviada') return 'sin_invitar'
  return ahora.getTime() - Date.parse(ultima.createdAt) > VENCE_INVITACION_MS ? 'vencida' : 'enviada'
}

/** One summary per person; the latest invitation decides the state. */
export function resumirInvitaciones(filas: readonly FilaEstado[], ahora: Date): ResumenInvitacion[] {
  return [...agrupar(filas).values()].map((grupo) => {
    const ultima = grupo[grupo.length - 1]
    return {
      usuarioId: ultima.usuarioId,
      estado: estadoResumen(ultima, ahora),
      email: ultima.email,
      enviadaEl: ultima.createdAt,
      aceptadaEl: ultima.aceptadaAt,
      invitadoPor: ultima.invitadoPorNombre,
      envios: grupo.length,
      historial: grupo.map((f) => ({
        estado: f.estado,
        email: f.email,
        fecha: f.createdAt,
        invitadoPor: f.invitadoPorNombre,
      })),
    }
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Body { ids: string[] }: UUIDs, lowercased and deduped, at most `max`. */
export function parseIds(body: unknown, max: number): { ids: string[] } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Body inválido' }
  const ids = (body as Record<string, unknown>).ids
  if (!Array.isArray(ids)) return { error: 'Body inválido' }
  if (!ids.every((id) => typeof id === 'string' && UUID.test(id))) return { error: 'Persona inválida' }
  const unicos = [...new Set(ids.map((id: string) => id.toLowerCase()))]
  if (unicos.length > max) return { error: `Demasiadas personas (máximo ${max})` }
  return { ids: unicos }
}

export type DependenciasCancelar = Pick<DependenciasInvitacion, 'rpcUsuario'> & {
  readonly admin: Pick<DependenciasInvitacion['admin'], 'obtenerUsuario' | 'borrarUsuario'>
}

export type ResultadoCancelar =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly codigo?: string }

const ERRORES_CANCELAR: Readonly<Record<string, { status: number; error: string }>> = {
  sin_autoridad: { status: 403, error: 'No tienes permiso para cancelar esta invitación' },
  sin_invitacion_abierta: { status: 409, error: 'Esta persona no tiene una invitación abierta' },
}

function mapCancelarError(error: ErrorRpc): { status: number; error: string; codigo?: string } {
  const codigo = (error.message ?? '').trim()
  const conocido = ERRORES_CANCELAR[codigo]
  if (conocido) return { ...conocido, codigo }
  if (error.code === '42501') return { ...ERRORES_CANCELAR.sin_autoridad, codigo: 'sin_autoridad' }
  return { status: 500, error: 'No se pudo cancelar la invitación' }
}

/** S6: cancels the open invitation as the caller and deletes its never-confirmed auth account. */
export async function cancelarInvitacionCuenta(
  deps: DependenciasCancelar,
  usuarioId: string,
): Promise<ResultadoCancelar> {
  const { data, error } = await deps.rpcUsuario('invitacion_cuenta_cancelar', { p_usuario_id: usuarioId })
  if (error) {
    const f = mapCancelarError(error)
    if (f.status === 500) console.error('[invitacion-cuenta] cancelar:', error.code)
    return { ok: false, ...f }
  }
  const fila = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const id = texto(fila.id) ?? ''
  const authUserId = texto(fila.auth_user_id)
  if (!authUserId) return { ok: true }
  try {
    const cuenta = await deps.admin.obtenerUsuario(authUserId)
    if (cuenta && cuenta.email_confirmed_at === null) {
      const borrado = await deps.admin.borrarUsuario(authUserId)
      if (borrado.error) console.error('[invitacion-cuenta] no se pudo borrar la cuenta cancelada:', id)
    }
  } catch {
    console.error('[invitacion-cuenta] no se pudo borrar la cuenta cancelada:', id)
  }
  return { ok: true }
}

export type ResultadoReenvio =
  | { readonly id: string; readonly ok: true; readonly email: string }
  | { readonly id: string; readonly ok: false; readonly error: string }

/** Resends, one at a time, to the email of each person's latest invitation the caller can see. */
export async function reenviarInvitaciones(
  deps: DependenciasInvitacion,
  ids: readonly string[],
): Promise<
  | { readonly ok: true; readonly resultados: ResultadoReenvio[] }
  | { readonly ok: false; readonly status: number; readonly error: string }
> {
  const { data, error } = await deps.rpcUsuario('invitacion_cuenta_estados', { p_usuario_ids: ids })
  if (error) {
    console.error('[invitacion-cuenta] estados para reenviar:', error.code)
    return { ok: false, status: 500, error: 'No se pudieron leer las invitaciones' }
  }
  const grupos = agrupar(parseFilasEstados(data))
  const resultados: ResultadoReenvio[] = []
  for (const id of ids) {
    const grupo = grupos.get(id)
    if (!grupo) {
      resultados.push({ id, ok: false, error: 'No hay una invitación para reenviar' })
      continue
    }
    const email = grupo[grupo.length - 1].email
    const r = await enviarInvitacionCuenta(deps, id, { email, reemplazarEmail: false })
    resultados.push(r.ok ? { id, ok: true, email: r.email } : { id, ok: false, error: r.error })
  }
  return { ok: true, resultados }
}
