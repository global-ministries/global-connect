'use server'

/**
 * T2 (odd/tasks/proximo-paso.md, S3) — server actions of the public QR page
 * /proximo-paso.
 *
 *   - `registrarseEnProximoPaso(datos)`: a visitor without an account creates
 *     it (nombre, apellido, teléfono, correo, contraseña) and enrolls in the
 *     edición they picked.
 *   - `inscribirmeEnProximoPaso(edicionId)`: a signed-in person enrolls
 *     through the existing `inscribirseATaller` of /talleres/explorar.
 *   - `confirmarCodigoProximoPaso({ email, token, edicionId })` (T2c, L8):
 *     the 6-digit code of the confirmation email, typed on the same page.
 *     verifyOtp (type signup) on the SSR client sets the session cookies;
 *     only then is the ficha linked and the person enrolled, the same steps
 *     as an account confirmed at once.
 *   - `reenviarCodigoProximoPaso({ email, edicionId })`: sends the
 *     confirmation email again, with the same answer for every address.
 *
 * The edición is never trusted from the client: both actions look it up in
 * proximo_paso_ediciones_abiertas (only open Próximo Paso ediciones), so
 * these actions can never enroll anyone in another taller.
 *
 * The account is created like /signup does (lib/actions/auth.actions.ts):
 * supabase.auth.signUp with the form data in user_metadata, the ficha linked
 * by vincularFichaConfirmada only once the email is confirmed, and Supabase
 * Auth's own rate limit. When the project confirms emails, signUp returns no
 * session: the person gets an email with a 6-digit code to type on the page
 * and a link whose `next` brings them back to /proximo-paso with the edición
 * preselected, signed in, one tap from enrolling (the fallback). When it confirms at once, the ficha is linked and the
 * enrollment goes through talleres_inscribirme right away with the new
 * session.
 *
 * Never reveals whether an email already has an account (L6.1): an existing
 * email (Supabase answers an error, or a user without identities when it
 * hides it) gets exactly the same "revisa tu correo" answer as a new account,
 * with no extra call. The form's "¿Ya tienes cuenta? Inicia sesión" link is
 * the way in for someone who already has one. The code step keeps that
 * promise: a wrong or expired code and an unknown email read the same, and
 * a resend answers the same message for every address. Supabase Auth limits
 * how often a code can be sent and tried; its rate-limit error becomes a
 * plain message.
 *
 * The enrollment is "inscrito" only when talleres_inscribirme approved it on
 * the spot (taller with inscripcion_automatica and cupo, L6.2); otherwise it
 * is "pendiente" until the coordinación approves it.
 *
 * The phone is saved on the person's own ficha only when the ficha has none
 * (vincularFichaConfirmada does not carry it), best effort.
 */

import { revalidatePath } from 'next/cache'

import { inscribirseATaller } from '@/app/(auth)/talleres/explorar/actions'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import {
  MENSAJES_PAREJA,
  parseResultadoInscribirme,
  traducirErrorRpcPareja,
} from '@/lib/platform/talleres/inscripcion-pareja'
import {
  estadoInscripcion,
  loginProximoPaso,
  MENSAJES_REGISTRO,
  normalizarCorreo,
  parseEdicionesProximoPaso,
  RUTA_MIS_CLASES,
  rutaProximoPaso,
  validarCodigo,
  validarRegistro,
  type CampoRegistro,
  type EdicionProximoPaso,
  type EdicionResumen,
  type EstadoInscripcionProximoPaso,
} from '@/lib/platform/talleres/proximo-paso-registro'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { vincularFichaConfirmada } from '@/lib/supabase/vincular-ficha'

export interface FalloProximoPaso {
  readonly ok: false
  readonly error: string
  readonly message: string
  /** Login that comes back to the same edición, when signing in is the way forward. */
  readonly loginHref?: string
  /** Per-field messages of the form. */
  readonly errores?: Partial<Record<CampoRegistro, string>>
  /** The code was verified: the person is signed in even though the enrollment did not go through. */
  readonly sesionAbierta?: true
}

