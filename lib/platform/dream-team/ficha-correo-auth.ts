/**
 * Dream Team — the login email follows the ficha (odd/tasks/dream-team-pendientes-director.md,
 * S8: "si construye").
 *
 * When an admin changes the email of a person WITH account in "Editar ficha",
 * auth.users.email changes too, so both stay equal; if one of the two writes
 * fails, neither email stays applied.
 *
 * Authority stays in the database: the previous ficha is read as the caller
 * (dream_team_ficha_persona: tiene_cuenta + puede_editar_email, which for a
 * person with account is dream_team_ficha_actor_es_admin), and the update
 * runs as the caller too (dream_team_editar_ficha refuses email_solo_admin
 * again). The service client is created only after both said yes, the email
 * really changes (any case is the same email) and the person has an account.
 *
 * Order: usuarios first (the RPC also checks uniqueness against auth.users),
 * then auth. If auth fails (or throws: the change may have been applied before
 * the connection dropped), auth.users is read again: already the new email →
 * success; otherwise usuarios.email goes back to the previous value, only while
 * it still holds the new one (never overwrites a later change); the re-read
 * fails → nothing is restored and the answer says it could not confirm.
 * Failure causes carry ids and error codes only, never an email.
 * The other fields of the same PATCH stay saved: only the email is
 * all-or-nothing with the login.
 *
 * A pending invitation is not an account (usuarios.auth_id is set when the
 * link is opened, invitacion_cuenta_vincular), so it is never synced here.
 */
import type { createSupabaseAdminClient } from '@/lib/supabase/admin'

import { mapFicha, mapFichaError, type ParcheFicha } from './ficha-persona'

type ClienteAdmin = ReturnType<typeof createSupabaseAdminClient>

type ErrorRpc = { readonly code?: string; readonly message?: string }
type RespuestaRpc = { readonly data: unknown; readonly error: ErrorRpc | null }
type ErrorAuth = { readonly code?: string; readonly message?: string; readonly status?: number }

/** The service-role writes, built only when the login must follow. */
export interface AdminCorreo {
  readonly leerAuthId: (personaId: string) => Promise<string | null>
  readonly actualizarEmailAuth: (authId: string, email: string) => Promise<{ readonly error: ErrorAuth | null }>
  /** auth.users.email as it is now; throws when it cannot be read. */
  readonly leerEmailAuth: (authId: string) => Promise<string | null>
  /** Sets usuarios.email back to `anterior` only while it is still `nuevo`; true when a row changed. */
  readonly restaurarEmail: (personaId: string, nuevo: string, anterior: string | null) => Promise<boolean>
}

export interface DependenciasFichaCorreo {
  /** RPC as the signed-in caller (the database checks the authority). */
  readonly rpcUsuario: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  readonly admin: () => AdminCorreo
}

export type ResultadoFichaCorreo =
  | { readonly ok: true; readonly data: unknown }
  /** `causa`: an error code for the server log (never row data nor an email). */
  | { readonly ok: false; readonly status: number; readonly error: string; readonly causa?: string }

export const MENSAJE_LOGIN_NO_CAMBIADO =
  'No se pudo cambiar el correo de inicio de sesión; no se guardó ningún cambio de correo.'
export const MENSAJE_LOGIN_SIN_RESTAURAR =
  'No se pudo cambiar el correo de inicio de sesión ni restaurar el anterior. Avisa a soporte.'
export const MENSAJE_LOGIN_NO_CONFIRMADO =
  'No se pudo confirmar el cambio del correo de inicio de sesión. Revisa la ficha y vuelve a intentarlo.'
const MENSAJE_EMAIL_EN_USO = 'Ese correo ya lo usa otra persona.'

const normalizar = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

function esCorreoExistente(error: ErrorAuth): boolean {
  return (
    error.code === 'email_exists' ||
    error.code === 'user_already_exists' ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  )
}

function falloRpc(error: ErrorRpc): ResultadoFichaCorreo {
  const f = mapFichaError(error)
  return { ok: false, status: f.status, error: f.error, causa: f.status === 500 ? `rpc:${error.code ?? 'sin_codigo'}` : undefined }
}

