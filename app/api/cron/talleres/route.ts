import { timingSafeEqual } from 'crypto'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { ejecutarJobTalleres } from '@/lib/platform/talleres/avisos-cron'
import type { ClienteAdminAvisos } from '@/lib/platform/talleres/avisos-envio'

/**
 * The daily talleres job (odd/tasks/talleres-reserva-publica.md T7): Vercel
 * Cron calls it once a day (vercel.json) with `Authorization: Bearer
 * <CRON_SECRET>`; the route answers 503 while CRON_SECRET is unset and 401
 * for any other header. It runs the confirmation expiry, tomorrow's class
 * reminders, the email outbox and the cleanup (lib/platform/talleres/
 * avisos-cron.ts). 202 with counts when every step ran, 500 with the same
 * counts when one failed. Never personal data.
 */

export const runtime = 'nodejs'
// Rendering and sending up to 50 emails one by one can outlast the default timeout.
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  return ejecutar(request)
}

export async function POST(request: Request): Promise<Response> {
  return ejecutar(request)
}

async function ejecutar(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'Talleres cron is not configured' }, { status: 503 })

  if (!verifyBearerToken(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'Unauthorized talleres cron request' }, { status: 401 })
  }

  try {
    const resultado = await ejecutarJobTalleres(createSupabaseAdminClient() as unknown as ClienteAdminAvisos)
    return Response.json(resultado, { status: resultado.fallos.length > 0 ? 500 : 202 })
  } catch (error) {
    console.error('[talleres-cron] Falló', { error: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'Talleres cron failed' }, { status: 500 })
  }
}

function verifyBearerToken(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false

  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
