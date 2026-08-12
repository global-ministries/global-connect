/**
 * PR12 — DT-047 — GET /api/talleres/metricas
 *
 * Public API surface for tallers metrics. Capability-gated to
 * `talleres_crecimiento.metrics.read` (or director.read as a superset).
 *
 * Status codes:
 *   401 — no auth session
 *   403 — auth but missing capability
 *   404 — taller feature flag off (kill switch / not enabled)
 *   400 — missing or invalid `tallerId` query param
 *   200 — payload: { finalizationRate, inscripcionesActivas, asistenciaPromedio }
 *
 * The internal `noAprobadosPorMotivo` function is NEVER exposed here —
 * motivos are sensitive (D17/D18).
 */

import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  asistenciaPromedio,
  finalizationRateByTaller,
  inscripcionesActivas,
} from '@/lib/platform/talleres/metrics'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1) Kill-switch / feature flag → 404 (same shape as 404 across the API).
  if (!isTalleresEnabled()) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  // 2) Query param: tallerId required.
  const tallerId = req.nextUrl.searchParams.get('tallerId')
  if (!tallerId) {
    return NextResponse.json(
      { error: 'missing-taller-id' },
      { status: 400 },
    )
  }

  // 3) Auth → 401.
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client; auth user shape
  } = await (supabase as any).auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 4) Capability → 403. Use the F3 OperatingCoreParticipationLedgerRepository
  //    pattern (SECURITY DEFINER) to evaluate RLS-bypassing capability.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client; RPC call
  const { data: canRead, error: capError } = await (supabase as any).rpc(
    'eval_talleres_capability',
    { p_capability: 'talleres_crecimiento.metrics.read' },
  )
  if (capError || !canRead) {
    // Director.read also implies metrics coverage.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
    const { data: dirRead } = await (supabase as any).rpc(
      'eval_talleres_capability',
      { p_capability: 'talleres_crecimiento.director.read' },
    )
    if (!dirRead) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  // 5) Compute + return.
  try {
    const [finalizationRate, activas, promedio] = await Promise.all([
      finalizationRateByTaller(supabase, tallerId),
      inscripcionesActivas(supabase, tallerId),
      asistenciaPromedio(supabase, tallerId),
    ])
    return NextResponse.json({
      taller_id: tallerId,
      finalizationRate,
      inscripcionesActivas: activas,
      asistenciaPromedio: promedio,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: 'internal', message }, { status: 500 })
  }
}
