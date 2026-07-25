/**
 * F4 staging debug endpoint — reads runtime env values used by pastoral flags.
 * Temporary diagnostic for the access blocker investigation.
 * Will be removed once env delivery is verified.
 *
 * Path: app/api/pastoral/_debug-env/route.ts
 * GET  /api/pastoral/_debug-env  → returns process.env values
 */

import { NextResponse } from 'next/server'
import { getPastoralFlags, isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { getPlatformNavigationFlags } from '@/lib/platform/flags'

export const dynamic = 'force-dynamic'

export async function GET() {
  const runtime = {
    NEXT_PUBLIC_PASTORAL_ENABLED: process.env.NEXT_PUBLIC_PASTORAL_ENABLED ?? '<undefined>',
    NEXT_PUBLIC_PASTORAL_STAGE: process.env.NEXT_PUBLIC_PASTORAL_STAGE ?? '<undefined>',
    NEXT_PUBLIC_PASTORAL_METRICS_ENABLED: process.env.NEXT_PUBLIC_PASTORAL_METRICS_ENABLED ?? '<undefined>',
    NEXT_PUBLIC_PASTORAL_KILL_SWITCH: process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH ?? '<undefined>',
    NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED:
      process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED ?? '<undefined>',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '<undefined>',
    NODE_ENV: process.env.NODE_ENV ?? '<undefined>',
    VERCEL_ENV: process.env.VERCEL_ENV ?? '<undefined>',
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? '<undefined>',
  }

  const flags = getPastoralFlags()
  const platformNav = getPlatformNavigationFlags()
  const pastoralEnabledFn = isPastoralEnabled()

  return NextResponse.json({
    runtime_env: runtime,
    computed_flags: {
      pastoral: flags,
      platformNavigation: platformNav,
    },
    computed_gates: {
      isPastoralEnabled: pastoralEnabledFn,
    },
    debug_note:
      'Si isPastoralEnabled=false y NEXT_PUBLIC_PASTORAL_ENABLED está vacío o no es "true"/' +
      'on/1/yes, hay drift entre Vercel storage (que sí tiene "true") y el bundle que sirve la función.',
  })
}
