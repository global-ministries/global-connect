/**
 * Account invitations by email (T12 of odd/tasks/ninos-voluntarios-waumba.md).
 *
 * A ficha without account (usuarios.auth_id NULL) is invited: the database
 * decides who may invite and validates the email (invitacion_cuenta_crear,
 * 20261008120000, called AS THE CALLER), then the service client creates the
 * auth account with auth.admin.generateLink and this module mails the
 * project's own branded email (Resend, like every other app email) with a
 * /auth/confirm link that lands on /auth/reset-password to choose a password.
 * When the link is opened, vincularFichaConfirmada binds the account to
 * exactly the invited ficha (invitacion_cuenta_vincular).
 *
 * Re-inviting reuses the account of the previous invitation (magic link) when
 * the email is the same, and deletes it first when the email changed and it
 * was never confirmed. Logs carry the invitation id only, never the address.
 */

export interface EntradaInvitacion {
  readonly email: string
  readonly reemplazarEmail: boolean
}

export interface InvitacionVista {
  readonly estado: 'enviada' | 'aceptada' | 'cancelada' | 'expirada'
  readonly email: string
  readonly enviadaEl: string
}

export interface EstadoInvitacion {
  readonly sinCuenta: boolean
  readonly emailFicha: string | null
  readonly invitacion: InvitacionVista | null
}

export type ErrorRpc = { readonly code?: string; readonly message?: string }
type RespuestaRpc = { readonly data: unknown; readonly error: ErrorRpc | null }

export type TipoEnlace = 'invite' | 'magiclink'

export interface DependenciasInvitacion {
  /** RPC as the signed-in caller (the database checks the authority). */
  readonly rpcUsuario: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  readonly admin: {
    readonly rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
    readonly obtenerUsuario: (
      id: string,
    ) => Promise<{ readonly email: string; readonly email_confirmed_at: string | null } | null>
    readonly borrarUsuario: (id: string) => Promise<{ readonly error: { message: string } | null }>
    readonly generarEnlace: (params: {
      readonly tipo: TipoEnlace
      readonly email: string
      readonly datos: Record<string, string>
    }) => Promise<
      | { readonly data: { readonly userId: string; readonly hashedToken: string }; readonly error: null }
      | { readonly data: null; readonly error: { readonly message: string } }
    >
  }
  readonly enviarCorreo: (correo: {
    readonly to: string
    readonly subject: string
    readonly nombre: string
    readonly enlace: string
    readonly idempotencyKey: string
  }) => Promise<{ readonly success: boolean; readonly error?: string }>
  readonly urlBase: string
}

export type ResultadoInvitacion =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly codigo?: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ESTADOS = new Set(['enviada', 'aceptada', 'cancelada', 'expirada'])

export function parseInvitacion(body: unknown): EntradaInvitacion | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Body inválido' }
  const datos = body as Record<string, unknown>
  const email = typeof datos.email === 'string' ? datos.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 254) return { error: 'Escribe un correo válido' }
  return { email, reemplazarEmail: datos.reemplazarEmail === true }
}

const ERRORES: Readonly<Record<string, { status: number; error: string }>> = {
  sin_autoridad: { status: 403, error: 'No tienes permiso para invitar a esta persona' },
  ficha_no_encontrada: { status: 404, error: 'Persona no encontrada' },
  ya_tiene_cuenta: { status: 409, error: 'Esta persona ya tiene una cuenta' },
  email_distinto: {
    status: 409,
    error: 'La ficha tiene otro correo. Confirma que quieres reemplazarlo por este.',
  },
  email_en_uso: { status: 409, error: 'Ese correo ya pertenece a otra persona o a otra cuenta' },
  email_invalido: { status: 422, error: 'Escribe un correo válido' },
}

