/**
 * PR15 — Shared talleres API helper.
 *
 * Consolidates the auth/capability/flag gate used by every talleres
 * Next.js route. The gate follows the same shape as PR12's metricas route
 * but is shared to avoid 9 copies of the same boilerplate.
 *
 * Status codes:
 *   404 — talleres feature flag off (kill switch / not enabled)
 *   401 — no auth session
 *   403 — auth but missing the required capability (or its director
 *         superset, where applicable)
 *
 * Returns a discriminated union: when `ok: true` the route gets the
 * supabase client + userId and proceeds; when `ok: false` the route
 * short-circuits with the prepared response.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export type TalleresApiGate =
  | { readonly ok: true; readonly supabase: SupabaseClient; readonly userId: string }
  | { readonly ok: false; readonly response: NextResponse }

/**
 * Run the standard gate for a talleres API route. The route specifies
 * the capability it needs; if the user holds it (or `director.read` as
 * a superset for read-only routes), the gate opens.
 */
export async function requireTalleresApi(
  requiredCapability: string,
): Promise<TalleresApiGate> {
  if (!isTalleresEnabled()) {
    return { ok: false, response: NextResponse.json({ error: 'not-found' }, { status: 404 }) }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- auth_has_talleres_capability is a SQL function not in generated types
  const { data: hasCap } = await (supabase as any).rpc('auth_has_talleres_capability', {
    p_capability_key: requiredCapability,
  })
  if (!hasCap) {
    // Director.read is a superset for any read capability — try the
    // superset before returning 403.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- auth_has_talleres_capability is a SQL function not in generated types
    const { data: isDirector } = await (supabase as any).rpc('auth_has_talleres_capability', {
      p_capability_key: 'talleres_crecimiento.director.read',
    })
    if (!isDirector) {
      return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
    }
  }

  return { ok: true, supabase, userId: user.id as string }
}