export type ResultadoInscripcion =
  | { readonly ok: true; readonly estado: EstadoInscripcionProximoPaso; readonly edicion: EdicionResumen }
  | FalloProximoPaso

export type ResultadoRegistro =
  | ResultadoInscripcion
  | { readonly ok: true; readonly estado: 'confirmar_correo'; readonly email: string; readonly edicion: EdicionResumen }

export type ResultadoReenvio = { readonly ok: true; readonly message: string } | FalloProximoPaso

const MENSAJE_INTERNO = 'No se pudo completar el registro. Inténtalo de nuevo.'

const fallo = (error: string, message: string): FalloProximoPaso => ({ ok: false, error, message })

const NO_DISPONIBLE = fallo('not-found', 'Las inscripciones no están disponibles en este momento.')
const EDICION_NO_DISPONIBLE = fallo('EDICION_NO_DISPONIBLE', 'Esa fecha ya no está disponible. Elige otra.')
const CODIGO_INCOMPLETO = fallo('invalid-input', 'Escribe los 6 dígitos del código.')
const CORREO_INVALIDO = fallo('invalid-input', MENSAJES_REGISTRO.email)
const CODIGO_INVALIDO = fallo(
  'CODIGO_INVALIDO',
  'El código no es válido o ya venció. Revisa el último correo o pide uno nuevo.',
)
const LIMITE_CODIGO = fallo('LIMITE', 'Hiciste muchos intentos. Espera un momento y vuelve a intentarlo.')
// A server or network failure is not a bad code: asking for a new one would not help.
const CODIGO_NO_VERIFICADO = fallo(
  'internal',
  'No pudimos revisar tu código en este momento. Espera unos segundos y vuelve a intentarlo.',
)
const CODIGO_REENVIADO: ResultadoReenvio = {
  ok: true,
  message: 'Te enviamos un código nuevo. Revisa tu correo, también la carpeta de spam.',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
type Cliente = any

const resumen = (e: EdicionProximoPaso): EdicionResumen => ({ id: e.id, nombre: e.nombre, fechaInicio: e.fechaInicio })

/** The chosen edición among the open Próximo Paso ones, or the failure to return. */
async function edicionAbierta(
  client: Cliente,
  edicionId: string,
): Promise<{ readonly ok: true; readonly edicion: EdicionProximoPaso } | FalloProximoPaso> {
  const { data, error } = await client.rpc('proximo_paso_ediciones_abiertas')
  if (error) return fallo('internal', MENSAJE_INTERNO)
  const edicion = parseEdicionesProximoPaso(data).find((e) => e.id === edicionId)
  if (!edicion) return EDICION_NO_DISPONIBLE
  if (edicion.cupoRestante === 0) return fallo('CUPO_LLENO', MENSAJES_PAREJA.CUPO_LLENO)
  return { ok: true, edicion }
}

/** Saves the phone on the person's own ficha when it has none. Never throws. */
async function guardarTelefono(authId: string, telefono: unknown): Promise<void> {
  if (typeof telefono !== 'string' || telefono === '') return
  try {
    await createSupabaseAdminClient()
      .from('usuarios')
      .update({ telefono })
      .eq('auth_id', authId)
      .is('telefono', null)
  } catch (error) {
    console.error('Próximo Paso: no se guardó el teléfono', error)
  }
}

type ErrorAuth = { readonly code?: string; readonly status?: number } | null

/** An existing email: Supabase's own error when it does not hide it. */
function esCorreoExistente(error: ErrorAuth): boolean {
  const code = error?.code ?? ''
  return code === 'user_already_exists' || code === 'email_exists' || (!code && error?.status === 400)
}

function esLimite(error: ErrorAuth): boolean {
  return error?.status === 429 || (error?.code ?? '').startsWith('over_')
}

/** Supabase down or unreachable (5xx, or status 0 on a network error). */
function esFalloTemporal(error: ErrorAuth): boolean {
  const status = error?.status
  return status === 0 || (typeof status === 'number' && status >= 500)
}

/** The confirmation email of a signup, whose link comes back to the chosen edición. */
function redireccionCorreo(edicionId: string): string {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `${sitio}/auth/callback?next=${encodeURIComponent(rutaProximoPaso(edicionId))}`
}

function falloSignUp(error: ErrorAuth): FalloProximoPaso {
  const code = error?.code ?? ''
  if (code === 'weak_password') {
    return {
      ...fallo('invalid-input', 'Revisa los datos marcados.'),
      errores: { password: 'Elige una contraseña más segura: mezcla letras y números.' },
    }
  }
  if (esLimite(error)) {
    return fallo('LIMITE', 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.')
  }
  return fallo('internal', MENSAJE_INTERNO)
}

export async function registrarseEnProximoPaso(input: unknown): Promise<ResultadoRegistro> {
  if (!isTalleresEnabled()) return NO_DISPONIBLE

  const validacion = validarRegistro(input)
  if (!validacion.ok) {
    return { ...fallo('invalid-input', 'Revisa los datos marcados.'), errores: validacion.errores }
  }
  const datos = validacion.datos
  const edicionId = (input as { edicionId?: unknown }).edicionId
  if (typeof edicionId !== 'string' || edicionId.trim() === '') return EDICION_NO_DISPONIBLE

  const client = await createSupabaseServerClient()
  const { data: actual } = await client.auth.getUser()
  if (actual?.user) {
    return fallo('CON_SESION', 'Ya tienes sesión iniciada. Recarga la página para inscribirte con tu cuenta.')
  }

  const elegida = await edicionAbierta(client, edicionId.trim())
  if (!elegida.ok) return elegida
  const { edicion } = elegida

  const { data, error } = await client.auth.signUp({
    email: datos.email,
    password: datos.password,
    options: {
      data: { nombre: datos.nombre, apellido: datos.apellido, telefono: datos.telefono },
      emailRedirectTo: redireccionCorreo(edicion.id),
    },
  })
  const confirmarCorreo: ResultadoRegistro = { ok: true, estado: 'confirmar_correo', email: datos.email, edicion: resumen(edicion) }
  // An existing email reads exactly like a new account (L6.1).
  if (esCorreoExistente(error)) return confirmarCorreo
  if (error) return falloSignUp(error)

  const user = data?.user
  if (!user) return fallo('internal', MENSAJE_INTERNO)
  // With email confirmation on, Supabase hides an existing email behind a user without identities.
  if (Array.isArray(user.identities) && user.identities.length === 0) return confirmarCorreo
  if (!data.session || !user.email_confirmed_at) return confirmarCorreo

  const vinculo = await vincularCuenta(user, datos.telefono)
  if (vinculo) return vinculo
  return inscribirConSesionNueva(client, edicion)
}

/**
 * The steps once an account is confirmed and signed in on this request: link
 * the ficha (vincularFichaConfirmada) and save the phone. The failure to
 * return, or null when the person can enroll.
 */
async function vincularCuenta(
  user: Parameters<typeof vincularFichaConfirmada>[1] & { readonly id: string },
  telefono: unknown,
): Promise<FalloProximoPaso | null> {
  const vinculo = await vincularFichaConfirmada(createSupabaseAdminClient(), user)
  if (vinculo.estado === 'pendiente_aprobacion' || vinculo.estado === 'ambigua') {
    return fallo(
      'CUENTA_EN_REVISION',
      'Tu cuenta quedó creada. La coordinación debe revisarla antes de inscribirte; te avisaremos.',
    )
  }
  if (vinculo.estado === 'error' || vinculo.estado === 'sin_confirmar') {
    return fallo('CUENTA_SIN_INSCRIPCION', 'Tu cuenta quedó creada, pero no pudimos inscribirte. Inténtalo de nuevo.')
  }
  await guardarTelefono(user.id, telefono)
  return null
}

/** Enrolls with the session just opened on this client (signUp or verifyOtp). */
async function inscribirConSesionNueva(client: Cliente, edicion: EdicionProximoPaso): Promise<ResultadoInscripcion> {
  // The same RPC inscribirseATaller calls.
  const inscripcion = await client.rpc('talleres_inscribirme', { p_edicion_id: edicion.id, p_pareja: null })
  const resultado = inscripcion.error ? null : parseResultadoInscribirme(inscripcion.data)
  if (!resultado?.ok) {
    const motivo = inscripcion.error
      ? traducirErrorRpcPareja(inscripcion.error, MENSAJE_INTERNO).message
      : resultado
        ? MENSAJES_PAREJA[resultado.codigo]
        : MENSAJE_INTERNO
    return fallo('CUENTA_SIN_INSCRIPCION', `Tu cuenta quedó creada, pero no pudimos inscribirte: ${motivo}`)
  }

  revalidatePath(RUTA_MIS_CLASES)
  return { ok: true, estado: estadoInscripcion(inscripcion.data), edicion: resumen(edicion) }
}

export async function confirmarCodigoProximoPaso(input: unknown): Promise<ResultadoInscripcion> {
  if (!isTalleresEnabled()) return NO_DISPONIBLE
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const token = validarCodigo(r.token)
  if (!token) return CODIGO_INCOMPLETO
  const email = normalizarCorreo(r.email)
  if (!email) return CORREO_INVALIDO
  const edicionId = typeof r.edicionId === 'string' ? r.edicionId.trim() : ''
  if (edicionId === '') return EDICION_NO_DISPONIBLE

  const client = await createSupabaseServerClient()
  // The SSR client stores the new session in the response cookies.
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'signup' })
  if (error) {
    if (esLimite(error)) return LIMITE_CODIGO
    if (esFalloTemporal(error)) return CODIGO_NO_VERIFICADO
    return CODIGO_INVALIDO
  }
  const user = data?.user
  if (!user || !data.session) return CODIGO_INVALIDO

  // From here on the person is signed in: every failure says so.
  const conSesion = (f: FalloProximoPaso): FalloProximoPaso => ({ ...f, sesionAbierta: true })
  const vinculo = await vincularCuenta(user, user.user_metadata?.telefono)
  if (vinculo) return conSesion(vinculo)
  const elegida = await edicionAbierta(client, edicionId)
  if (!elegida.ok) return conSesion(elegida)
  const resultado = await inscribirConSesionNueva(client, elegida.edicion)
  return resultado.ok ? resultado : conSesion(resultado)
}

