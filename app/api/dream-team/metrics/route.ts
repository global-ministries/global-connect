import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { getDreamTeamMetrics } from '@/lib/platform/dream-team/metrics'
import {
  hasDreamTeamMetricsCapability,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'

export async function GET(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const s = await requireDreamTeamSession()
    if (!s) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!hasDreamTeamMetricsCapability(s)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const metrics = await getDreamTeamMetrics(repo)

    return NextResponse.json({ metrics })
  } catch (error) {
    console.error('[dream-team/metrics] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