const codigoAuth = (error: ErrorAuth) => `auth:${error.code ?? (error.status ? `status_${error.status}` : 'sin_codigo')}`

/** Updates the ficha as the caller and, when an admin changed the email of a person with account, the login too. */
export async function editarFichaConCorreo(
  deps: DependenciasFichaCorreo,
  personaId: string,
  datos: ParcheFicha,
): Promise<ResultadoFichaCorreo> {
  const editar = () => deps.rpcUsuario('dream_team_editar_ficha', { p_persona_id: personaId, p_datos: datos })

  if (!('email' in datos)) {
    const { data, error } = await editar()
    return error ? falloRpc(error) : { ok: true, data }
  }

  const previa = await deps.rpcUsuario('dream_team_ficha_persona', { p_persona_id: personaId })
  if (previa.error) return falloRpc(previa.error)
  const antes = previa.data ? mapFicha(previa.data) : null
  const nuevo = datos.email
  const sincronizar =
    antes !== null && antes.tieneCuenta && antes.puedeEditarEmail && nuevo !== null && normalizar(nuevo) !== normalizar(antes.email)

  // Built before any write: without a service client nothing is saved.
  const admin = sincronizar ? deps.admin() : null

  const { data, error } = await editar()
  if (error) return falloRpc(error)
  if (!admin || !antes || nuevo === null) return { ok: true, data }

  let fallo: ErrorAuth
  let authId: string | null = null
  try {
    authId = await admin.leerAuthId(personaId)
    if (!authId) return { ok: true, data }
    const { error: errorAuth } = await admin.actualizarEmailAuth(authId, nuevo)
    if (!errorAuth) return { ok: true, data }
    fallo = errorAuth
  } catch {
    fallo = { code: authId ? 'lanzado' : 'auth_id_no_leido' }
  }

  // The update may have been applied anyway: what auth holds now decides.
  if (authId) {
    let actual: string | null
    try {
      actual = await admin.leerEmailAuth(authId)
    } catch {
      return { ok: false, status: 502, error: MENSAJE_LOGIN_NO_CONFIRMADO, causa: `${codigoAuth(fallo)}+relectura_fallida` }
    }
    if (normalizar(actual) === normalizar(nuevo)) return { ok: true, data }
  }

  let restaurado = false
  try {
    restaurado = await admin.restaurarEmail(personaId, nuevo, antes.email)
  } catch {
    restaurado = false
  }
  if (!restaurado) return { ok: false, status: 500, error: MENSAJE_LOGIN_SIN_RESTAURAR, causa: `${codigoAuth(fallo)}+sin_restaurar` }
  return esCorreoExistente(fallo)
    ? { ok: false, status: 409, error: MENSAJE_EMAIL_EN_USO }
    : { ok: false, status: 502, error: MENSAJE_LOGIN_NO_CAMBIADO, causa: codigoAuth(fallo) }
}

/** The service-role adapter over the Supabase admin client (server only). */
export function adminCorreoDesdeCliente(cliente: ClienteAdmin): AdminCorreo {
  return {
    async leerAuthId(personaId) {
      const { data, error } = await cliente.from('usuarios').select('auth_id').eq('id', personaId).maybeSingle()
      if (error) throw new Error('usuarios.auth_id lookup failed')
      return data?.auth_id ?? null
    },
    async actualizarEmailAuth(authId, email) {
      const { error } = await cliente.auth.admin.updateUserById(authId, { email, email_confirm: true })
      return { error }
    },
    async leerEmailAuth(authId) {
      const { data, error } = await cliente.auth.admin.getUserById(authId)
      if (error) throw new Error('auth.users lookup failed')
      return data.user?.email ?? null
    },
    async restaurarEmail(personaId, nuevo, anterior) {
      const { data, error } = await cliente
        .from('usuarios')
        .update({ email: anterior })
        .eq('id', personaId)
        .eq('email', nuevo)
        .select('id')
      return !error && Array.isArray(data) && data.length === 1
    },
  }
}
