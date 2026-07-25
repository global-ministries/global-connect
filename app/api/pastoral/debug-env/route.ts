/**
 * F4 staging debug endpoint v6 — full transparency into requirePastoralSession failure.
 * Calls each step in isolation and reports which check throws.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
  isAuthBaseSupabaseClient,
} from '@/lib/auth/platformSessionReadOnly'
import { isPastoralEnabled, getPastoralFlags } from '@/lib/platform/pastoral/flags'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const cookieList = cookieStore.getAll()
  const cookieNames = cookieList.map((c) => c.name)

  const flags = getPastoralFlags()
  const isPastoralFnResult = isPastoralEnabled()

  // We need a supabase client with all the methods. The `database.types.ts`
  // generic should make `client.from(...)`, `client.auth.getUser()`, etc. typed.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieList,
      },
    }
  )

  // Step 1: validator checks directly
  const validatorChecks = {
    cookiesCount: cookieList.length,
    cookieNames,
    isAuthBaseSupabaseClient_bracket: isAuthBaseSupabaseClient(supabase),
    typeof_supabase_from: typeof (supabase as { from?: unknown }).from,
    typeof_reflect_from: typeof Reflect.get(supabase, 'from'),
    supabase_proto_has_from: typeof Reflect.get(Object.getPrototypeOf(supabase), 'from'),
  }

  // Step 2: getUser
  const { data: userData, error: userErr } = await supabase.auth.getUser()

  // Step 3: buildPlatformSession directly (bypass resolvers)
  let directResult: unknown = null
  let directError: unknown = null
  if (userData?.user?.id) {
    try {
      directResult = await resolveReadOnlyPlatformSession({
        subjectAuthId: userData.user.id,
        findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
        capabilitySupabase: supabase,
      })
    } catch (e: unknown) {
      directError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
  }

  return NextResponse.json({
    cookies_seen: validatorChecks,
    step_0_flag: { flags, isPastoralEnabled_returns: isPastoralFnResult },
    step_1_user: {
      authId: userData?.user?.id ?? null,
      email: userData?.user?.email,
      userError: userErr ? { message: userErr.message } : null,
    },
    step_2_direct_call: directResult,
    step_2_caught_error: directError,
    diagnosis:
      'isPastoralEnabled=' + isPastoralFnResult +
      ' • user=' + (userData?.user?.id ? 'OK' : 'NULL') +
      ' • isAuthBaseSupabaseClient=' + validatorChecks.isAuthBaseSupabaseClient_bracket +
      ' • typeof_from=' + validatorChecks.typename_supabase_from,
  })
}
