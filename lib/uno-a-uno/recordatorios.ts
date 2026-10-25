/**
 * The 1:1 reminder job (odd/tasks/uno-a-uno.md, T5 and T5.2): queue tomorrow's
 * 1:1s (S5.1) and send what is due as ONE Resend batch with one summary email
 * per person (S5.8, S5.9), within the daily cap (S5.11). The queue itself
 * lives in the database (20261024220000_uno_a_uno_recordatorios.sql,
 * 20261024240000_uno_a_uno_recordatorios_lote.sql); these functions only call
 * its service_role RPCs, so they need the admin client.
 */

import { createHash } from 'crypto'
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  asuntoRecordatorioUnoAUno,
  RecordatorioUnoAUnoEmail,
  type UnoAUnoRecordado,
} from '@/emails/recordatorio-uno-a-uno'
import { sendEmailBatch, type EmailDeLote, type SendEmailBatchResult } from '@/lib/email/send-batch'
import type { Database } from '@/lib/supabase/database.types'

type ClienteAdmin = SupabaseClient<Database>
type FilaReclamada = Database['public']['Functions']['uno_a_uno_recordatorios_reclamar']['Returns'][number]
type EnviarLote = (emails: EmailDeLote[], opciones: { idempotencyKey: string }) => Promise<SendEmailBatchResult>

const SITIO_POR_DEFECTO = 'https://connect.yosoyglobal.org'
// A Resend batch carries at most 100 emails.
const PERSONAS_POR_DEFECTO = 100
// Resend's free plan allows 100 emails per UTC day for the whole app; 40 stay
// free for password resets and invitations.
const TOPE_DIARIO_POR_DEFECTO = 60
const ERROR_DESCONOCIDO = 'Error desconocido'

export interface ResultadoEncolar {
  encolados: number
}

export interface ResultadoEnvio {
  /** Rows claimed from the queue. */
  reclamados: number
  /** People (emails) in the batch. */
  personas: number
  enviados: number
  fallidos: number
}

export interface OpcionesEnvio {
  personas?: number
  topeDiario?: number
  enviarLote?: EnviarLote
}

interface Persona {
  email: string
  nombre: string
  filas: FilaReclamada[]
}

/** Queues a reminder per person for every agendado 1:1 of tomorrow in Caracas. */
export async function encolarRecordatorios(client: ClienteAdmin, ahora?: Date): Promise<ResultadoEncolar> {
  const args = ahora ? { p_ahora: ahora.toISOString() } : {}
  const { data, error } = await client.rpc('uno_a_uno_recordatorios_encolar', args)
  if (error) throw new Error(`No se pudieron encolar los recordatorios: ${error.message}`)
  return { encolados: data ?? 0 }
}

/**
 * Claims every due row of up to `personas` people and sends each person ONE
 * email listing all their 1:1s, all in a single batch request. Every row is
 * reported back, so a failed one is retried later by the queue; one failure
 * never stops the rest.
 */
export async function enviarRecordatorios(
  client: ClienteAdmin,
  {
    personas: maxPersonas = PERSONAS_POR_DEFECTO,
    topeDiario = TOPE_DIARIO_POR_DEFECTO,
    enviarLote = sendEmailBatch,
  }: OpcionesEnvio = {},
): Promise<ResultadoEnvio> {
  const filas = await reclamar(client, maxPersonas, topeDiario)
  const personas = agruparPorPersona(filas)
  if (personas.length === 0) return { reclamados: 0, personas: 0, enviados: 0, fallidos: 0 }

  const errores = await enviar(personas, filas, enviarLote)
  for (const [indice, persona] of personas.entries()) {
    for (const fila of persona.filas) await registrarResultado(client, fila.id, errores[indice])
  }

  const fallidos = errores.filter((error) => error !== null).length
  return { reclamados: filas.length, personas: personas.length, enviados: personas.length - fallidos, fallidos }
}

