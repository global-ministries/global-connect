import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { getPersonasUnderMe, visiblePersonaIdsOrNone } from '@/lib/platform/pastoral/hierarchical-visibility'
import LiderDashboardClient from './LiderDashboardClient'

export const dynamic = 'force-dynamic'

export default async function LiderDashboardPage() {
  if (!isPastoralEnabled()) {
    redirect('/')
  }

  const session = await requirePastoralSession()
  if (!session) redirect('/')

  if (!hasPastoralOneOnOneReadCapability(session)) {
    redirect('/')
  }

  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId
  const visiblePersonaIds = visiblePersonaIdsOrNone(await getPersonasUnderMe(supabase))

  const { data: unoAunos } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      pastoral_one_on_one_participantes!inner (
        persona_id
      )
    `)
    .eq('mentor_oficial_persona_id', actorPersonaId)
    .in('pastoral_one_on_one_participantes.persona_id', visiblePersonaIds)
    .in('estado', ['scheduled', 'in_progress'])
    .order('scheduled_at', { ascending: true })
    .limit(10)

  const { data: crisisRows } = await supabase
    .from('pastoral_crisis_detection_log')
    .select(`
      one_on_one_id,
      categoria,
      keyword,
      detected_at
    `)
    .order('detected_at', { ascending: false })
    .limit(5)

  const mappedUnoAunos = (unoAunos ?? []).map((row: {
    id: string
    estado: string
    scheduled_at: string | null
    pastoral_one_on_one_participantes?: Array<{ persona_id: string }>
  }) => {
    const firstParticipant = row.pastoral_one_on_one_participantes?.[0]
    return {
      id: row.id,
      estado: row.estado,
      scheduledAtIso: row.scheduled_at,
      assistedPersonaName: firstParticipant?.persona_id ?? '—',
      pasosValidadosCount: 0,
    }
  })

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
    assistedPersonaName: undefined,
  }))

  return (
    <LiderDashboardClient
      unoAunos={mappedUnoAunos}
      crisisAlerts={mappedCrisis}
    />
  )
}
