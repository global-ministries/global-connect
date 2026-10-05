/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). Server logic behind /activar: the invited spouse opens the emailed
 * link, confirms their cédula, sets a password and gets a confirmed account
 * bound to the ficha the member created.
 *
 * Every call goes through service_role RPCs (admin client) keyed by the
 * sha256 of the token, never the raw token:
 *   - `invitacion_acceso_consultar(p_token_hash)` → `{valida, taller_nombre,
 *     nombre_invitado, vinculo, nombre_invitante}`;
 *   - `invitacion_acceso_verificar(p_token_hash, p_cedula)` → `{ok,
 *     invitacion_id, email}` | `{ok:false, codigo: CEDULA_NO_COINCIDE
 *     (+intentos_restantes) | BLOQUEADA | INVITACION_INVALIDA}`;
 *   - `invitacion_acceso_vincular(p_id, p_auth_user_id, p_confirma_conyuge)`
 *     → `{ok, conyuge_registrado}` | `{ok:false, codigo: INVITACION_INVALIDA
 *     | AUTH_NO_COINCIDE | FICHA_YA_VINCULADA}`.
 *
 * ENLACE_INVALIDO (no or malformed cookie) and YA_TIENE_CUENTA (GoTrue
 * refuses the email) are app-side codes, not RPC answers.
 */

import { cedulaParaRpc } from '@/lib/platform/talleres/inscripcion-pareja'

/** HttpOnly cookie that carries the token between /activar/[token] and /activar. */
export const COOKIE_ACTIVACION = 'gc_activar'
export const COOKIE_ACTIVACION_MAX_AGE_S = 30 * 60
export const LARGO_MINIMO_PASSWORD = 8
/** bcrypt (GoTrue) ignores anything past 72 bytes. */
export const LARGO_MAXIMO_PASSWORD = 72

const PATRON_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function esTokenConFormato(token: unknown): token is string {
  return typeof token === 'string' && PATRON_TOKEN.test(token)
}

interface RespuestaRpc {
  readonly data: unknown
  readonly error: unknown
}

export interface ClienteActivacion {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
  readonly auth: {
    readonly admin: {
      createUser(atributos: {
        email: string
        password: string
        email_confirm: boolean
      }): PromiseLike<{
        data: { user: { id: string } | null } | null
        error: { message?: string; code?: string; status?: number } | null
      }>
      deleteUser(id: string): PromiseLike<unknown>
    }
  }
}

export type CodigoActivacion =
  | 'ENLACE_INVALIDO'
  | 'INVITACION_INVALIDA'
  | 'AUTH_NO_COINCIDE'
  | 'FICHA_YA_VINCULADA'
  | 'CEDULA_NO_COINCIDE'
  | 'BLOQUEADA'
  | 'YA_TIENE_CUENTA'
  | 'CEDULA_INVALIDA'
  | 'PASSWORD_CORTA'
  | 'ERROR'

const MENSAJES: Readonly<Record<CodigoActivacion, string>> = {
  ENLACE_INVALIDO:
    'Este enlace no es válido o ya venció. Pide a la coordinación del taller que te reenvíe el acceso.',
  INVITACION_INVALIDA:
    'Esta invitación ya no está disponible. Pide a la coordinación del taller que te reenvíe el acceso.',
  AUTH_NO_COINCIDE: 'No se pudo completar la activación. Inténtalo de nuevo.',
  FICHA_YA_VINCULADA: 'Esta ficha ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
  CEDULA_NO_COINCIDE: 'La cédula no coincide con la de la invitación.',
  BLOQUEADA:
    'Este acceso se bloqueó por demasiados intentos. Pide a la coordinación del taller que te reenvíe el acceso.',
  YA_TIENE_CUENTA: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
  CEDULA_INVALIDA: 'Revisa la cédula: debe tener de 6 a 8 números, o una E y de 6 a 9 números si es extranjera.',
  PASSWORD_CORTA: `La contraseña debe tener entre ${LARGO_MINIMO_PASSWORD} y ${LARGO_MAXIMO_PASSWORD} caracteres.`,
  ERROR: 'No se pudo completar la activación. Inténtalo de nuevo.',
}

export function mensajeActivacion(codigo: CodigoActivacion): string {
  return MENSAJES[codigo]
}

export type FalloActivacion = {
  readonly ok: false
  readonly codigo: CodigoActivacion
  readonly mensaje: string
}

function fallo(codigo: CodigoActivacion, mensaje: string = MENSAJES[codigo]): FalloActivacion {
  return { ok: false, codigo, mensaje }
}

function esObjeto(valor: unknown): valor is Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

const CODIGOS_RPC: readonly CodigoActivacion[] = [
  'CEDULA_NO_COINCIDE',
  'BLOQUEADA',
  'INVITACION_INVALIDA',
  'AUTH_NO_COINCIDE',
  'FICHA_YA_VINCULADA',
]

