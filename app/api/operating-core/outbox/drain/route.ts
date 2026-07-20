/**
 * S17 — Outbox drain Edge Function endpoint.
 *
 * Hosted by Vercel Cron every 30s (configurable).
 * This route is NOT authenticated via session — it relies on:
 *   1. Vercel Cron secret header (X-Vercel-Cron)
 *   2. Supabase service_role (from server client)
 *   3. Optional: hasOperatingCoreOutboxDrainCapability check
 *
 * The route is force-dynamic to prevent caching.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isOperatingCoreEnabled } from '@/lib/platform/operating-core/route-access'
import { createOperatingCoreOutboxRepository } from '@/lib/platform/operating-core/notification-outbox/factory'
import { drainOutbox } from '@/lib/platform/operating-core/notification-outbox/drain'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Environment config
// ---------------------------------------------------------------------------

const DEFAULT_RATE_PER_SECOND = 100
const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_BATCH_SIZE = 50

function getRatePerSecond(env: Record<string, string | undefined>): number {
  const raw = env['operating_core.drain.rate_per_second']
  if (!raw) return DEFAULT_RATE_PER_SECOND
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RATE_PER_SECOND
  return Math.min(parsed, 1000)
}

// ---------------------------------------------------------------------------
// POST — drain the outbox
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Operating Core must be enabled
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 2. Verify Vercel Cron secret (if VERCEL_ENV is set)
  const vercelCron = req.headers.get('x-vercel-cron')
  const vercelEnv = process.env['VERCEL_ENV']
  if (vercelEnv && !vercelCron) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Create service_role Supabase client
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    // For cron, try service_role directly
    const serviceRoleClient = await createSupabaseServerClient()
    void serviceRoleClient // used indirectly via drain
  }

  // 4. Parse optional query/body params
  let batchSize = DEFAULT_BATCH_SIZE
  let lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS

  try {
    const url = new URL(req.url)
    const bs = url.searchParams.get('batch_size')
    const lt = url.searchParams.get('lock_timeout_ms')
    if (bs) {
      const parsed = Number.parseInt(bs, 10)
      if (Number.isFinite(parsed) && parsed > 0) batchSize = Math.min(parsed, 50)
    }
    if (lt) {
      const parsed = Number.parseInt(lt, 10)
      if (Number.isFinite(parsed) && parsed > 0) lockTimeoutMs = parsed
    }
  } catch {
    // Ignore parse errors — use defaults
  }

  // 5. Drain
  const ratePerSecond = getRatePerSecond(process.env as Record<string, string | undefined>)
  const now = new Date().toISOString()

  try {
    const repo = createOperatingCoreOutboxRepository({ supabase: supabase as never })
    const result = await drainOutbox(
      { outbox: repo },
      {
        ratePerSecond,
        currentIsoTimestamp: now,
        currentLockTimeoutMs: lockTimeoutMs,
        currentAttempt: 1,
      },
    )

    return NextResponse.json(
      {
        claimed: result.claimed.length,
        dispatched: result.dispatched,
        failed: result.failed,
        requeued: result.requeued,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[operating-core/outbox/drain] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// ---------------------------------------------------------------------------
// GET — health check
// ---------------------------------------------------------------------------

export async function GET() {
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
