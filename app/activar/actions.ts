'use server'

/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). Server actions behind /activar. The token only travels in the
 * HttpOnly cookie set by /activar/[token]; these actions hash it and call
 * the service_role RPCs through lib/platform/talleres/activacion-acceso.
 */

import { cookies } from 'next/headers'

import {
  activarCuenta,
  COOKIE_ACTIVACION,
  esTokenConFormato,
  mensajeActivacion,
  verificarCedula,
  type ClienteActivacion,
} from '@/lib/platform/talleres/activacion-acceso'
import { hashTokenInvitacion } from '@/lib/platform/talleres/invitacion-acceso-envio'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ResultadoPaso = { readonly ok: true } | { readonly ok: false; readonly mensaje: string }

export type ResultadoActivar =
  | { readonly ok: true; readonly destino: string }
  | { readonly ok: false; readonly mensaje: string }

async function hashDelCookie(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_ACTIVACION)?.value
  return esTokenConFormato(token) ? hashTokenInvitacion(token) : null
}

function admin(): ClienteActivacion {
  return createSupabaseAdminClient() as unknown as ClienteActivacion
}

export async function verificarCedulaActivacion(cedula: string): Promise<ResultadoPaso> {
  const tokenHash = await hashDelCookie()
  if (tokenHash === null) return { ok: false, mensaje: mensajeActivacion('ENLACE_INVALIDO') }
  const resultado = await verificarCedula(admin(), tokenHash, cedula)
  return resultado.ok ? { ok: true } : { ok: false, mensaje: resultado.mensaje }
}

export interface ActivarCuentaInput {
  readonly cedula: string
  readonly password: string
  readonly confirmaConyuge: boolean
}

export async function activarCuentaAction(input: ActivarCuentaInput): Promise<ResultadoActivar> {
  const tokenHash = await hashDelCookie()
  if (tokenHash === null) return { ok: false, mensaje: mensajeActivacion('ENLACE_INVALIDO') }

  const resultado = await activarCuenta(admin(), {
    tokenHash,
    cedula: input?.cedula,
    password: input?.password,
    confirmaConyuge: input?.confirmaConyuge === true,
  })
  if (!resultado.ok) return { ok: false, mensaje: resultado.mensaje }

  const jar = await cookies()
  jar.delete({ name: COOKIE_ACTIVACION, path: '/activar' })

  // The account exists and is linked; a failed sign-in only means the
  // person logs in by hand.
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email: resultado.email, password: input.password })
  return { ok: true, destino: error ? '/' : '/talleres/mi-recorrido' }
}
