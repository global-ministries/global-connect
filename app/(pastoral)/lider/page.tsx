/**
 * W13 — DT-074 — Líder dashboard page (server component).
 *
 * Uses auth.uid() directly — NOT public.current_persona_id().
 * Fetches: upcoming 1:1s, active tríadas, crisis alerts.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import LiderDashboardClient from './LiderDashboardClient'

export const dynamic = 'force-dynamic'

export default async function LiderDashboardPage() {
  // Check pastoral flag
  if (!isPastoralEnabled()) {
    redirect('/')
  }

  // Require session
  const session = await requirePastoralSession()
  if (!session) redirect('/')

  // Require read capability
  if (!hasPastoralOneOnOneReadCapability(session)) {
    redirect('/')
  }

  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  // Fetch upcoming 1:1s where actor is mentor
  const { data: unoAunos } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      pastoral_one_on_one_participantes (
        persona_id,
        rol
      ),
      pastoral_one_on_one_pasos_validados ( id )
    `)
    .eq('mentor_oficial_persona_id', actorPersonaId)
    .in('estado', ['scheduled', 'in_progress'])
    .order('scheduled_at', { ascending: true })
    .limit(10)

  // Fetch active tríadas where actor is mentor
  const { data: triadas } = await supabase
    .from('pastoral_triada')
    .select(`
      id,
      estado,
      contexto,
      created_at,
      pastoral_triada_miembros ( id )
    `)
    .eq('estado', 'active')
    .limit(10)

  // Fetch crisis alerts (simplified — W09 adds full scan)
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
    .limit(5)

  // Map data to client types
  const mappedUnoAunos = (unoAunos ?? []).map((row: {
    id: string
    estado: string
    scheduled_at: string | null
    pastoral_one_on_one_participantes?: Array<{ persona_id: string; rol: string }>
    pastoral_one_on_one_pasos_validados?: Array<unknown>
  }) => {
    const assisted = row.pastoral_one_on_one_participantes?.find((p) => p.rol === 'asistido')
    return {
      id: row.id,
      estado: row.estado,
      scheduledAtIso: row.scheduled_at,
      assistedPersonaName: assisted?.persona_id ?? '—',
      pasosValidadosCount: (row.pastoral_one_on_one_pasos_validados?.length ?? 0),
    }
  })

  const mappedTriadas = (triadas ?? []).map((row: {
    id: string
    estado: string
    contexto: string
    created_at: string
    pastoral_triada_miembros?: Array<unknown>
  }) => ({
    id: row.id,
    estado: row.estado,
    contexto: row.contexto,
    createdAtIso: row.created_at,
    miembrosCount: row.pastoral_triada_miembros?.length ?? 0,
  }))

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
    assistedPersonaName: undefined,
  }))

  return (
    <LiderDashboardClient
      unoAunos={mappedUnoAunos}
      triadas={mappedTriadas}
      crisisAlerts={mappedCrisis}
    />
  )
}
