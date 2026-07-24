/**
 * W13 — DT-079 — Líder triada list page.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralTriadaReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { TriadaCard } from '@/components/pastoral/TriadaCard'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LiderTriadaListPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralTriadaReadCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  // Fetch all triadas where actor is a member
  const { data: rows } = await supabase
    .from('pastoral_triada')
    .select(`
      id,
      estado,
      contexto,
      created_at,
      pastoral_triada_miembros (
        id,
        persona_id,
        rol_en_triada
      ),
      pastoral_triada_eventos (
        id,
        tipo,
        created_at
      )
    `)
    .order('created_at', { ascending: false })

  const mapped = (rows ?? []).map((row: {
    id: string
    estado: string
    contexto: string
    created_at: string
    pastoral_triada_miembros?: Array<{ id: string; persona_id: string; rol_en_triada: string }>
    pastoral_triada_eventos?: Array<{ id: string; tipo: string; created_at: string }>
  }) => ({
    id: row.id,
    estado: row.estado,
    contexto: row.contexto,
    createdAtIso: row.created_at,
    miembrosCount: row.pastoral_triada_miembros?.length ?? 0,
  }))

  const active = mapped.filter((t) => t.estado === 'active')
  const pending = mapped.filter((t) => t.estado === 'pending_confirmation')
  const other = mapped.filter((t) => t.estado === 'en_pausa' || t.estado === 'disbanded')

  return (
    <ContenedorDashboard
      titulo="Mis Tríadas"
      descripcion="Seguimiento pastoral de tríadas"
    >
      <TarjetaSistema>
        <div className="flex items-center justify-between mb-4">
          <TituloSistema nivel={2}>Activas</TituloSistema>
          <Link href="/api/pastoral/triada">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Nueva tríada
            </Button>
          </Link>
        </div>
        {active.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay tríadas activas.</p>
        ) : (
          <div className="space-y-3">
            {[...active, ...pending].map((t) => (
              <TriadaCard
                key={t.id}
                id={t.id}
                estado={t.estado}
                contexto={t.contexto}
                createdAtIso={t.createdAtIso}
                miembrosCount={t.miembrosCount}
                href={`/lider/triada/${t.id}`}
              />
            ))}
          </div>
        )}
      </TarjetaSistema>

      {other.length > 0 && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Historial</TituloSistema>
          <div className="space-y-3">
            {other.map((t) => (
              <TriadaCard
                key={t.id}
                id={t.id}
                estado={t.estado}
                contexto={t.contexto}
                createdAtIso={t.createdAtIso}
                miembrosCount={t.miembrosCount}
                href={`/lider/triada/${t.id}`}
              />
            ))}
          </div>
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