export async function reenviarCodigoProximoPaso(input: unknown): Promise<ResultadoReenvio> {
  if (!isTalleresEnabled()) return NO_DISPONIBLE
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const email = normalizarCorreo(r.email)
  if (!email) return CORREO_INVALIDO
  const edicionId = typeof r.edicionId === 'string' ? r.edicionId.trim() : ''

  const client = await createSupabaseServerClient()
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: redireccionCorreo(edicionId) },
  })
  // Any other answer (unknown or already confirmed email) reads like a sent code.
  return esLimite(error) ? LIMITE_CODIGO : CODIGO_REENVIADO
}

export async function inscribirmeEnProximoPaso(edicionId: unknown): Promise<ResultadoInscripcion> {
  if (!isTalleresEnabled()) return NO_DISPONIBLE
  if (typeof edicionId !== 'string' || edicionId.trim() === '') {
    return fallo('invalid-input', 'Elige una fecha para empezar.')
  }
  const id = edicionId.trim()

  const client = await createSupabaseServerClient()
  const { data } = await client.auth.getUser()
  const user = data?.user
  if (!user) return { ...fallo('unauthorized', 'Inicia sesión para inscribirte.'), loginHref: loginProximoPaso(id) }

  const elegida = await edicionAbierta(client, id)
  if (!elegida.ok) return elegida

  const resultado = await inscribirseATaller({ edicionId: id })
  if (!resultado.ok) return fallo(resultado.error, resultado.message)

  await guardarTelefono(user.id, user.user_metadata?.telefono)
  // inscribirseATaller returns only the id; the person may read their own row.
  const { data: fila, error } = await client
    .from('taller_inscripciones')
    .select('estado')
    .eq('id', resultado.inscripcionId)
    .maybeSingle()
  return { ok: true, estado: estadoInscripcion(error ? null : fila), edicion: resumen(elegida.edicion) }
}
