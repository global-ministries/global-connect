import { timingSafeEqual } from 'crypto'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { drainSupportEventOutbox } from '@/lib/support/outbox'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return drainOutbox(request)
}

export async function GET(request: Request): Promise<Response> {
  return drainOutbox(request)
}

async function drainOutbox(request: Request): Promise<Response> {
  const secret = process.env.SUPPORT_OUTBOX_DRAIN_SECRET
  if (!secret) return Response.json({ error: 'Support outbox drain is not configured' }, { status: 503 })

  if (!verifyBearerToken(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'Unauthorized support outbox drain request' }, { status: 401 })
  }

  const result = await drainSupportEventOutbox(createSupabaseAdminClient() as never)
  if (!result.success) return Response.json({ error: 'Support outbox drain failed' }, { status: 500 })

  return Response.json({ claimed: result.claimed, dispatched: result.dispatched, failed: result.failed }, { status: 202 })
}

function verifyBearerToken(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false

  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
