/**
 * W13 — DT-075 — Líder 1:1 detail page.
 *
 * Full detail of a 1:1 session with private notes.
 * Shows: participant info, state, steps validated, notes (mentor only).
 * Mentions MentorPanel for quick capture (D22).
 */

import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MentorPanel } from '@/components/pastoral/MentorPanel'
import { PastoralTimeline } from '@/components/pastoral/PastoralTimeline'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

interface Props {
  readonly params: Promise<{ id: string }>
}

export default async function LiderUnoAUnoDetailPage({ params }: Props) {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralOneOnOneReadCapability(session)) redirect('/')

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  // Fetch 1:1 with full detail
  const { data: row } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      completed_at,
      motivo_cancelacion,
      resumen,
      version,
      mentor_oficial_persona_id,
      autor_persona_id,
      created_at,
      pastoral_one_on_one_participantes (
        persona_id,
        rol
      ),
      pastoral_one_on_one_notas (
        id,
        contenido,
        autor_persona_id,
        created_at
      ),
      pastoral_one_on_one_pasos_validados (
        id,
        step_key,
        validated_at,
        validated_by_persona_id,
        is_shared_milestone
      )
    `)
    .eq('id', id)
    .single()

  if (!row) notFound()

  // Verify access: actor is mentor or has pastoral.read.all
  const isMentor = row.mentor_oficial_persona_id === actorPersonaId
  const isAuthor = row.autor_persona_id === actorPersonaId
  const hasReadAll = session.capabilities.some((c) => c.key === 'pastoral.read.all')

  if (!isMentor && !isAuthor && !hasReadAll) redirect('/')

  const typedRow = row as {
    id: string
    estado: string
    scheduled_at: string | null
    completed_at: string | null
    motivo_cancelacion?: string
    resumen?: string
    version: number
    mentor_oficial_persona_id: string
    autor_persona_id: string
    created_at: string
    pastoral_one_on_one_participantes?: Array<{ persona_id: string; rol: string }>
    pastoral_one_on_one_notas?: Array<{
      id: string
      contenido: string
      autor_persona_id: string
      created_at: string
    }>
    pastoral_one_on_one_pasos_validados?: Array<{
      id: string
      step_key: string
      validated_at: string
      validated_by_persona_id: string
      is_shared_milestone: boolean
    }>
  }

  const assisted = typedRow.pastoral_one_on_one_participantes?.find((p) => p.rol === 'asistido')
  const assistedPersonaId = assisted?.persona_id ?? ''

  // Timeline items
  const timelineItems = [
    ...(typedRow.pastoral_one_on_one_pasos_validados ?? []).map((s) => ({
      id: s.id,
      type: 'step_validated' as const,
      title: `Paso validado: ${s.step_key}`,
      isoDate: s.validated_at,
      isSharedMilestone: s.is_shared_milestone,
    })),
    ...(typedRow.pastoral_one_on_one_notas ?? []).map((n) => ({
      id: n.id,
      type: 'one_on_one' as const,
      title: 'Nota agregada',
      subtitle: n.contenido.slice(0, 60) + (n.contenido.length > 60 ? '…' : ''),
      isoDate: n.created_at,
    })),
  ].sort((a, b) => new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime())

  return (
    <ContenedorDashboard
      titulo={`Sesión 1:1 con ${assistedPersonaId.slice(0, 8)}…`}
      breadcrumbs={
        <div className="flex items-center gap-1 text-sm">
          <Link href="/lider/uno-auno" className="text-muted-foreground hover:text-foreground">
            Mis 1:1
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Detalle</span>
        </div>
      }
      botonRegreso={{ href: '/lider/uno-auno', texto: 'Volver' }}
    >
      {/* State + meta */}
      <TarjetaSistema>
        <div className="flex items-center gap-3 mb-4">
          <Badge
            variant={
              typedRow.estado === 'completed' ? 'default' :
              typedRow.estado === 'cancelled' ? 'destructive' :
              typedRow.estado === 'in_progress' ? 'secondary' : 'outline'
            }
          >
            {typedRow.estado}
          </Badge>
          <span className="text-sm text-muted-foreground">
            v{typedRow.version}
          </span>
        </div>

        {typedRow.scheduled_at && (
          <p className="text-sm text-muted-foreground mb-1">
            Programada: {format(new Date(typedRow.scheduled_at), "d 'de' MMMM 'de' yyyy HH:mm", { locale: es })}
          </p>
        )}
        {typedRow.completed_at && (
          <p className="text-sm text-muted-foreground mb-1">
            Completada: {format(new Date(typedRow.completed_at), "d 'de' MMMM 'de' yyyy HH:mm", { locale: es })}
          </p>
        )}
        {typedRow.motivo_cancelacion && (
          <p className="text-sm text-muted-foreground">
            Motivo cancelación: {typedRow.motivo_cancelacion}
          </p>
        )}
      </TarjetaSistema>

      {/* Steps validated */}
      {typedRow.pastoral_one_on_one_pasos_validados && typedRow.pastoral_one_on_one_pasos_validados.length > 0 && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Pasos Validados</TituloSistema>
          <div className="space-y-2">
            {typedRow.pastoral_one_on_one_pasos_validados.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm">{s.step_key}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(new Date(s.validated_at), 'MMM d', { locale: es })}
                </span>
              </div>
            ))}
          </div>
        </TarjetaSistema>
      )}

      {/* Mentor panel — quick capture (D22) */}
      {typedRow.estado !== 'completed' && typedRow.estado !== 'cancelled' && isMentor && (
        <MentorPanel
          oneOnOneId={typedRow.id}
          mentorPersonaId={typedRow.mentor_oficial_persona_id}
          assistedPersonaId={assistedPersonaId}
          sessionAtIso={typedRow.scheduled_at ?? undefined}
        />
      )}

      {/* Notes (mentor only — not exposed in public roadmap) */}
      {isMentor && typedRow.pastoral_one_on_one_notas && typedRow.pastoral_one_on_one_notas.length > 0 && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Notas Privadas</TituloSistema>
          <div className="space-y-3">
            {typedRow.pastoral_one_on_one_notas.map((n) => (
              <div key={n.id} className="text-sm border-l-2 border-border pl-3">
                <p>{n.contenido}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(n.created_at), "d 'de' MMM yyyy HH:mm", { locale: es })}
                </p>
              </div>
            ))}
          </div>
          <Link href={`/lider/uno-auno/${id}/captura`} className="mt-3 block">
            <Button variant="outline" size="sm">
              Agregar nota
            </Button>
          </Link>
        </TarjetaSistema>
      )}

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