export function mapInvitacionError(error: ErrorRpc): { status: number; error: string; codigo?: string } {
  const codigo = (error.message ?? '').trim()
  const conocido = ERRORES[codigo]
  if (conocido) return { ...conocido, codigo }
  if (error.code === '42501') return { ...ERRORES.sin_autoridad, codigo: 'sin_autoridad' }
  return { status: 500, error: 'No se pudo enviar la invitación' }
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export function mapEstadoInvitacion(raw: unknown): EstadoInvitacion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const fila = raw as Record<string, unknown>
  const inv = fila.invitacion as Record<string, unknown> | null | undefined
  const estado = inv ? texto(inv.estado) : null
  return {
    sinCuenta: fila.sin_cuenta === true,
    emailFicha: texto(fila.email_ficha),
    invitacion:
      inv && estado && ESTADOS.has(estado)
        ? {
            estado: estado as InvitacionVista['estado'],
            email: texto(inv.email) ?? '',
            enviadaEl: texto(inv.created_at) ?? '',
          }
        : null,
  }
}

type Creada = { id: string; email: string; nombre: string; previo: string | null }

function parseCreada(raw: unknown): Creada | null {
  if (typeof raw !== 'object' || raw === null) return null
  const fila = raw as Record<string, unknown>
  const id = texto(fila.id)
  const email = texto(fila.email)
  if (!id || !email) return null
  return { id, email, nombre: texto(fila.nombre) ?? '', previo: texto(fila.auth_user_id_previo) }
}

/** Decides the link type for the previous invitation's account, deleting it when it is stale. */
async function prepararCuentaPrevia(deps: DependenciasInvitacion, creada: Creada): Promise<TipoEnlace> {
  if (!creada.previo) return 'invite'
  const previo = await deps.admin.obtenerUsuario(creada.previo)
  if (!previo) return 'invite'
  if (previo.email.trim().toLowerCase() === creada.email) return 'magiclink'
  if (previo.email_confirmed_at === null) {
    const { error } = await deps.admin.borrarUsuario(creada.previo)
    if (error) console.error('[invitacion-cuenta] no se pudo borrar la cuenta previa:', creada.id)
  }
  return 'invite'
}

export async function enviarInvitacionCuenta(
  deps: DependenciasInvitacion,
  usuarioId: string,
  entrada: EntradaInvitacion,
): Promise<ResultadoInvitacion> {
  const { data, error } = await deps.rpcUsuario('invitacion_cuenta_crear', {
    p_usuario_id: usuarioId,
    p_email: entrada.email,
    p_reemplazar_email: entrada.reemplazarEmail,
  })
  if (error) {
    const f = mapInvitacionError(error)
    if (f.status === 500) console.error('[invitacion-cuenta] crear:', error.code)
    return { ok: false, ...f }
  }
  const creada = parseCreada(data)
  if (!creada) return { ok: false, status: 500, error: 'No se pudo enviar la invitación' }

  const tipo = await prepararCuentaPrevia(deps, creada)
  const enlace = await deps.admin.generarEnlace({
    tipo,
    email: creada.email,
    datos: { invitacion_cuenta_id: creada.id },
  })
  if (enlace.error || !enlace.data) {
    console.error('[invitacion-cuenta] generateLink falló:', creada.id)
    return { ok: false, status: 502, error: 'No se pudo crear la cuenta. Intenta de nuevo.' }
  }

  const registro = await deps.admin.rpc('invitacion_cuenta_registrar_envio', {
    p_id: creada.id,
    p_auth_user_id: enlace.data.userId,
  })
  if (registro.error) {
    console.error('[invitacion-cuenta] registrar envío falló:', creada.id)
    return { ok: false, status: 500, error: 'No se pudo enviar la invitación' }
  }

  const params = new URLSearchParams({
    token_hash: enlace.data.hashedToken,
    type: tipo,
    next: '/auth/reset-password',
  })
  const correo = await deps.enviarCorreo({
    to: creada.email,
    subject: 'Te invitamos a GlobalConnect',
    nombre: creada.nombre,
    enlace: `${deps.urlBase}/auth/confirm?${params.toString()}`,
    idempotencyKey: `invitacion-cuenta-${creada.id}`,
  })
  if (!correo.success) {
    console.error('[invitacion-cuenta] correo falló:', creada.id)
    return { ok: false, status: 502, error: 'No se pudo enviar el correo. Puedes reenviarlo.' }
  }
  return { ok: true, email: creada.email }
}
