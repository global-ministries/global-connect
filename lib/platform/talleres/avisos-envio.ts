/**
 * The email side of the talleres notices (odd/tasks/talleres-reserva-publica.md
 * T7, S6 S13). The database writes each notice once, in the same transaction
 * as the event, as an in-app row plus a row of the outbox
 * `taller_avisos_envios` (20261110230000_talleres_avisos.sql). This module
 * drains that outbox: it leases due rows (`talleres_avisos_envios_reclamar`,
 * 10-minute lease, within a daily cap), sends one email per row through
 * Resend with the idempotency key `talleres-aviso/<row id>` (a retried row
 * never reaches the person twice), and records each result
 * (`talleres_avisos_envios_resultado`: enviado, or retried with a growing
 * wait, fallido after 5 attempts).
 *
 * Callers: the daily route app/api/cron/talleres and, right after a
 * coordinator approves or rejects, `despacharAvisosTalleres()` so the email
 * does not wait for the next day. Server-only (admin client). Logs carry row
 * ids only, never an address.
 */
import { createElement, type ReactElement } from 'react'

import { TallerAvisoEmail } from '@/emails/taller-aviso'

interface RespuestaRpc {
  readonly data: unknown
  readonly error: { readonly message?: string } | null
}

/** The slice of the admin client this module uses. */
export interface ClienteAdminAvisos {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
}

export interface CorreoAviso {
  readonly to: string
  readonly subject: string
  readonly template: ReactElement
  readonly idempotencyKey: string
}

export type EnviarCorreoAviso = (correo: CorreoAviso) => Promise<{ success: boolean; error?: string }>

export interface OpcionesEnvioAvisos {
  /** Rows per run (1–100). */
  readonly limite?: number
  /** Sent emails per UTC day for this outbox (Resend's quota day). */
  readonly topeDiario?: number
  readonly enviarCorreo?: EnviarCorreoAviso
  readonly urlBase?: string
}

export interface ResultadoEnvioAvisos {
  readonly reclamados: number
  readonly enviados: number
  readonly fallidos: number
}

export interface EnvioAviso {
  readonly id: string
  readonly email: string
  readonly nombre: string
  readonly asunto: string
  readonly titulo: string
  readonly cuerpo: string
  readonly url: string | null
  readonly cta: string | null
  readonly taller: string | null
  readonly filas: readonly (readonly [string, string])[]
}

const LIMITE_POR_DEFECTO = 50
// Resend's free plan allows 100 emails per UTC day for the whole app; the
// 1:1 reminders take up to 60. Override with TALLERES_AVISOS_TOPE_DIARIO.
const TOPE_DIARIO_POR_DEFECTO = 40
const ERROR_DESCONOCIDO = 'Error desconocido'

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function filasDe(valor: unknown): (readonly [string, string])[] {
  if (!Array.isArray(valor)) return []
  const filas: (readonly [string, string])[] = []
  for (const fila of valor) {
    if (!Array.isArray(fila)) continue
    const etiqueta = texto(fila[0])
    const dato = texto(fila[1])
    if (etiqueta && dato) filas.push([etiqueta, dato])
  }
  return filas
}

/** Parses the leased rows; a row without id or email is dropped. */
export function parseEnvios(data: unknown): EnvioAviso[] {
  if (!Array.isArray(data)) return []
  const envios: EnvioAviso[] = []
  for (const bruto of data) {
    if (typeof bruto !== 'object' || bruto === null) continue
    const fila = bruto as Record<string, unknown>
    const id = texto(fila.id)
    const email = texto(fila.email)
    if (!id || !email) continue
    const datos = typeof fila.datos === 'object' && fila.datos !== null ? (fila.datos as Record<string, unknown>) : {}
    envios.push({
      id,
      email,
      nombre: texto(fila.nombre) ?? '',
      asunto: texto(fila.asunto) ?? texto(datos.titulo) ?? 'Aviso de tu taller',
      titulo: texto(datos.titulo) ?? 'Aviso de tu taller',
      cuerpo: texto(datos.cuerpo) ?? '',
      url: texto(datos.url),
      cta: texto(datos.cta),
      taller: texto(datos.taller),
      filas: filasDe(datos.filas),
    })
  }
  return envios
}

