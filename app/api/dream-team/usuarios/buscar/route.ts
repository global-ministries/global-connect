/**
 * Dream Team — GET /api/dream-team/usuarios/buscar
 *
 * Persona search backing the "assign servicio" admin card on
 * /admin/dream-team/servidores. Mirrors
 * app/api/talleres/admin/usuarios/buscar/route.ts in mechanics (calls the
 * shared talleres_buscar_personas RPC, minimum query length 2, limit 20),
 * but is NOT that route reused: this one is gated by Dream Team's own
 * flag/session/capability chain, not talleres'. A scoped area director
 * holds `dream_team.direct` but never a `talleres_crecimiento.*`
 * capability, so reusing the talleres route would 403 them out of their
 * own assigner.
 *
 * BUGFIX — this route used to query `usuarios` directly through the
 * caller's own server client, which hit `usuarios`' own row-level security:
 * only admin/pastor/Grupos-de-Vida leaders can see other people's rows
 * there, so an area director assigning a servidor got a silent
 * "Sin resultados" (verified in staging with a real area director). It now
 * calls the talleres_buscar_personas RPC (SECURITY DEFINER, its own
 * capability gate independent of `usuarios` RLS), mapped back to this
 * route's existing response shape.
 *
 * Auth:
 *   - Dream Team feature flag → 404 when off
 *   - Dream Team session (auth user + persona) → 401 when absent
 *   - any Dream Team write capability (hasDreamTeamWriteCapability) → 403
 *     otherwise — searching personas is only useful to assign a servicio
 *   - the RPC re-checks authority on its own capability list too (defense
 *     in depth — CORRECTION post-review: this list now also includes
 *     `dream_team.requirements.manage`, see 20260926130000_talleres_
 *     buscar_personas_requirements.sql, closing the one gap where it used
 *     to diverge from hasDreamTeamWriteCapability's set). A 42501 from it
 *     surfaces as a visible 403 below — NEVER as an empty result, which
 *     would be indistinguishable from "nobody matched" and reintroduce the
 *     exact "Sin resultados" bug this route exists to fix. Any other RPC
 *     error is a genuine 500 with a generic message, no SQLSTATE or detail
 *     leaked to the client.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, rpc return shape kept loose like the talleres sibling route
    const client: any = supabase
    const { data, error } = await client.rpc('talleres_buscar_personas', {
      p_q: q,
      p_limit: RESULT_LIMIT,
    })

    if (error) {
      // A 42501 from the RPC is a real authorization denial — surface it as
      // a visible 403, never as an empty result (an empty result would be
      // indistinguishable from "nobody matched" and reintroduce the exact
      // "Sin resultados" bug this route exists to fix).
      if (error.code === '42501') {
        return NextResponse.json(
          { error: 'sin_autoridad_para_buscar', message: 'No tenés autoridad para buscar personas.' },
          { status: 403 },
        )
      }
      console.error('[dream-team/usuarios/buscar GET] error:', error)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }

    const usuarios = ((data ?? []) as Array<{
      id: string
      nombre: string | null
      apellido: string | null
      email: string | null
    }>).map((u) => ({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      apellido: u.apellido,
      auth_id: null,
    }))

    return NextResponse.json(usuarios)
  } catch (error) {
    console.error('[dream-team/usuarios/buscar GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
