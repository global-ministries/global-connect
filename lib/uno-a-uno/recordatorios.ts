/**
 * The 1:1 reminder job (odd/tasks/uno-a-uno.md, T5): queue tomorrow's 1:1s
 * (S5.1) and drain the queue in small batches (S5.3), so many reminders never
 * go out at once. The queue itself lives in the database
 * (20261024220000_uno_a_uno_recordatorios.sql); these functions only call its
 * service_role RPCs, so they need the admin client.
 */

import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ASUNTO_RECORDATORIO_UNO_A_UNO,
  RecordatorioUnoAUnoEmail,
} from '@/emails/recordatorio-uno-a-uno'
import { sendEmail } from '@/lib/email/send'
import type { Database } from '@/lib/supabase/database.types'

type ClienteAdmin = SupabaseClient<Database>
type FilaReclamada = Database['public']['Functions']['uno_a_uno_recordatorios_reclamar']['Returns'][number]

const SITIO_POR_DEFECTO = 'https://connect.yosoyglobal.org'
// Resend accepts 2 requests per second; 600 ms between sends stays under it.
const PAUSA_ENTRE_ENVIOS_MS = 600
const TANDA_POR_DEFECTO = 25

export interface ResultadoEncolar {
  encolados: number
}

export interface ResultadoEnvio {
  reclamados: number
  enviados: number
  fallidos: number
}

export interface OpcionesEnvio {
  limite?: number
  pausaMs?: number
  enviar?: typeof sendEmail
  esperar?: (ms: number) => Promise<void>
}

/** Queues a reminder per person for every agendado 1:1 of tomorrow in Caracas. */
export async function encolarRecordatorios(client: ClienteAdmin, ahora?: Date): Promise<ResultadoEncolar> {
  const args = ahora ? { p_ahora: ahora.toISOString() } : {}
  const { data, error } = await client.rpc('uno_a_uno_recordatorios_encolar', args)
  if (error) throw new Error(`No se pudieron encolar los recordatorios: ${error.message}`)
  return { encolados: data ?? 0 }
}

/**
 * Claims one batch and sends it one email at a time, pausing between sends.
 * Every row is reported back, so a failed one is retried later by the queue;
 * one failure never stops the rest of the batch.
 */
export async function enviarRecordatorios(
  client: ClienteAdmin,
  {
    limite = TANDA_POR_DEFECTO,
    pausaMs = PAUSA_ENTRE_ENVIOS_MS,
    enviar = sendEmail,
    esperar = dormir,
  }: OpcionesEnvio = {},
): Promise<ResultadoEnvio> {
  const filas = await reclamar(client, limite)
  const urlMisUnoAUno = `${sitio()}/mis-uno-a-uno`
  let enviados = 0

  for (const [indice, fila] of filas.entries()) {
    if (indice > 0) await esperar(pausaMs)
    const error = await enviarUno(fila, urlMisUnoAUno, enviar)
    if (!error) enviados += 1
    await registrarResultado(client, fila.id, error)
  }

  return { reclamados: filas.length, enviados, fallidos: filas.length - enviados }
}

async function reclamar(client: ClienteAdmin, limite: number): Promise<FilaReclamada[]> {
  const { data, error } = await client.rpc('uno_a_uno_recordatorios_reclamar', { p_limite: limite })
  if (error) throw new Error(`No se pudieron tomar los recordatorios: ${error.message}`)
  return data ?? []
}

/** Sends one reminder; returns the error message, or null when it was sent. */
async function enviarUno(
  fila: FilaReclamada,
  urlMisUnoAUno: string,
  enviar: typeof sendEmail,
): Promise<string | null> {
  try {
    const resultado = await enviar({
      to: fila.email,
      subject: ASUNTO_RECORDATORIO_UNO_A_UNO,
      template: createElement(RecordatorioUnoAUnoEmail, {
        nombre: fila.nombre,
        conQuien: fila.con_quien as unknown as { nombre: string; apellido: string | null }[],
        fechaHora: fila.fecha_hora,
        lugar: fila.lugar,
        urlMisUnoAUno,
      }),
      idempotencyKey: `uno-a-uno-recordatorio/${fila.id}`,
    })
    return resultado.success ? null : (resultado.error ?? 'Error desconocido')
  } catch (error) {
    return error instanceof Error ? error.message : 'Error desconocido'
  }
}

async function registrarResultado(client: ClienteAdmin, id: string, error: string | null): Promise<void> {
  const args = error === null ? { p_id: id, p_ok: true } : { p_id: id, p_ok: false, p_error: error }
  const { error: fallo } = await client.rpc('uno_a_uno_recordatorios_resultado', args)
  // The row's lease expires and the queue retries it; the idempotency key keeps
  // a resend from reaching the person twice. Log the row id only, never the email.
  if (fallo) console.error('[uno-a-uno] No se pudo registrar el recordatorio', { id, error: fallo.message })
}

function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || SITIO_POR_DEFECTO).replace(/\/+$/, '')
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
