/**
 * Cimiento 4 — GET /api/talleres/admin/usuarios/buscar
 *
 * User search backing the "assign servicio" admin card on the abstract
 * taller detail page. Returns the usuarios matching a case-insensitive
 * query on nombre / apellido / email.
 *
 * BUGFIX — this route used to query `usuarios` directly through the
 * caller's own server client, which hit `usuarios`' own row-level security:
 * only admin/pastor/Grupos-de-Vida leaders can see other people's rows
 * there, so every director/coordinator got a silent "Sin resultados" no
 * matter who they searched for (verified in staging). It now calls the
 * talleres_buscar_personas RPC (SECURITY DEFINER, its own capability gate
 * independent of `usuarios` RLS), mapped back to this route's existing
 * response shape.
 *
 * Auth mirrors the openEdicion server action:
 *   - talleres feature flag → 404 when off
 *   - readonly platform session (auth user + persona) → 401 when absent
 *   - capability gate `talleres_crecimiento.director.write` OR
 *     `talleres_crecimiento.admin.manage` → 403 otherwise
 *   - the RPC re-checks authority on its own (broader) capability list, so
 *     it never denies a caller who already passed the gate above; kept as
 *     defense in depth — see the dream-team sibling route for the one case
 *     where the two lists actually diverge.
 *
 * Query mechanics: minimum query length of 2 (shorter → `[]`, no RPC call)
 * and a limit of 20 (the RPC clamps this to 50 regardless).
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 20

export async function GET(req: NextRequest) {
  try {
    if (!isTalleresEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
    const { data: { user } } = await (supabase as any).auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const session = await resolveReadOnlyPlatformSession({
      subjectAuthId: user.id,
      findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
      capabilitySupabase: supabase,
    })
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const caps = session.capabilities.map((c) => c.key)
    const hasCap =
      caps.includes('talleres_crecimiento.director.write') ||
      caps.includes('talleres_crecimiento.admin.manage')
    if (!hasCap) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })

    const q = (new URL(req.url).searchParams.get('q') || '').trim()
    if (q.length < MIN_QUERY_LENGTH) return NextResponse.json([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, rpc return shape kept loose like the talleres sibling route
    const client: any = supabase
    const { data, error } = await client.rpc('talleres_buscar_personas', {
      p_q: q,
      p_limit: RESULT_LIMIT,
    })

    if (error) {
      // A write-capable caller whose specific capability isn't on the RPC's
      // own list gets 42501 here — degrade to an empty result instead of a
      // 500, same as the RLS-filtered "no rows" this route used to return.
      if (error.code === '42501') return NextResponse.json([])
      console.error('[talleres/admin/usuarios/buscar GET] error:', error)
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
    console.error('[talleres/admin/usuarios/buscar GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
