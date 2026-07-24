/**
 * W13 — Pastor dashboard page (pastoral.read.all).
 *
 * Shows all pastoral metrics (from W12) + crisis alerts.
 * Only accessible to users with pastoral.read.all capability.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralReadAllCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import PastorDashboardClient from './PastorDashboardClient'

export const dynamic = 'force-dynamic'

export default async function PastorDashboardPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralReadAllCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()

  // Fetch crisis alerts
  const { data: crisisRows } = await supabase
    .from('pastoral_crisis_detection_log')
    .select(`
      one_on_one_id,
      categoria,
      keyword,
      created_at,
      pastoral_one_on_one (
        participantes_persona_ids
      )
    `)
    .order('created_at', { ascending: false })
    .limit(10)

  const mappedCrisis = (crisisRows ?? []).map((row: {
    one_on_one_id: string
    categoria: string
    keyword: string
    created_at: string
    pastoral_one_on_one?: { participantes_persona_ids: string[] }
  }) => ({
    oneOnOneId: row.one_on_one_id,
    categoria: row.categoria,
    keyword: row.keyword,
    detectedAtIso: row.created_at,
    assistedPersonaId: row.pastoral_one_on_one?.participantes_persona_ids?.[0] ?? '',
    assistedPersonaName: undefined as string | undefined,
  }))

  // Placeholder metrics (W12 metrics API would be called here)
  // The W12 API routes /api/pastoral/metrics/[card] provide the real data
  const metrics = {
    unoAunoPorPeriodo: '—',
    lideresActivos: '—',
    triadasActivas: '—',
    alarmas90dias: '—',
  }

  return (
    <PastorDashboardClient
      metrics={metrics}
      crisisAlerts={mappedCrisis}
    />
  )
}
