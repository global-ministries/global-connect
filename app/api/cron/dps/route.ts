import { timingSafeEqual } from 'crypto'

import { ejecutarJobDps, type ClienteAdminDps } from '@/lib/platform/dps/avisos-correo'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * The daily DPS job (odd/tasks/dps-asistencia-pco.md T16b, T16c; S14.1,
 * S14.3, S14.4): Vercel Cron calls it once a day at 14:00 UTC, 10:00 in
 * Caracas (vercel.json; the reminder's fixed hour), with
 * `Authorization: Bearer <CRON_SECRET>`, exactly like app/api/cron/talleres:
 * 503 while CRON_SECRET is unset, 401 for any other header. The steps of
 * lib/platform/dps/avisos-correo.ts ejecutarJobDps: queue today's reminders
 * (T16c), then drain the e-mail outbox (those reminders and whatever the
 * immediate dispatch after «Enviar avisos» or «No puedo» left behind). 202
 * with counts when every step ran, 500 with the same counts when one
 * failed. Never personal data.
 */

export const runtime = 'nodejs'
// Sending up to 50 e-mails one by one (with a pause between them) can outlast the default timeout.
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  return ejecutar(request)
}

export async function POST(request: Request): Promise<Response> {
  return ejecutar(request)
}

async function ejecutar(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'DPS cron is not configured' }, { status: 503 })

  if (!verifyBearerToken(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'Unauthorized DPS cron request' }, { status: 401 })
  }

  try {
    const resultado = await ejecutarJobDps(createSupabaseAdminClient() as unknown as ClienteAdminDps)
    return Response.json(resultado, { status: resultado.fallos.length > 0 ? 500 : 202 })
  } catch (error) {
    console.error('[dps-cron] Falló', { error: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'DPS cron failed' }, { status: 500 })
  }
}

function verifyBearerToken(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false

  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
