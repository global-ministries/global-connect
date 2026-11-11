'use server'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15 S16) — server actions
 * for the minimum of inscritos: suspend and move the date, open anyway,
 * confirm by phone (edición page) and the member's answer (Mi Recorrido).
 * The taller's «Mínimo de inscritos para abrir» saves with the rest of the
 * configuration (updateTallerConfiguracion, T9).
 *
 * Same thin gate as app/(auth)/talleres/[taller]/[edicion]/actions.ts: flag
 * + session. Every rule and every permission lives in the RPCs of
 * 20261110200000_talleres_minimo_suspension.sql (S16: only the director or
 * the taller's coordinador may open anyway); errors are translated by
 * traducirErrorTalleres so no RAISE text reaches the browser.
 *
 * After a suspension the date-change email goes out here, best effort, to
 * the recipients the RPC returned (the in-app notice is already stored by
 * the RPC). A failed email never undoes the suspension.
 */

import { randomUUID } from 'node:crypto'
import { createElement } from 'react'
import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { sendEmailBatch } from '@/lib/email/send-batch'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'
import { rutaEdicion, rutaTaller } from '@/lib/platform/talleres/rutas'
import { fechaLarga, MENSAJE_MAX, MOTIVO_MAX } from '@/lib/platform/talleres/minimo-suspension'
import { CorreoCambioFecha } from '@/components/talleres/minimo/correo-cambio-fecha'

export type MinimoActionResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: string; readonly message: string }

const RUTA_MI_RECORRIDO = '/talleres/mi-recorrido'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const LOTE_CORREOS = 100

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, matches this feature's other action files
async function gate(): Promise<{ ok: true; supabase: any } | { ok: false; result: MinimoActionResult<never> }> {
  if (!isTalleresEnabled()) {
    return { ok: false, result: { ok: false, error: 'not-found', message: 'El módulo de talleres está deshabilitado.' } }
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return { ok: false, result: { ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.' } }
  }

  return { ok: true, supabase }
}

function fallo(error: unknown, mensajePorDefecto: string): { readonly ok: false; readonly error: string; readonly message: string } {
  const traducido = traducirErrorTalleres(error as { message?: string; code?: string } | null, mensajePorDefecto)
  return { ok: false, error: traducido.error, message: traducido.message }
}

function invalido(message: string): { readonly ok: false; readonly error: string; readonly message: string } {
  return { ok: false, error: 'invalid-input', message }
}

function urlBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org').replace(/\/+$/, '')
}

// ─── Suspender y mover a nueva fecha ─────────────────────────────────────

export interface SuspenderEdicionInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly nuevaFechaInicio: string
  /** null keeps the taller's own cierre offset. */
  readonly nuevoCierre: string | null
  readonly motivo: string | null
  readonly mensaje: string | null
}

export interface SuspensionResultado {
  readonly fechaInicio: string
  readonly cierreInscripcion: string
  readonly porConfirmar: number
  readonly correosEnviados: number
  readonly correosFallidos: number
}

interface DestinatarioCorreo {
  readonly persona_id: string
  readonly nombre: string | null
  readonly email: string
  readonly confirmar: boolean
}

export async function suspenderEdicion(
  input: SuspenderEdicionInput,
): Promise<MinimoActionResult<{ suspension: SuspensionResultado }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!ISO_DATE.test(input.nuevaFechaInicio)) return invalido('Elige la nueva fecha de la primera clase.')
  if (input.nuevoCierre !== null && !ISO_DATE.test(input.nuevoCierre)) {
    return invalido('La fecha de cierre de inscripción no es válida.')
  }
  const motivo = input.motivo?.trim() || null
  const mensaje = input.mensaje?.trim() || null
  if (motivo && motivo.length > MOTIVO_MAX) return invalido(`El motivo no puede superar los ${MOTIVO_MAX} caracteres.`)
  if (mensaje && mensaje.length > MENSAJE_MAX) return invalido(`El mensaje no puede superar los ${MENSAJE_MAX} caracteres.`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client.rpc('talleres_suspender_edicion', {
    p_edicion_id: input.edicionId,
    p_nueva_fecha_inicio: input.nuevaFechaInicio,
    p_nuevo_cierre: input.nuevoCierre,
    p_motivo: motivo,
    p_mensaje: mensaje,
  })
  if (error || !data) return fallo(error, 'No se pudo suspender la edición.')

  const resultado = data as {
    taller_nombre?: string | null
    fecha_inicio: string
    cierre_inscripcion: string
    por_confirmar: number
    correos?: DestinatarioCorreo[]
  }

  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  revalidatePath(rutaTaller(input.tallerSlug))
  revalidatePath(RUTA_MI_RECORRIDO)

  const envio = await enviarCorreosCambioFecha({
    edicionId: input.edicionId,
    suspensionId: randomUUID(),
    // From the DB, never from the browser.
    tallerNombre: resultado.taller_nombre || 'Tu taller',
    fechaInicio: resultado.fecha_inicio,
    limite: resultado.cierre_inscripcion,
    mensaje,
    destinatarios: Array.isArray(resultado.correos) ? resultado.correos : [],
  })

  return {
    ok: true,
    suspension: {
      fechaInicio: resultado.fecha_inicio,
      cierreInscripcion: resultado.cierre_inscripcion,
      porConfirmar: resultado.por_confirmar,
      correosEnviados: envio.enviados,
      correosFallidos: envio.fallidos,
    },
  }
}

