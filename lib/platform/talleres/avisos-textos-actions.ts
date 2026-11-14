'use server'

/**
 * The editor of a notice's text (R4b of odd/tasks/talleres-rediseno.md, S10
 * S11; design/talleres-avisos 02–04).
 *
 * - Save / restore call `talleres_aviso_texto_guardar` /
 *   `talleres_aviso_texto_restaurar`, which check coordinator/director write
 *   or admin.manage on the taller's node and validate the text against
 *   `talleres_aviso_variables()`. Here: input shape only, and the errors in
 *   Spanish «tú».
 * - «Enviarme una prueba» sends ONE email to the current user only: the
 *   draft rendered with sample data, the same template as the real notices,
 *   5 per hour per person (see avisos-prueba.ts for the limit's scope).
 */
import { revalidatePath } from 'next/cache'

import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { nombreAviso } from './avisos-catalogo'
import { correoPruebaAviso, intentarPrueba, PRUEBAS_POR_HORA } from './avisos-prueba'
import {
  datosEjemplo,
  esTipoEditable,
  MENSAJE_SIN_PERMISO,
  mensajeErrorServidor,
  mensajeErrorTexto,
  parseVariablesAvisos,
  validarTextoAviso,
} from './avisos-textos'

export interface ResultadoTextoAviso {
  readonly ok: boolean
  readonly mensaje: string
}

export interface BorradorTextoAviso {
  readonly tallerId: string
  readonly tipo: string
  /** A plantilla clase (recordatorio_clase only); null = the general text. */
  readonly claseId: string | null
  readonly asunto: string
  readonly mensaje: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_EDITABLE: ResultadoTextoAviso = { ok: false, mensaje: 'Ese aviso no se puede editar.' }
const DESHABILITADO: ResultadoTextoAviso = { ok: false, mensaje: 'El módulo de talleres está deshabilitado.' }

function destinoValido(input: { tallerId: unknown; tipo: unknown; claseId: unknown }): boolean {
  return (
    typeof input.tallerId === 'string' &&
    UUID.test(input.tallerId) &&
    typeof input.tipo === 'string' &&
    esTipoEditable(input.tipo) &&
    (input.claseId === null || (typeof input.claseId === 'string' && UUID.test(input.claseId)))
  )
}

function borradorValido(input: BorradorTextoAviso): boolean {
  return destinoValido(input) && typeof input.asunto === 'string' && typeof input.mensaje === 'string'
}

async function cliente() {
  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the RPCs are newer than database.types
  return supabase as any
}

export async function guardarTextoAvisoAction(input: BorradorTextoAviso): Promise<ResultadoTextoAviso> {
  if (!isTalleresEnabled()) return DESHABILITADO
  if (!borradorValido(input)) return NO_EDITABLE

  const client = await cliente()
  const { error } = await client.rpc('talleres_aviso_texto_guardar', {
    p_taller_id: input.tallerId,
    p_tipo: input.tipo,
    p_clase_id: input.claseId,
    p_asunto: input.asunto,
    p_mensaje: input.mensaje,
  })
  if (error) return { ok: false, mensaje: mensajeErrorServidor(error) }

  revalidatePath('/talleres/[taller]/avisos', 'page')
  return {
    ok: true,
    mensaje: input.claseId
      ? 'Guardado. Los próximos recordatorios de esta clase salen con este texto.'
      : `Guardado. Los próximos avisos «${nombreAviso(input.tipo)}» salen con este texto.`,
  }
}

export async function restaurarTextoAvisoAction(input: {
  tallerId: string
  tipo: string
  claseId: string | null
}): Promise<ResultadoTextoAviso> {
  if (!isTalleresEnabled()) return DESHABILITADO
  if (!destinoValido(input)) return NO_EDITABLE

  const client = await cliente()
  const { error } = await client.rpc('talleres_aviso_texto_restaurar', {
    p_taller_id: input.tallerId,
    p_tipo: input.tipo,
    p_clase_id: input.claseId,
  })
  if (error) return { ok: false, mensaje: mensajeErrorServidor(error, 'No se pudo restaurar. Inténtalo de nuevo.') }

  revalidatePath('/talleres/[taller]/avisos', 'page')
  return {
    ok: true,
    mensaje: input.claseId
      ? 'Esta clase vuelve a usar el texto general.'
      : `«${nombreAviso(input.tipo)}» vuelve al texto predeterminado.`,
  }
}

function urlBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org').replace(/\/+$/, '')
}

const TEXTO_CLASE_MAX = 120

export async function enviarPruebaAvisoAction(
  input: BorradorTextoAviso & { readonly clase?: { readonly numero: number; readonly tema: string } | null },
): Promise<ResultadoTextoAviso> {
  if (!isTalleresEnabled()) return DESHABILITADO
  if (!borradorValido(input) || !esTipoEditable(input.tipo)) return NO_EDITABLE
  const tipo = input.tipo

  const client = await cliente()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Necesitas iniciar sesión.' }
  const email = typeof user.email === 'string' ? user.email.trim() : ''
  if (!email) return { ok: false, mensaje: 'Tu cuenta no tiene un correo para enviarte la prueba.' }

  // Same authority as saving: talleres_avisos_panel says whether the caller may edit.
  const panel = await client.rpc('talleres_avisos_panel', { p_taller_id: input.tallerId })
  if (panel.error || panel.data?.puede_editar !== true) return { ok: false, mensaje: MENSAJE_SIN_PERMISO }

  const variables = await client.rpc('talleres_aviso_variables')
  const definicion = variables.error ? undefined : parseVariablesAvisos(variables.data)[tipo]
  if (!definicion) return { ok: false, mensaje: 'No se pudo preparar la prueba. Inténtalo de nuevo.' }
  const [primerError] = validarTextoAviso(input, definicion)
  if (primerError) return { ok: false, mensaje: mensajeErrorTexto(primerError, nombreAviso(tipo)) }

  if (!intentarPrueba(user.id)) {
    return { ok: false, mensaje: `Ya te enviaste ${PRUEBAS_POR_HORA} pruebas en la última hora. Vuelve a intentarlo más tarde.` }
  }

  const { data: taller } = await client.from('talleres').select('nombre').eq('id', input.tallerId).maybeSingle()
  const tallerNombre = typeof taller?.nombre === 'string' && taller.nombre.trim() !== '' ? taller.nombre.trim() : 'Tu taller'
  const clase =
    tipo === 'recordatorio_clase' && input.clase && Number.isInteger(input.clase.numero) && typeof input.clase.tema === 'string'
      ? { numero: input.clase.numero, tema: input.clase.tema.slice(0, TEXTO_CLASE_MAX) }
      : null

  const correo = correoPruebaAviso({
    tipo,
    asunto: input.asunto,
    mensaje: input.mensaje,
    datos: datosEjemplo(tipo, tallerNombre, { clase }),
    tallerNombre,
    urlBase: urlBase(),
  })

  try {
    const { sendEmail } = await import('@/lib/email/send')
    const resultado = await sendEmail({ to: email, subject: correo.subject, template: correo.template })
    if (!resultado.success) return { ok: false, mensaje: 'No se pudo enviar la prueba. Inténtalo de nuevo.' }
  } catch {
    return { ok: false, mensaje: 'No se pudo enviar la prueba. Inténtalo de nuevo.' }
  }
  return { ok: true, mensaje: `Te enviamos la prueba a ${email}.` }
}
