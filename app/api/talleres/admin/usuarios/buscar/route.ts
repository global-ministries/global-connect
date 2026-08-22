/**
 * Cimiento 4 — GET /api/talleres/admin/usuarios/buscar
 *
 * User search backing the "assign servicio" admin card on the abstract
 * taller detail page. Returns the usuarios matching a case-insensitive
 * query on nombre / apellido / email.
 *
 * Auth mirrors the openEdicion server action:
 *   - talleres feature flag → 404 when off
 *   - readonly platform session (auth user + persona) → 401 when absent
 *   - capability gate `talleres_crecimiento.director.write` OR
 *     `talleres_crecimiento.admin.manage` → 403 otherwise
 *
 * Query mechanics mirror /api/lideres/buscar (ilike `.or(...)`), with a
 * minimum query length of 2 (shorter → `[]`, no DB hit) and a limit of 20.
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
    const client: any = supabase
    const { data, error } = await client
      .from('usuarios')
      .select('id, email, nombre, apellido, auth_id')
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(RESULT_LIMIT)

    if (error) {
      console.error('[talleres/admin/usuarios/buscar GET] error:', error)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('[talleres/admin/usuarios/buscar GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