/** The Resend idempotency key of one outbox row. */
export function claveIdempotencia(id: string): string {
  return `talleres-aviso/${id}`
}

/** An in-app path becomes an absolute link of the app; anything else is dropped. */
export function urlAbsoluta(ruta: string | null, base: string): string | null {
  if (!ruta || !ruta.startsWith('/') || ruta.startsWith('//')) return null
  return `${base.replace(/\/+$/, '')}${ruta}`
}

export function correoDe(envio: EnvioAviso, base: string): CorreoAviso {
  return {
    to: envio.email,
    subject: envio.asunto,
    idempotencyKey: claveIdempotencia(envio.id),
    template: createElement(TallerAvisoEmail, {
      nombre: envio.nombre,
      titulo: envio.titulo,
      cuerpo: envio.cuerpo,
      filas: envio.filas,
      url: urlAbsoluta(envio.url, base),
      cta: envio.cta,
      tallerNombre: envio.taller,
    }),
  }
}

function urlBasePorDefecto(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org').replace(/\/+$/, '')
}

function topeDiarioPorDefecto(): number {
  const valor = Number.parseInt(process.env.TALLERES_AVISOS_TOPE_DIARIO ?? '', 10)
  return Number.isInteger(valor) && valor >= 0 ? valor : TOPE_DIARIO_POR_DEFECTO
}

async function enviarConResend(correo: CorreoAviso) {
  const { sendEmail } = await import('@/lib/email/send')
  return sendEmail(correo)
}

async function registrar(client: ClienteAdminAvisos, id: string, error: string | null): Promise<void> {
  const args = error === null ? { p_id: id, p_ok: true } : { p_id: id, p_ok: false, p_error: error.slice(0, 500) }
  try {
    const { error: fallo } = await client.rpc('talleres_avisos_envios_resultado', args)
    if (fallo) console.error('[talleres-avisos] No se pudo registrar el envío', { id })
  } catch {
    // The lease expires and the row is retried; the idempotency key keeps
    // the person from getting it twice.
    console.error('[talleres-avisos] No se pudo registrar el envío', { id })
  }
}

/**
 * Leases due rows and sends them one by one; one failure never stops the
 * rest. Throws only when the lease itself fails.
 */
export async function enviarAvisosPendientes(
  client: ClienteAdminAvisos,
  opciones: OpcionesEnvioAvisos = {},
): Promise<ResultadoEnvioAvisos> {
  const enviar = opciones.enviarCorreo ?? enviarConResend
  const base = opciones.urlBase ?? urlBasePorDefecto()
  const { data, error } = await client.rpc('talleres_avisos_envios_reclamar', {
    p_limite: opciones.limite ?? LIMITE_POR_DEFECTO,
    p_tope_diario: opciones.topeDiario ?? topeDiarioPorDefecto(),
  })
  if (error) throw new Error(`No se pudieron tomar los avisos: ${error.message ?? ERROR_DESCONOCIDO}`)

  const envios = parseEnvios(data)
  let enviados = 0
  for (const envio of envios) {
    let fallo: string | null
    try {
      const resultado = await enviar(correoDe(envio, base))
      fallo = resultado.success ? null : resultado.error || ERROR_DESCONOCIDO
    } catch (causa) {
      fallo = causa instanceof Error ? causa.message : ERROR_DESCONOCIDO
    }
    if (fallo === null) enviados += 1
    await registrar(client, envio.id, fallo)
  }
  return { reclamados: envios.length, enviados, fallidos: envios.length - enviados }
}

/**
 * Best effort, right after an action that wrote notices (approve, reject):
 * sends what is due now. Never throws; whatever is left goes with the daily
 * run.
 */
export async function despacharAvisosTalleres(opciones: OpcionesEnvioAvisos = {}): Promise<void> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    await enviarAvisosPendientes(createSupabaseAdminClient() as unknown as ClienteAdminAvisos, { limite: 10, ...opciones })
  } catch (causa) {
    console.error('[talleres-avisos] Despacho inmediato falló', {
      error: causa instanceof Error ? causa.message : String(causa),
    })
  }
}