function codigoRpc(valor: unknown): CodigoActivacion {
  return typeof valor === 'string' && (CODIGOS_RPC as readonly string[]).includes(valor)
    ? (valor as CodigoActivacion)
    : 'ERROR'
}

export type InvitacionConsultada =
  | {
      readonly valida: true
      readonly tallerNombre: string
      readonly nombreInvitado: string
      readonly nombreInvitante: string | null
      readonly vinculo: 'matrimonio' | 'novios' | null
    }
  | { readonly valida: false }

export async function consultarInvitacion(admin: ClienteActivacion, tokenHash: string): Promise<InvitacionConsultada> {
  try {
    const { data, error } = await admin.rpc('invitacion_acceso_consultar', { p_token_hash: tokenHash })
    if (error || !esObjeto(data) || data.valida !== true) return { valida: false }
    return {
      valida: true,
      tallerNombre: texto(data.taller_nombre) ?? 'tu taller',
      nombreInvitado: texto(data.nombre_invitado) ?? '',
      nombreInvitante: texto(data.nombre_invitante),
      vinculo: data.vinculo === 'matrimonio' || data.vinculo === 'novios' ? data.vinculo : null,
    }
  } catch {
    return { valida: false }
  }
}

export type CedulaVerificada =
  | { readonly ok: true; readonly invitacionId: string; readonly email: string }
  | FalloActivacion

export async function verificarCedula(
  admin: ClienteActivacion,
  tokenHash: string,
  cedula: unknown,
): Promise<CedulaVerificada> {
  const cedulaNormalizada = cedulaParaRpc(cedula)
  if (cedulaNormalizada === null) return fallo('CEDULA_INVALIDA')
  try {
    const { data, error } = await admin.rpc('invitacion_acceso_verificar', {
      p_token_hash: tokenHash,
      p_cedula: cedulaNormalizada,
    })
    if (error || !esObjeto(data)) return fallo('ERROR')
    if (data.ok === true) {
      const invitacionId = texto(data.invitacion_id)
      const email = texto(data.email)
      return invitacionId && email ? { ok: true, invitacionId, email } : fallo('ERROR')
    }
    const codigo = codigoRpc(data.codigo)
    if (codigo === 'CEDULA_NO_COINCIDE' && typeof data.intentos_restantes === 'number') {
      const n = data.intentos_restantes
      return fallo(codigo, `${MENSAJES.CEDULA_NO_COINCIDE} Te ${n === 1 ? 'queda 1 intento' : `quedan ${n} intentos`}.`)
    }
    return fallo(codigo)
  } catch {
    return fallo('ERROR')
  }
}

export interface EntradaActivacion {
  readonly tokenHash: string
  readonly cedula: unknown
  readonly password: unknown
  readonly confirmaConyuge: boolean
}

export type ResultadoActivacion = { readonly ok: true; readonly email: string } | FalloActivacion

function esCorreoExistente(error: { message?: string; code?: string; status?: number }): boolean {
  return (
    error.code === 'email_exists' ||
    error.code === 'user_already_exists' ||
    error.status === 422 ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  )
}

/**
 * Verifies the cédula again (the browser holds no proof of the first
 * check), creates the auth user with a confirmed email and binds it to the
 * ficha. A refused binding deletes the new auth user so no orphan account
 * is left behind.
 */
export async function activarCuenta(admin: ClienteActivacion, entrada: EntradaActivacion): Promise<ResultadoActivacion> {
  const password = typeof entrada.password === 'string' ? entrada.password : ''
  if (password.length < LARGO_MINIMO_PASSWORD || password.length > LARGO_MAXIMO_PASSWORD) {
    return fallo('PASSWORD_CORTA')
  }

  const verificada = await verificarCedula(admin, entrada.tokenHash, entrada.cedula)
  if (!verificada.ok) return verificada

  try {
    const creado = await admin.auth.admin.createUser({
      email: verificada.email,
      password,
      email_confirm: true,
    })
    if (creado.error) return fallo(esCorreoExistente(creado.error) ? 'YA_TIENE_CUENTA' : 'ERROR')
    const userId = creado.data?.user?.id
    if (!userId) return fallo('ERROR')

    const { data, error } = await admin.rpc('invitacion_acceso_vincular', {
      p_id: verificada.invitacionId,
      p_auth_user_id: userId,
      p_confirma_conyuge: entrada.confirmaConyuge === true,
    })
    if (error || !esObjeto(data) || data.ok !== true) {
      await admin.auth.admin.deleteUser(userId)
      return fallo(esObjeto(data) ? codigoRpc(data.codigo) : 'ERROR')
    }
    return { ok: true, email: verificada.email }
  } catch {
    return fallo('ERROR')
  }
}
