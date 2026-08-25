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
 *
 * `alsoAccept` lets a route widen the gate to additional capabilities it
 * honours — e.g. a director.write-gated endpoint that a scoped coordinator
 * must also reach passes `['talleres_crecimiento.coordinator.write']`.
 * This mirrors inscripciones-actions.ts (director.write || admin.manage ||
 * coordinator.write). The app gate is deliberately coarse: RLS is the
 * security wall that confines a scoped coordinator to their own equipo, so
 * this check only decides whether the request is let through at all.
 */
export async function requireTalleresApi(
  requiredCapability: string,
  alsoAccept: readonly string[] = [],
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

  // Try the requested capability first, then `director.read` (a superset for
  // read routes), then any capability the route opted into via `alsoAccept`.
  // Each is probed in order and we short-circuit on the first grant, so the
  // bare-gate call shape (1 rpc on success, 2 on the director.read fallback)
  // is unchanged when `alsoAccept` is empty.
  const acceptable = [requiredCapability, 'talleres_crecimiento.director.read', ...alsoAccept]
  let granted = false
  for (const capability of acceptable) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- auth_has_talleres_capability is a SQL function not in generated types
    const { data: hasCap } = await (supabase as any).rpc('auth_has_talleres_capability', {
      p_capability_key: capability,
    })
    if (hasCap) {
      granted = true
      break
    }
  }
  if (!granted) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { ok: true, supabase, userId: user.id as string }
}

/**
 * Finding #1 (Option B) — self-enroll gate for ANY authenticated user.
 *
 * Enrolling in a taller is HOW a user becomes a participant, so gating
 * self-enroll on `participation.read` is a chicken-and-egg trap: you'd
 * need the capability you're trying to earn. This gate therefore checks
 * only the kill switch and an authenticated session — it never consults
 * `auth_has_talleres_capability`. Security is preserved downstream: the
 * RLS `WITH CHECK` term forces `estado='pendiente'` + persona=self +
 * pareja validation, and approval still requires a write capability.
 */
export async function requireTalleresApiAuthenticated(): Promise<TalleresApiGate> {
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

  return { ok: true, supabase, userId: user.id as string }
}
