import { timingSafeEqual } from 'crypto'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { encolarRecordatorios, enviarRecordatorios } from '@/lib/uno-a-uno/recordatorios'

/**
 * The 1:1 reminder job (odd/tasks/uno-a-uno.md, T5). pg_cron calls it with the
 * Bearer secret: `?accion=encolar` at 7:00 Caracas queues tomorrow's 1:1s, and
 * the default (`accion=enviar`) every 5 minutes drains one batch (S5.3, S5.7).
 * Responses carry counts only.
 */

export const runtime = 'nodejs'
// A batch of 25 with a 600 ms pause takes well over the default timeout.
export const maxDuration = 60

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

  const accion = new URL(request.url).searchParams.get('accion') ?? 'enviar'
  if (accion !== 'encolar' && accion !== 'enviar') {
    return Response.json({ error: 'Unknown accion' }, { status: 400 })
  }

  try {
    const client = createSupabaseAdminClient()
    const result = accion === 'encolar' ? await encolarRecordatorios(client) : await enviarRecordatorios(client)
    return Response.json(result, { status: 202 })
  } catch (error) {
    console.error('[uno-a-uno] Recordatorios fallaron', {
      accion,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Uno a uno reminders failed' }, { status: 500 })
  }
}

function verifyBearerToken(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false

  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
