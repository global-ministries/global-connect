/**
 * W12 — DT-071 — API route for pastoral metric cards.
 *
 * GET /api/pastoral/metrics/[card]
 * card ∈ { uno_auno_por_periodo, lideres_activos_por_ventana, triadas_por_tipo, alarma_gdv_sin_uno_auno_en_90_dias }
 *
 * Requires pastoral.metrics.read or pastoral.read.all capability (DT-073).
 * Uses auth.uid() for actor scoping.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requirePastoralSession, hasPastoralMetricsReadCapability, isPastoralRouteEnabled } from '@/lib/platform/pastoral/route-access'
import { getPastoralFlags } from '@/lib/platform/pastoral/flags'
import { PASTORAL_METRIC_CARDS } from '@/lib/platform/pastoral/dashboards/types'
import {
  uno_auno_por_periodo,
  lideres_activos_por_ventana,
  triadas_por_tipo,
  alarma_gdv_sin_uno_auno_en_90_dias,
  createFakePastoralMetricsRepository,
  SYSTEM_CLOCK,
} from '@/lib/platform/pastoral/metrics'

type CardRouteContext = { params: Promise<{ card: string }> }

export async function GET(
  req: NextRequest,
  ctx: CardRouteContext,
): Promise<NextResponse> {
  // 0. Kill switch
  if (!isPastoralRouteEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 })
  }

  // 1. Session + capability check
  const session = await requirePastoralSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!hasPastoralMetricsReadCapability(session)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 2. Validate card parameter
  const { card } = await ctx.params
  if (!PASTORAL_METRIC_CARDS.includes(card as typeof PASTORAL_METRIC_CARDS[number])) {
    return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
  }

  // 3. Parse query params
  const url = new URL(req.url)
  const periodoInicio = url.searchParams.get('periodo_inicio')
  const periodoFin = url.searchParams.get('periodo_fin')
  const ventanaInicio = url.searchParams.get('ventana_inicio')
  const ventanaFin = url.searchParams.get('ventana_fin')

  // 4. Build date range defaults (last 30 days)
  const now = new Date()
  const fin = periodoFin ?? now.toISOString().slice(0, 10)
  const inicio = periodoInicio ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const ventFin = ventanaFin ?? fin
  const ventInicio = ventanaInicio ?? inicio

  // 5. Use fake repository (W05/W07 repos are in stacked PRs)
  const repo = createFakePastoralMetricsRepository()

  switch (card) {
    case 'uno_auno_por_periodo': {
      const liveOnly = url.searchParams.get('live') !== 'false'
      const data = await uno_auno_por_periodo(inicio, fin, repo, liveOnly)
      return NextResponse.json({ card, data, periodo: { inicio, fin }, liveOnly })
    }

    case 'lideres_activos_por_ventana': {
      const data = await lideres_activos_por_ventana(ventInicio, ventFin, repo)
      return NextResponse.json({ card, data, ventana: { inicio: ventInicio, fin: ventFin } })
    }

    case 'triadas_por_tipo': {
      const data = await triadas_por_tipo(repo)
      return NextResponse.json({ card, data })
    }

    case 'alarma_gdv_sin_uno_auno_en_90_dias': {
      // DT-073: auth.uid() for actor scoping
      const actorPersonaId = session.personaId
      const data = await alarma_gdv_sin_uno_auno_en_90_dias(actorPersonaId, repo, SYSTEM_CLOCK)
      return NextResponse.json({ card, data })
    }

    default:
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
  }
}
