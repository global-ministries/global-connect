/**
 * W13 — DT-074 — Líder 1:1 list page.
 *
 * Shows all 1:1 sessions for the current mentor.
 * No private notes in the list (REQ-06 of pastoral-one-on-one-read).
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LiderUnoAUnoListPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralOneOnOneReadCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  const { data: rows } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      completed_at,
      pastoral_one_on_one_participantes (
        persona_id,
        rol
      ),
      pastoral_one_on_one_pasos_validados ( id )
    `)
    .eq('mentor_oficial_persona_id', actorPersonaId)
    .order('scheduled_at', { ascending: false })

  const sesiones = (rows ?? []).map((row: {
    id: string
    estado: string
    scheduled_at: string | null
    completed_at: string | null
    pastoral_one_on_one_participantes?: Array<{ persona_id: string; rol: string }>
    pastoral_one_on_one_pasos_validados?: Array<unknown>
  }) => {
    const assisted = row.pastoral_one_on_one_participantes?.find((p) => p.rol === 'asistido')
    return {
      id: row.id,
      estado: row.estado,
      scheduledAtIso: row.scheduled_at,
      assistedPersonaName: assisted?.persona_id ?? '—',
      pasosValidadosCount: row.pastoral_one_on_one_pasos_validados?.length ?? 0,
    }
  })

  const upcoming = sesiones.filter((s) => s.estado === 'scheduled' || s.estado === 'in_progress')
  const past = sesiones.filter((s) => s.estado === 'completed' || s.estado === 'cancelled')

  return (
    <ContenedorDashboard
      titulo="Mis Sesiones 1:1"
      descripcion="Seguimiento pastoral de tus sesiones"
    >
      <TarjetaSistema>
        <div className="flex items-center justify-between mb-4">
          <TituloSistema nivel={2}>Programadas</TituloSistema>
          <Link href="/api/pastoral/one-on-one">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Nueva sesión
            </Button>
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay sesiones programadas.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((u) => (
              <OneOnOneCard
                key={u.id}
                id={u.id}
                estado={u.estado}
                scheduledAtIso={u.scheduledAtIso}
                assistedPersonaName={u.assistedPersonaName}
                pasosValidadosCount={u.pasosValidadosCount}
                href={`/lider/uno-auno/${u.id}`}
                showMentor
              />
            ))}
          </div>
        )}
      </TarjetaSistema>

      {past.length > 0 && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-4">Historial</TituloSistema>
          <div className="space-y-3">
            {past.map((u) => (
              <OneOnOneCard
                key={u.id}
                id={u.id}
                estado={u.estado}
                scheduledAtIso={u.scheduledAtIso}
                assistedPersonaName={u.assistedPersonaName}
                pasosValidadosCount={u.pasosValidadosCount}
                href={`/lider/uno-auno/${u.id}`}
                showMentor
              />
            ))}
          </div>
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
