import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralReadAllCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'

export const dynamic = 'force-dynamic'

export default async function PastorLecturasPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralReadAllCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()

  const { data: unoAunos } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      completed_at,
      pastoral_one_on_one_participantes ( persona_id )
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  const mappedUnoAunos = (unoAunos ?? []).map((row: {
    id: string
    estado: string
    scheduled_at: string | null
    completed_at: string | null
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
    </ContenedorDashboard>
  )
}