async function reclamar(client: ClienteAdmin, personas: number, topeDiario: number): Promise<FilaReclamada[]> {
  const { data, error } = await client.rpc('uno_a_uno_recordatorios_reclamar', {
    p_personas: personas,
    p_tope_diario: topeDiario,
  })
  if (error) throw new Error(`No se pudieron tomar los recordatorios: ${error.message}`)
  return data ?? []
}

/** One person per email, in the order the rows came; the first row names them. */
function agruparPorPersona(filas: FilaReclamada[]): Persona[] {
  const porEmail = new Map<string, Persona>()
  for (const fila of filas) {
    const persona = porEmail.get(fila.email)
    if (persona) persona.filas.push(fila)
    else porEmail.set(fila.email, { email: fila.email, nombre: fila.nombre, filas: [fila] })
  }
  return [...porEmail.values()]
}

/** Sends the batch; returns each person's error message, or null when it went out. */
async function enviar(personas: Persona[], filas: FilaReclamada[], enviarLote: EnviarLote): Promise<(string | null)[]> {
  const urlMisUnoAUno = `${sitio()}/mis-uno-a-uno`
  try {
    const resultado = await enviarLote(
      personas.map((persona) => emailDe(persona, urlMisUnoAUno)),
      { idempotencyKey: claveDeLote(filas) },
    )
    if (!resultado.success) return personas.map(() => resultado.error || ERROR_DESCONOCIDO)
    const errorPorIndice = new Map(resultado.errors.map(({ index, message }) => [index, message]))
    return personas.map((_persona, indice) => errorPorIndice.get(indice) ?? null)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : ERROR_DESCONOCIDO
    return personas.map(() => mensaje)
  }
}

function emailDe(persona: Persona, urlMisUnoAUno: string): EmailDeLote {
  const unoAUnos = unoAUnosDe(persona.filas)
  return {
    to: persona.email,
    subject: asuntoRecordatorioUnoAUno(unoAUnos.length),
    template: createElement(RecordatorioUnoAUnoEmail, { nombre: persona.nombre, unoAUnos, urlMisUnoAUno }),
  }
}

/** Two rows of one email can point at the same 1:1 (e.g. a couple sharing an address): list it once. */
function unoAUnosDe(filas: FilaReclamada[]): UnoAUnoRecordado[] {
  const porUnoAUno = new Map<string, UnoAUnoRecordado>()
  for (const fila of filas) {
    if (porUnoAUno.has(fila.uno_a_uno_id)) continue
    porUnoAUno.set(fila.uno_a_uno_id, {
      conQuien: fila.con_quien as unknown as UnoAUnoRecordado['conQuien'],
      fechaHora: fila.fecha_hora,
      lugar: fila.lugar,
    })
  }
  return [...porUnoAUno.values()]
}

/**
 * The same rows always give the same key, so a retried request never reaches
 * anyone twice; a different set of rows is a new batch.
 */
function claveDeLote(filas: FilaReclamada[]): string {
  const ids = filas.map((fila) => fila.id).sort()
  return `uno-a-uno-recordatorios/${createHash('sha256').update(ids.join('\n')).digest('hex')}`
}

async function registrarResultado(client: ClienteAdmin, id: string, error: string | null): Promise<void> {
  const args = error === null ? { p_id: id, p_ok: true } : { p_id: id, p_ok: false, p_error: error }
  try {
    const { error: fallo } = await client.rpc('uno_a_uno_recordatorios_resultado', args)
    if (fallo) logFalloResultado(id, fallo.message)
  } catch (fallo) {
    logFalloResultado(id, fallo instanceof Error ? fallo.message : String(fallo))
  }
}

// The row's lease expires and the queue retries it; the idempotency key keeps
// a resend from reaching the person twice. Log the row id only, never the email.
function logFalloResultado(id: string, error: string): void {
  console.error('[uno-a-uno] No se pudo registrar el recordatorio', { id, error })
}

function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || SITIO_POR_DEFECTO).replace(/\/+$/, '')
}
