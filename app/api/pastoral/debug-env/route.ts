/**
 * F4 staging debug endpoint v4 — full platform session diagnostics.
 * After v3 confirmed cookies reach the server, this version calls the
 * exact code path the pastoral page uses.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { buildPlatformSession } from '@/lib/platform/session/build'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const cookieList = cookieStore.getAll()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieList,
      },
    }
  )

  // Step 1: raw supabase getUser
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  const authId = userData?.user?.id ?? null

  // Step 2: findPlatformSessionPersonaByAuthId (the lookup buildPlatformSession uses)
  let personaLookupResult: unknown = null
  let personaLookupError: unknown = null
  if (authId) {
    try {
      const persona = await findPlatformSessionPersonaByAuthId(supabase, authId)
      personaLookupResult = persona
    } catch (e: unknown) {
      personaLookupError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
  }

  // Step 3: full buildPlatformSession
  let platformSessionResult: unknown = null
  if (authId) {
    try {
      platformSessionResult = await buildPlatformSession({
        subjectAuthId: authId,
        personaLookup: {
          findByAuthId: (id) => findPlatformSessionPersonaByAuthId(supabase, id),
        },
        capabilityLookup: {
          findByPersonaId: async (personaId: string) => {
            const { data: caps } = await supabase
              .from('dream_team_capability_grants')
              .select('capability_key, experience, scope_type, scope_id, source, granted_at, revoked_at')
              .eq('persona_id', personaId)
              .is('revoked_at', null)
            return (caps ?? []).map((c) => ({
              key: c.capability_key,
              experience: c.experience,
              scopeType: c.scope_type,
              scopeId: c.scope_id || undefined,
              source: c.source,
              grantedAt: c.granted_at,
            }))
          },
        },
      })
    } catch (e: unknown) {
      platformSessionResult = { caught_error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Step 4: env_summary
  const allEnvKeys = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'))
  const envSummary = Object.fromEntries(
    allEnvKeys.map((k) => [k, `${process.env[k]?.length ?? 0} chars`])
  )

  return NextResponse.json({
    deployment: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      NODE_ENV: process.env.NODE_ENV,
    },
    env_summary: envSummary,
    step_1_user: {
      authId,
      email: userData?.user?.email,
      userError: userErr ? { message: userErr.message } : null,
    },
    step_2_persona_lookup: {
      result: personaLookupResult,
      error: personaLookupError,
      // Compare the authId from supabase vs the authId we'd query by
      match_check:
        personaLookupResult && typeof personaLookupResult === 'object' && 'authId' in personaLookupResult
          ? {
              query_authId: authId,
              returned_authId: (personaLookupResult as { authId: string }).authId,
              strict_equals: authId === (personaLookupResult as { authId: string }).authId,
              trimmed_equals:
                authId?.trim() ===
                ((personaLookupResult as { authId: string }).authId ?? '').trim(),
            }
          : null,
    },
    step_3_platformSession: platformSessionResult,
    diagnosis:
      'Si step_2_persona_lookup.result es null: la query no encontró el row. ' +
      'Si strict_equals=false pero trimmed_equals=true: whitespace en uno de los lados. ' +
      'Si step_3 ok=false, reason="persona_not_linked_to_backend_auth": personaId ok pero authId mismatch.',
  })
}
