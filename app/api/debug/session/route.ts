/**
 * TEMP DEBUG ENDPOINT — PR21 sidebar visibility troubleshooting.
 *
 * Returns the platformSession the SERVER resolves for the current user.
 * Compared to /api/debug/capabilities (PR21.1), this one calls
 * resolveReadOnlyPlatformSession like the rest of the app — it shows
 * what the app's own session builder actually produces.
 *
 * DELETE after PR21 verification.
 */

import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export async function GET(): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const supabase: any = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ stage: 'no_session', user: null }, { status: 401 })
  }

  const persona = await findPlatformSessionPersonaByAuthId(supabase, user.id)
  if (!persona) {
    return NextResponse.json(
      {
        stage: 'no_persona',
        auth_user: { id: user.id, email: user.email },
        persona: null,
      },
      { status: 404 },
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })

  // Also: what would the existing talleres_participation nav item show?
  // We import the resolver to check.
  const { resolvePlatformNavigation } = await import('@/lib/platform/navigation')
  const { getPlatformNavigationFlags } = await import('@/lib/platform/flags')

  const flags = getPlatformNavigationFlags()
  const nav = await resolvePlatformNavigation({
    flags,
    platformSession: session,
  })

  return NextResponse.json({
    stage: 'ok',
    flag_enabled: isTalleresEnabled(),
    auth_user: { id: user.id, email: user.email },
    persona: { id: persona.id, authId: persona.authId },
    session_capabilities_count: session?.capabilities.length ?? 0,
    session_capability_keys: session?.capabilities.map((c) => c.key) ?? [],
    session_warnings: session ? 'session ok' : 'session is null',
    // The actual nav items the sidebar would render:
    nav_visible_items: nav.visibleItems.map((i) => ({
      id: i.id,
      label: i.label,
      href: i.href,
    })),
    nav_talleres_items: nav.visibleItems.filter((i) => i.id.includes('talleres')),
    nav_denied_items: nav.deniedItems.map((d) => ({ id: d.id, reason: d.reason })),
  })
}
