/**
 * W13 — Pastor dashboard page (pastoral.read.all).
 *
 * Shows all pastoral metrics (from W12) + crisis alerts.
 * Only accessible to users with pastoral.read.all capability.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralReadAllCapability, hasPastoralAdminManageCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import PastorDashboardClient from './PastorDashboardClient'

export const dynamic = 'force-dynamic'

export default async function PastorDashboardPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralReadAllCapability(session)) redirect('/')

  const hasAdminManage = hasPastoralAdminManageCapability(session)

  const supabase = await createSupabaseServerClient()

  // Fetch crisis alerts
  const { data: crisisRows } = await supabase
    .from('pastoral_crisis_detection_log')
    .select(`
      one_on_one_id,
      categoria,
      keyword,
      detected_at
    `)
    .order('detected_at', { ascending: false })
    .limit(10)

  const mappedCrisis = (crisisRows ?? []).map((row: {
    one_on_one_id: string
    categoria: string
    keyword: string
    detected_at: string
  }) => ({
    oneOnOneId: row.one_on_one_id,
    categoria: row.categoria,
    keyword: row.keyword,
    detectedAtIso: row.detected_at,
    assistedPersonaId: '',
    assistedPersonaName: undefined as string | undefined,
  }))

  // Placeholder metrics (W12 metrics API would be called here)
  // The W12 API routes /api/pastoral/metrics/[card] provide the real data
  const metrics = {
    unoAunoPorPeriodo: '—',
    lideresActivos: '—',
    alarmas90dias: '—',
  }

  return (
    <PastorDashboardClient
      metrics={metrics}
      crisisAlerts={mappedCrisis}
      hasAdminManage={hasAdminManage}
    />
  )
}
