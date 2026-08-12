/**
 * TEMP DEBUG ENDPOINT — PR21 troubleshooting.
 *
 * Returns the full platform session payload for the authenticated user.
 * Used to debug why /admin/talleres/nuevo denies access despite the
 * bootstrap grant. DELETE after PR21 verification.
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
    return NextResponse.json(
      { stage: 'auth.getUser', user: null, error: 'no session' },
      { status: 401 },
    )
  }

  const persona = await findPlatformSessionPersonaByAuthId(supabase, user.id)

  if (!persona) {
    return NextResponse.json(
      {
        stage: 'findPersonaByAuthId',
        auth_user: { id: user.id, email: user.email },
        persona: null,
        error: 'no persona linked',
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

  // Also run direct queries to see what the DB actually returns.
  const talleresCapsRes = await supabase
    .from('dream_team_capability_grants')
    .select('*')
    .eq('persona_id', persona.id)
    .is('revoked_at', null)

  return NextResponse.json({
    flag_enabled: isTalleresEnabled(),
    auth_user: { id: user.id, email: user.email },
    persona: { id: persona.id, authId: persona.authId },
    session_ok: session !== null,
    session_capabilities: session?.capabilities ?? [],
    session_capability_keys: session?.capabilities.map((c) => c.key) ?? [],
    direct_query_talleres_caps: talleresCapsRes.data ?? [],
    direct_query_error: talleresCapsRes.error?.message ?? null,
    // Hardcoded check that mirrors the page logic
    has_director_write: (session?.capabilities ?? []).some(
      (c) => c.key === 'talleres_crecimiento.director.write',
    ),
    has_admin_manage: (session?.capabilities ?? []).some(
      (c) => c.key === 'talleres_crecimiento.admin.manage',
    ),
  })
}
