/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md C2).
 *
 * Sends the access email for every invitation the database marks as due
 * (`invitacion_acceso_pendientes_de_envio`, service_role only). Each send
 * mints a fresh 32-byte token, stores only its sha256 through
 * `invitacion_acceso_preparar_envio` and records the outcome with
 * `invitacion_acceso_registrar_envio`.
 *
 * Server-only (admin client). Never throws: enrollment and approval call it
 * after their own write committed, so a mail failure must not undo them;
 * the invitation stays pending and the coordinator can resend it.
 * Logs carry the invitation id only, never the token or the address.
 */

import { createHash, randomBytes } from 'node:crypto'
import { createElement, type ReactElement } from 'react'

import { AccesoTallerConyugeEmail } from '@/emails/acceso-taller-conyuge'

export const VIGENCIA_INVITACION_MS = 7 * 24 * 60 * 60 * 1000

interface RespuestaRpc {
  readonly data: unknown
  readonly error: { readonly message?: string } | null
}

/** The slice of the admin client this module uses. */
export interface ClienteRpc {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
}

export interface CorreoSaliente {
  readonly to: string
  readonly subject: string
  readonly template: ReactElement
  readonly idempotencyKey?: string
}

export interface DependenciasEnvio {
  readonly admin: ClienteRpc
  readonly enviarCorreo: (correo: CorreoSaliente) => Promise<{ success: boolean; error?: string }>
  readonly ahora?: () => Date
  readonly urlBase?: string
}

export type ResultadoEnvio = 'enviada' | 'omitida' | 'fallida'

export function generarTokenInvitacion(): string {
  return randomBytes(32).toString('base64url')
}

export function hashTokenInvitacion(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

interface Preparada {
  readonly email: string
  readonly nombreInvitado: string
  readonly nombreInvitante: string
  readonly tallerNombre: string
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function parsePreparada(raw: unknown): Preparada | null {
  if (typeof raw !== 'object' || raw === null || (raw as { ok?: unknown }).ok !== true) return null
  const fila = raw as Record<string, unknown>
  const email = texto(fila.email)
  if (email === null) return null
  return {
    email,
    nombreInvitado: texto(fila.nombre_invitado) ?? '',
    nombreInvitante: texto(fila.nombre_invitante) ?? 'Tu pareja',
    tallerNombre: texto(fila.taller_nombre) ?? 'un taller',
  }
}

function mensajeError(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown'
  return mensaje.slice(0, 300)
}

function urlBasePorDefecto(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org').replace(/\/+$/, '')
}

async function dependenciasPorDefecto(): Promise<DependenciasEnvio> {
  const [{ createSupabaseAdminClient }, { sendEmail }] = await Promise.all([
    import('@/lib/supabase/admin'),
    import('@/lib/email/send'),
  ])
  return { admin: createSupabaseAdminClient() as unknown as ClienteRpc, enviarCorreo: sendEmail }
}

async function registrar(admin: ClienteRpc, id: string, ok: boolean, error: string | null): Promise<void> {
  const { error: fallo } = await admin.rpc('invitacion_acceso_registrar_envio', { p_id: id, p_ok: ok, p_error: error })
  if (fallo) console.error('[invitacion-acceso] registrar_envio failed', { invitacionId: id })
}

/** Prepares, sends and records one invitation. */
export async function enviarInvitacionAcceso(id: string, deps?: DependenciasEnvio): Promise<ResultadoEnvio> {
  try {
    const d = deps ?? (await dependenciasPorDefecto())
    const ahora = d.ahora ? d.ahora() : new Date()
    const token = generarTokenInvitacion()

    const { data, error } = await d.admin.rpc('invitacion_acceso_preparar_envio', {
      p_invitacion_id: id,
      p_token_hash: hashTokenInvitacion(token),
      p_expira_en: new Date(ahora.getTime() + VIGENCIA_INVITACION_MS).toISOString(),
    })
    if (error) {
      console.error('[invitacion-acceso] preparar_envio failed', { invitacionId: id })
      return 'fallida'
    }
    const preparada = parsePreparada(data)
    // Refused (already used, cancelled, …): nothing to send or record.
    if (preparada === null) return 'omitida'

    const urlActivar = `${d.urlBase ?? urlBasePorDefecto()}/activar/${token}`
    let envio: { success: boolean; error?: string }
    try {
      envio = await d.enviarCorreo({
        to: preparada.email,
        subject: `Tu acceso al taller ${preparada.tallerNombre}`,
        template: createElement(AccesoTallerConyugeEmail, { ...preparada, urlActivar }),
        idempotencyKey: `invitacion-acceso/${id}/${hashTokenInvitacion(token).slice(0, 16)}`,
      })
    } catch (e) {
      envio = { success: false, error: mensajeError(e) }
    }

    if (!envio.success) {
      console.error('[invitacion-acceso] send failed', { invitacionId: id })
      await registrar(d.admin, id, false, mensajeError(envio.error ?? 'unknown'))
      return 'fallida'
    }
    await registrar(d.admin, id, true, null)
    return 'enviada'
  } catch (e) {
    console.error('[invitacion-acceso] unexpected failure', { invitacionId: id, error: mensajeError(e) })
    return 'fallida'
  }
}

export interface ResumenEnvio {
  readonly enviadas: number
  readonly fallidas: number
  readonly omitidas: number
}

/** Sends every invitation the database marks as due. Never throws. */
export async function enviarInvitacionesPendientes(deps?: DependenciasEnvio): Promise<ResumenEnvio> {
  const resumen = { enviadas: 0, fallidas: 0, omitidas: 0 }
  try {
    const d = deps ?? (await dependenciasPorDefecto())
    const { data, error } = await d.admin.rpc('invitacion_acceso_pendientes_de_envio')
    if (error || !Array.isArray(data)) {
      if (error) console.error('[invitacion-acceso] pendientes_de_envio failed')
      return resumen
    }
    for (const fila of data as unknown[]) {
      const id = texto((fila as { id?: unknown } | null)?.id)
      if (id === null) continue
      const resultado = await enviarInvitacionAcceso(id, d)
      if (resultado === 'enviada') resumen.enviadas += 1
      else if (resultado === 'fallida') resumen.fallidas += 1
      else resumen.omitidas += 1
    }
  } catch (e) {
    console.error('[invitacion-acceso] pending run failed', { error: mensajeError(e) })
  }
  return resumen
}
