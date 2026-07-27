import { NextRequest, NextResponse } from 'next/server'
import { requirePastoralSession, hasPastoralMetricsReadCapability, isPastoralRouteEnabled } from '@/lib/platform/pastoral/route-access'
import { getPersonasUnderMe } from '@/lib/platform/pastoral/hierarchical-visibility'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PASTORAL_METRIC_CARDS } from '@/lib/platform/pastoral/dashboards/types'
import {
  uno_auno_por_periodo,
  lideres_activos_por_ventana,
  alarma_gdv_sin_uno_auno_en_90_dias,
  createFakePastoralMetricsRepository,
  SYSTEM_CLOCK,
} from '@/lib/platform/pastoral/metrics'

type CardRouteContext = { params: Promise<{ card: string }> }

export async function GET(
  req: NextRequest,
  ctx: CardRouteContext,
): Promise<NextResponse> {
  if (!isPastoralRouteEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 })
  }

  const session = await requirePastoralSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!hasPastoralMetricsReadCapability(session)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { card } = await ctx.params
  if (!PASTORAL_METRIC_CARDS.includes(card as typeof PASTORAL_METRIC_CARDS[number])) {
    return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
  }

  const url = new URL(req.url)
  const periodoInicio = url.searchParams.get('periodo_inicio')
  const periodoFin = url.searchParams.get('periodo_fin')
  const ventanaInicio = url.searchParams.get('ventana_inicio')
  const ventanaFin = url.searchParams.get('ventana_fin')
  const now = new Date()
  const fin = periodoFin ?? now.toISOString().slice(0, 10)
  const inicio = periodoInicio ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const ventFin = ventanaFin ?? fin
  const ventInicio = ventanaInicio ?? inicio
  const repo = createFakePastoralMetricsRepository()
  const supabase = await createSupabaseServerClient()
  const visiblePersonaIds = new Set(await getPersonasUnderMe(supabase))

  switch (card) {
    case 'uno_auno_por_periodo': {
      const liveOnly = url.searchParams.get('live') !== 'false'
      const data = (await uno_auno_por_periodo(inicio, fin, repo, liveOnly))
        .filter((row) => visiblePersonaIds.has(row.personaId))
      return NextResponse.json({ card, data, periodo: { inicio, fin }, liveOnly })
    }
    case 'lideres_activos_por_ventana': {
      const data = (await lideres_activos_por_ventana(ventInicio, ventFin, repo))
        .filter((row) => visiblePersonaIds.has(row.liderId))
      return NextResponse.json({ card, data, ventana: { inicio: ventInicio, fin: ventFin } })
    }
    case 'alarma_gdv_sin_uno_auno_en_90_dias': {
      const data = await alarma_gdv_sin_uno_auno_en_90_dias(session.personaId, repo, SYSTEM_CLOCK)
      return NextResponse.json({ card, data })
    }
    default:
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
  }
}
