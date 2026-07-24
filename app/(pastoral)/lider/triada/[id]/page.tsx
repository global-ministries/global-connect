/**
 * W13 — DT-079 — Líder triada detail page.
 *
 * Full detail with four circles of access.
 * Shows: members, state, events, notes (for authorized).
 */

import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralTriadaReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PastoralTimeline } from '@/components/pastoral/PastoralTimeline'
import Link from 'next/link'
import { Users, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

interface Props {
  readonly params: Promise<{ id: string }>
}

export default async function LiderTriadaDetailPage({ params }: Props) {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralTriadaReadCapability(session)) redirect('/')

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  const { data: row } = await supabase
    .from('pastoral_triada')
    .select(`
      id,
      estado,
      contexto,
      motivo_disolucion,
      version,
      autor_persona_id,
      created_at,
      pastoral_triada_miembros (
        id,
        persona_id,
        rol_en_triada
      ),
      pastoral_triada_eventos (
        id,
        tipo,
        descripcion,
        created_at
      )
    `)
    .eq('id', id)
    .single()

  if (!row) notFound()

  const typedRow = row as {
    id: string
    estado: string
    contexto: string
    motivo_disolucion?: string
    version: number
    autor_persona_id: string
    created_at: string
    pastoral_triada_miembros?: Array<{
      id: string
      persona_id: string
      rol_en_triada: string
    }>
    pastoral_triada_eventos?: Array<{
      id: string
      tipo: string
      descripcion?: string
      created_at: string
    }>
  }

  // Verify actor is a member
  const isMember = typedRow.pastoral_triada_miembros?.some(
    (m) => m.persona_id === actorPersonaId
  )
  const hasReadAll = session.capabilities.some((c) => c.key === 'pastoral.read.all')
  if (!isMember && !hasReadAll) redirect('/')

  // Timeline
  const timelineItems = (typedRow.pastoral_triada_eventos ?? []).map((e) => ({
    id: e.id,
    type: 'triada_created' as const,
    title: e.tipo,
    subtitle: e.descripcion,
    isoDate: e.created_at,
  }))

  const rolLabels: Record<string, string> = {
    mentor: 'Mentor',
    assisted: 'Asistido',
    coordinator: 'Coordinador',
  }

  return (
    <ContenedorDashboard
      titulo={`Tríada — ${typedRow.estado}`}
      breadcrumbs={
        <div className="flex items-center gap-1 text-sm">
          <Link href="/lider/triada" className="text-muted-foreground hover:text-foreground">
            Tríadas
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Detalle</span>
        </div>
      }
      botonRegreso={{ href: '/lider/triada', texto: 'Volver' }}
    >
      {/* State */}
      <TarjetaSistema>
        <div className="flex items-center gap-3 mb-4">
          <Badge
            variant={
              typedRow.estado === 'active' ? 'default' :
              typedRow.estado === 'disbanded' ? 'destructive' :
              typedRow.estado === 'en_pausa' ? 'secondary' : 'outline'
            }
          >
            {typedRow.estado}
          </Badge>
          <Badge variant="secondary">{typedRow.contexto}</Badge>
          <span className="text-sm text-muted-foreground">v{typedRow.version}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Creada: {format(new Date(typedRow.created_at), "d 'de' MMMM 'de' yyyy", { locale: es })}
        </p>
        {typedRow.motivo_disolucion && (
          <p className="text-sm text-muted-foreground mt-1">
            Motivo disolución: {typedRow.motivo_disolucion}
          </p>
        )}
      </TarjetaSistema>

      {/* Members */}
      <TarjetaSistema>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-5 w-5 text-[var(--brand-primary)]" />
          <TituloSistema nivel={2}>Miembros</TituloSistema>
        </div>
        <ul className="space-y-2">
          {typedRow.pastoral_triada_miembros?.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <span className="text-sm font-medium truncate">
                {m.persona_id.slice(0, 8)}…
              </span>
              <Badge variant="outline" className="text-xs">
                {rolLabels[m.rol_en_triada] ?? m.rol_en_triada}
              </Badge>
            </li>
          ))}
        </ul>
      </TarjetaSistema>

      {/* Timeline */}
      {timelineItems.length > 0 && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Actividad</TituloSistema>
          <PastoralTimeline items={timelineItems} />
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
