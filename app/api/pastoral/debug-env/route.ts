/**
 * F4 staging debug endpoint v5 — exact replication of page.tsx redirect logic.
 * Calls requirePastoralSession + hasPastoralReadAllCapability, exactly as
 * /pastor/page.tsx does. Reports each step's outcome so we can localize the
 * redirect trigger.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { buildPlatformSession } from '@/lib/platform/session/build'
import {
  requirePastoralSession,
  hasPastoralReadAllCapability,
  hasPastoralAdminManageCapability,
} from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled, getPastoralFlags } from '@/lib/platform/pastoral/flags'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Step 0: flag check (the FIRST guard in page.tsx)
  const flags = getPastoralFlags()
  const isPastoralFnResult = isPastoralEnabled()

  // Step 1: session via the actual requirePastoralSession path
  let sessionResult: unknown = null
  let sessionStepLog: unknown = null
  try {
    sessionResult = await requirePastoralSession()
  } catch (e: unknown) {
    sessionStepLog = { caught_error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
  }

  // Step 2: capability checks against the real session (if we have one)
  let capabilityChecks: unknown = null
  if (sessionResult && typeof sessionResult === 'object' && 'personaId' in sessionResult) {
    const s = sessionResult as { personaId: string; capabilities: Array<{ key: string }> }
    capabilityChecks = {
      hasPastoralReadAll: hasPastoralReadAllCapability(
        s as unknown as Parameters<typeof hasPastoralReadAllCapability>[0]
      ),
      hasPastoralAdminManage: hasPastoralAdminManageCapability(
        s as unknown as Parameters<typeof hasPastoralAdminManageCapability>[0]
      ),
      capabilitiesCount: s.capabilities.length,
      capabilitiesKeys: s.capabilities.map((c) => c.key),
    }
  } else {
    capabilityChecks = {
      error: 'no session returned from requirePastoralSession',
      session: sessionResult,
    }
  }

  return NextResponse.json({
    step_0_flag_check: {
      flags,
      isPastoralEnabled_returns: isPastoralFnResult,
    },
    step_1_session: sessionResult ?? sessionStepLog,
    step_2_capability_checks: capabilityChecks,
    diagnosis:
      'isPastoralEnabled=' + isPastoralFnResult +
      ' ? session=' + (sessionResult ? 'present' : 'null') +
      ' ? hasPastoralReadAll=' + (
        capabilityChecks && typeof capabilityChecks === 'object' && 'hasPastoralReadAll' in capabilityChecks
          ? String((capabilityChecks as { hasPastoralReadAll: boolean }).hasPastoralReadAll)
          : '?'
      ),
  })
}
