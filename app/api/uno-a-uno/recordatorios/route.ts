import { timingSafeEqual } from 'crypto'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { encolarRecordatorios, enviarRecordatorios } from '@/lib/uno-a-uno/recordatorios'

/**
 * The 1:1 reminder job (odd/tasks/uno-a-uno.md, T5 and T5.2). pg_cron calls it
 * with the Bearer secret at 7:00, 7:30, 8:00 and 8:30 Caracas: the default
 * (`accion=procesar`) queues tomorrow's 1:1s and then sends one batch (S5.10,
 * S5.13). `accion=encolar` and `accion=enviar` do one step each, for manual
 * use. Responses carry counts only.
 */

export const runtime = 'nodejs'
// Rendering and sending a batch of up to 100 emails can outlast the default timeout.
export const maxDuration = 60

const ACCIONES = ['procesar', 'encolar', 'enviar'] as const
type Accion = (typeof ACCIONES)[number]

export async function POST(request: Request): Promise<Response> {
  return ejecutar(request)
}

export async function GET(request: Request): Promise<Response> {
  return ejecutar(request)
}

async function ejecutar(request: Request): Promise<Response> {
  const secret = process.env.UNO_A_UNO_RECORDATORIOS_SECRET
  if (!secret) return Response.json({ error: 'Uno a uno reminders are not configured' }, { status: 503 })

  if (!verifyBearerToken(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'Unauthorized uno a uno reminders request' }, { status: 401 })
  }

  const accion = new URL(request.url).searchParams.get('accion') ?? 'procesar'
  if (!esAccion(accion)) {
    return Response.json({ error: 'Unknown accion' }, { status: 400 })
  }

  try {
    return Response.json(await correr(accion), { status: 202 })
  } catch (error) {
    console.error('[uno-a-uno] Recordatorios fallaron', {
      accion,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Uno a uno reminders failed' }, { status: 500 })
  }
}

function esAccion(valor: string): valor is Accion {
  return (ACCIONES as readonly string[]).includes(valor)
}

async function correr(accion: Accion) {
  const client = createSupabaseAdminClient()
  if (accion === 'encolar') return encolarRecordatorios(client)
  if (accion === 'enviar') return enviarRecordatorios(client)
  const encolado = await encolarRecordatorios(client)
  return { ...encolado, ...(await enviarRecordatorios(client)) }
}

function verifyBearerToken(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false

  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
