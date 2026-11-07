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
 *
 * The edición is never trusted from the client: both actions look it up in
 * proximo_paso_ediciones_abiertas (only open Próximo Paso ediciones), so
 * these actions can never enroll anyone in another taller.
 *
 * The account is created like /signup does (lib/actions/auth.actions.ts):
 * supabase.auth.signUp with the form data in user_metadata, the ficha linked
 * by vincularFichaConfirmada only once the email is confirmed, and Supabase
 * Auth's own rate limit. When the project confirms emails, signUp returns no
 * session: the person gets the link by email, whose `next` brings them back
 * to /proximo-paso with the edición preselected, signed in, one tap from
 * enrolling. When it confirms at once, the ficha is linked and the
 * enrollment goes through talleres_inscribirme right away with the new
 * session. An existing email is sent to sign in and continue (Supabase
 * answers an error, or a user without identities when it hides it).
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
  loginProximoPaso,
  parseEdicionesProximoPaso,
  RUTA_MIS_CLASES,
  rutaProximoPaso,
  validarRegistro,
  type CampoRegistro,
  type EdicionProximoPaso,
  type EdicionResumen,
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
}

export type ResultadoRegistro =
  | { readonly ok: true; readonly estado: 'inscrito'; readonly edicion: EdicionResumen }
  | { readonly ok: true; readonly estado: 'confirmar_correo'; readonly email: string; readonly edicion: EdicionResumen }
  | FalloProximoPaso

export type ResultadoInscripcion =
  | { readonly ok: true; readonly estado: 'inscrito'; readonly edicion: EdicionResumen }
  | FalloProximoPaso

const MENSAJE_INTERNO = 'No se pudo completar el registro. Inténtalo de nuevo.'

const fallo = (error: string, message: string): FalloProximoPaso => ({ ok: false, error, message })

const NO_DISPONIBLE = fallo('not-found', 'Las inscripciones no están disponibles en este momento.')
const EDICION_NO_DISPONIBLE = fallo('EDICION_NO_DISPONIBLE', 'Esa fecha ya no está disponible. Elige otra.')

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

function falloSignUp(error: ErrorAuth, edicion: EdicionProximoPaso): FalloProximoPaso {
  const code = error?.code ?? ''
  if (code === 'user_already_exists' || code === 'email_exists' || (!code && error?.status === 400)) {
    return cuentaExistente(edicion)
  }
  if (code === 'weak_password') {
    return {
      ...fallo('invalid-input', 'Revisa los datos marcados.'),
      errores: { password: 'Elige una contraseña más segura: mezcla letras y números.' },
    }
  }
  if (error?.status === 429 || code.startsWith('over_')) {
    return fallo('LIMITE', 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.')
  }
  return fallo('internal', MENSAJE_INTERNO)
}

function cuentaExistente(edicion: EdicionProximoPaso): FalloProximoPaso {
  return {
    ...fallo('CUENTA_EXISTENTE', `Ya tienes una cuenta con ese correo. Inicia sesión y te inscribimos en ${edicion.nombre}.`),
    loginHref: loginProximoPaso(edicion.id),
  }
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

  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await client.auth.signUp({
    email: datos.email,
    password: datos.password,
    options: {
      data: { nombre: datos.nombre, apellido: datos.apellido, telefono: datos.telefono },
      emailRedirectTo: `${sitio}/auth/callback?next=${encodeURIComponent(rutaProximoPaso(edicion.id))}`,
    },
  })
  if (error) return falloSignUp(error, edicion)

  const user = data?.user
  if (!user) return fallo('internal', MENSAJE_INTERNO)
  // With email confirmation on, Supabase hides an existing email behind a user without identities.
  if (Array.isArray(user.identities) && user.identities.length === 0) return cuentaExistente(edicion)

  if (!data.session || !user.email_confirmed_at) {
    return { ok: true, estado: 'confirmar_correo', email: datos.email, edicion: resumen(edicion) }
  }

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

  await guardarTelefono(user.id, datos.telefono)

  // The same RPC inscribirseATaller calls, with the session signUp just opened on this client.
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
  return { ok: true, estado: 'inscrito', edicion: resumen(edicion) }
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
  return { ok: true, estado: 'inscrito', edicion: resumen(elegida.edicion) }
}
