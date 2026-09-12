/**
 * Dream Team — GET /api/dream-team/usuarios/buscar
 *
 * Persona search backing the "assign servicio" admin card on
 * /admin/dream-team/servidores. Mirrors
 * app/api/talleres/admin/usuarios/buscar/route.ts in mechanics (ilike
 * nombre/apellido/email, minimum query length 2, limit 20), but is NOT that
 * route reused: this one is gated by Dream Team's own flag/session/capability
 * chain, not talleres'. A scoped area director holds `dream_team.direct` but
 * never a `talleres_crecimiento.*` capability, so reusing the talleres route
 * would 403 them out of their own assigner.
 *
 * Auth:
 *   - Dream Team feature flag → 404 when off
 *   - Dream Team session (auth user + persona) → 401 when absent
 *   - any Dream Team write capability (hasDreamTeamWriteCapability) → 403
 *     otherwise — searching personas is only useful to assign a servicio
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isDreamTeamEnabled,
  requireDreamTeamSession,
  hasDreamTeamWriteCapability,
} from '@/lib/platform/dream-team/route-access'

const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 20

export async function GET(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasDreamTeamWriteCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const q = (new URL(req.url).searchParams.get('q') || '').trim()
    if (q.length < MIN_QUERY_LENGTH) return NextResponse.json([])

    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, usuarios select shape kept loose like the talleres sibling route
    const client: any = supabase
    const { data, error } = await client
      .from('usuarios')
      .select('id, email, nombre, apellido, auth_id')
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(RESULT_LIMIT)

    if (error) {
      console.error('[dream-team/usuarios/buscar GET] error:', error)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('[dream-team/usuarios/buscar GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
