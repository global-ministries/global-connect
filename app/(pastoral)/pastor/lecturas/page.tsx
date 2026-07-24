/**
 * W13 — Pastor reading view (pastoral.read.all).
 *
 * Shows all 1:1 sessions and tríadas for pastoral oversight.
 * Registers access in pastoral_access_audit_log (D32).
 * Only accessible to pastoral.read.all.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralReadAllCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'
import { TriadaCard } from '@/components/pastoral/TriadaCard'

export const dynamic = 'force-dynamic'

export default async function PastorLecturasPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralReadAllCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  // Register audit log (D32) — append-only, best-effort
  await supabase
    .from('pastoral_access_audit_log')
    .insert({
      actor_persona_id: actorPersonaId,
      accessed_at: new Date().toISOString(),
      access_type: 'pastor_lectura_view',
    })
    .catch(() => { /* best-effort */ })

  // Fetch recent 1:1s
  const { data: unoAunos } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      completed_at,
      pastoral_one_on_one_participantes ( persona_id, rol )
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: triadas } = await supabase
    .from('pastoral_triada')
    .select(`
      id,
      estado,
      contexto,
      created_at,
      pastoral_triada_miembros ( id )
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  const mappedUnoAunos = (unoAunos ?? []).map((row: {
    id: string
    estado: string
    scheduled_at: string | null
    completed_at: string | null
    pastoral_one_on_one_participantes?: Array<{ persona_id: string; rol: string }>
  }) => {
    const assisted = row.pastoral_one_on_one_participantes?.find((p) => p.rol === 'asistido')
    return {
      id: row.id,
      estado: row.estado,
      scheduledAtIso: row.scheduled_at,
      assistedPersonaName: assisted?.persona_id ?? '—',
      pasosValidadosCount: 0,
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

  return (
    <ContenedorDashboard
      titulo="Lectura de Sesiones"
      descripcion="Vista de solo lectura — pastor/admin (pastoral.read.all)"
    >
      <TarjetaSistema>
        <TituloSistema nivel={2} className="mb-3">Sesiones 1:1</TituloSistema>
        {mappedUnoAunos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay sesiones registradas.</p>
        ) : (
          <div className="space-y-3">
            {mappedUnoAunos.map((u) => (
              <OneOnOneCard
                key={u.id}
                id={u.id}
                estado={u.estado}
                scheduledAtIso={u.scheduledAtIso}
                assistedPersonaName={u.assistedPersonaName}
                pasosValidadosCount={u.pasosValidadosCount}
                href={`/pastor/lecturas/${u.id}`}
                showMentor
              />
            ))}
          </div>
        )}
      </TarjetaSistema>

      <TarjetaSistema>
        <TituloSistema nivel={2} className="mb-3">Tríadas</TituloSistema>
        {mappedTriadas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay tríadas registradas.</p>
        ) : (
          <div className="space-y-3">
            {mappedTriadas.map((t) => (
              <TriadaCard
                key={t.id}
                id={t.id}
                estado={t.estado}
                contexto={t.contexto}
                createdAtIso={t.createdAtIso}
                miembrosCount={t.miembrosCount}
                href={`/pastor/lecturas/triada/${t.id}`}
              />
            ))}
          </div>
        )}
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
