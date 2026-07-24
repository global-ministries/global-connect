/**
 * W13 — DT-080 — Asistido 1:1 list page (roadmap view only, P6).
 *
 * Shows all 1:1 sessions for the assisted person.
 * No private notes (T2 from pastoral-one-on-one-read spec).
 * Only roadmap fields: state, date, steps validated.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AsistidoUnoAUnoListPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session) redirect('/')

  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  // Fetch 1:1 sessions where actor is a participant
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
    .contains('participantes_persona_ids', [actorPersonaId])
    .order('scheduled_at', { ascending: false })

  // Show roadmap fields only (no notes)
  const sesiones = (rows ?? []).map((row: {
    id: string
    estado: string
    scheduled_at: string | null
    completed_at: string | null
    pastoral_one_on_one_participantes?: Array<{ persona_id: string; rol: string }>
    pastoral_one_on_one_pasos_validados?: Array<unknown>
  }) => {
    const mentor = row.pastoral_one_on_one_participantes?.find((p) => p.rol === 'mentor')
    return {
      id: row.id,
      estado: row.estado,
      scheduledAtIso: row.scheduled_at,
      assistedPersonaName: mentor?.persona_id ?? '—',
      pasosValidadosCount: row.pastoral_one_on_one_pasos_validados?.length ?? 0,
    }
  })

  const upcoming = sesiones.filter((s) => s.estado === 'scheduled' || s.estado === 'in_progress')
  const past = sesiones.filter((s) => s.estado === 'completed' || s.estado === 'cancelled')

  return (
    <ContenedorDashboard
      titulo="Mis Sesiones 1:1"
      descripcion="Tu seguimiento pastoral"
    >
      <Link href="/asistido" className="block mb-4">
        <Button variant="ghost" size="sm">
          <ArrowRight className="h-4 w-4 rotate-180" />
          Volver al roadmap
        </Button>
      </Link>

      <TarjetaSistema>
        <TituloSistema nivel={2} className="mb-3">Próximas Sesiones</TituloSistema>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No tienes sesiones programadas.
          </p>
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
                href={`/asistido/uno-auno`}
                showMentor
              />
            ))}
          </div>
        )}
      </TarjetaSistema>

      {past.length > 0 && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Historial</TituloSistema>
          <div className="space-y-3">
            {past.map((u) => (
              <OneOnOneCard
                key={u.id}
                id={u.id}
                estado={u.estado}
                scheduledAtIso={u.scheduledAtIso}
                assistedPersonaName={u.assistedPersonaName}
                pasosValidadosCount={u.pasosValidadosCount}
                href={`/asistido/uno-auno`}
                showMentor
              />
            ))}
          </div>
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