async function enviarCorreosCambioFecha(d: {
  readonly edicionId: string
  /** One per suspension: a re-suspension to the same date is a new email. */
  readonly suspensionId: string
  readonly tallerNombre: string
  readonly fechaInicio: string
  readonly limite: string
  readonly mensaje: string | null
  readonly destinatarios: readonly DestinatarioCorreo[]
}): Promise<{ enviados: number; fallidos: number }> {
  const validos = d.destinatarios.filter((x) => typeof x.email === 'string' && x.email.includes('@'))
  const url = `${urlBase()}${RUTA_MI_RECORRIDO}`
  const asunto = `${d.tallerNombre} cambió de fecha: ahora empieza el ${fechaLarga(d.fechaInicio)}`
  let enviados = 0
  let fallidos = d.destinatarios.length - validos.length

  for (let i = 0; i < validos.length; i += LOTE_CORREOS) {
    const lote = validos.slice(i, i + LOTE_CORREOS)
    try {
      const respuesta = await sendEmailBatch(
        lote.map((x) => ({
          to: x.email,
          subject: asunto,
          template: createElement(CorreoCambioFecha, {
            nombre: (x.nombre ?? '').trim().split(/\s+/)[0] ?? '',
            tallerNombre: d.tallerNombre,
            fechaInicio: fechaLarga(d.fechaInicio),
            limite: x.confirmar ? fechaLarga(d.limite) : null,
            mensaje: d.mensaje,
            url,
          }),
        })),
        // Unique per suspension and batch: a second suspension to the same
        // start within 24h must not be dropped as a repeat.
        { idempotencyKey: `taller-cambio-fecha:${d.edicionId}:${d.fechaInicio}:${d.limite}:${d.suspensionId}:${i / LOTE_CORREOS}` },
      )
      if (respuesta.success) {
        enviados += lote.length - respuesta.errors.length
        fallidos += respuesta.errors.length
      } else {
        fallidos += lote.length
      }
    } catch {
      // Logged by the sender without addresses; the notice is already in the app.
      fallidos += lote.length
    }
  }

  return { enviados, fallidos }
}

// ─── Abrir igual (S16) ───────────────────────────────────────────────────

export interface AbrirIgualInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly motivo: string | null
}

export async function abrirEdicionIgual(input: AbrirIgualInput): Promise<MinimoActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const motivo = input.motivo?.trim() || null
  if (motivo && motivo.length > MOTIVO_MAX) return invalido(`El motivo no puede superar los ${MOTIVO_MAX} caracteres.`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.rpc('talleres_abrir_igual', { p_edicion_id: input.edicionId, p_motivo: motivo })
  if (error) return fallo(error, 'No se pudo abrir la edición.')

  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  return { ok: true }
}

// ─── Confirmado por teléfono (S15) ───────────────────────────────────────

export interface ConfirmarPorTelefonoInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly inscripcionId: string
}

export async function confirmarPorTelefono(input: ConfirmarPorTelefonoInput): Promise<MinimoActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.rpc('talleres_confirmar_por_telefono', { p_inscripcion_id: input.inscripcionId })
  if (error) return fallo(error, 'No se pudo marcar la confirmación.')

  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  return { ok: true }
}

// ─── Respuesta del miembro ───────────────────────────────────────────────

export interface ResponderCambioFechaInput {
  readonly inscripcionId: string
  readonly respuesta: 'mantener' | 'no_puedo'
  readonly motivo?: string | null
}

export async function responderCambioFecha(
  input: ResponderCambioFechaInput,
): Promise<MinimoActionResult<{ confirmacion: 'confirmada' | 'no_puede' }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (input.respuesta !== 'mantener' && input.respuesta !== 'no_puedo') return invalido('Elige una respuesta.')
  const motivo = input.motivo?.trim() || null
  if (motivo && motivo.length > MOTIVO_MAX) return invalido(`El motivo no puede superar los ${MOTIVO_MAX} caracteres.`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.rpc('talleres_confirmar_cambio_fecha', {
    p_inscripcion_id: input.inscripcionId,
    p_respuesta: input.respuesta,
    p_motivo: motivo,
  })
  if (error) return fallo(error, 'No se pudo guardar tu respuesta.')

  revalidatePath(RUTA_MI_RECORRIDO)
  return { ok: true, confirmacion: input.respuesta === 'mantener' ? 'confirmada' : 'no_puede' }
}
