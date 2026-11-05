/**
 * Dream Team — GET /api/dream-team/pendientes
 * (odd/tasks/dream-team-pendientes-director.md, T4, S2, S6).
 *
 * → { urgentes }: the count of the "Pendientes" menu badge, from
 * dream_team_pendientes_resumen() (scoped by the database, S5). The client asks
 * once after mount (hooks/useDreamTeamAcceso.tsx), so the (auth) layout never
 * waits for it. Same gate as /dream-team/pendientes; `urgentes: null` when the
 * summary cannot be read (the badge stays hidden).
 */
import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  hasDreamTeamPendientesAccess,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'
import { puedeRegistrarParaNavegacion } from '@/lib/platform/dream-team/ficha-persona'
import { fetchResumenPendientes } from '@/lib/platform/dream-team/pendientes'

const SIN_CACHE = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const supabase = await createSupabaseServerClient()
    if (!hasDreamTeamPendientesAccess(session) && !(await puedeRegistrarParaNavegacion(supabase, true))) {
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
    }

    const resumen = await fetchResumenPendientes(supabase)
    return NextResponse.json({ urgentes: resumen?.urgentes ?? null }, { headers: SIN_CACHE })
  } catch (error) {
    console.error('[dream-team/pendientes GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
