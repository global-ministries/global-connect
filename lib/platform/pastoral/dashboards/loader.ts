/**
 * W12 — DT-070 — Pastoral dashboard data loader.
 *
 * Sibling to lib/dashboard/obtenerDatosDashboard.ts (F2 — untouched).
 * Loads pastoral metric cards behind NEXT_PUBLIC_PASTORAL_METRICS_ENABLED flag.
 *
 * Uses the 4 pure functions from lib/platform/pastoral/metrics/metrics.ts.
 * DT-071: Uses auth.uid() for actor scoping in alarm query.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId } from '@/lib/auth/platformSessionReadOnly'
import type { PlatformSession } from '@/lib/platform/session/types'
import { loadPastoralDashboardCards, createFakePastoralMetricsRepository, SYSTEM_CLOCK } from '@/lib/platform/pastoral/metrics'
import { getPastoralFlags } from '@/lib/platform/pastoral/flags'
import type { LoadPastoralDashboardResult, PastoralDashboardData } from './types'

/**
 * Loads pastoral dashboard data for the authenticated actor.
 *
 * @param input.session - Platform session (null if unauthenticated)
 * @param input.nowIso  - ISO timestamp used as generatedAt
 */
export async function loadPastoralDashboardData(input: {
  session: PlatformSession | null
  nowIso: string
}): Promise<LoadPastoralDashboardResult> {
  const { session, nowIso } = input

  // 1. Check flag — kill switch at call time
  const flags = getPastoralFlags()
  if (!flags.enabled || flags.killSwitch) {
    return { ok: false, error: 'not_enabled' }
  }

  // 2. Actor required
  if (session === null) {
    return { ok: false, error: 'no_actor' }
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const actorAuthId = user?.id

  if (!actorAuthId) {
    return { ok: false, error: 'no_actor' }
  }

  // Resolve actor's persona_id using auth.uid() directly (lesson W02-W10)
  const persona = await findPlatformSessionPersonaByAuthId(supabase, actorAuthId)
  const actorPersonaId = persona?.id

  if (!actorPersonaId) {
    return { ok: false, error: 'no_actor' }
  }

  // Build a fake repository with real Supabase queries
  // (In production, the supabase adapter would query the actual tables;
  // for now we use the fake since W05/W07 repos are in stacked PRs)
  const repo = createFakePastoralMetricsRepository()

  const cards = await loadPastoralDashboardCards(
    actorPersonaId,
    repo,
    SYSTEM_CLOCK,
  )

  const data: PastoralDashboardData = {
    cards,
    generatedAt: nowIso,
    flags: {
      metricsEnabled: true,
    },
  }

  return { ok: true, data }
}
