/**
 * W13 — DT-078 — Quick capture page post-1:1.
 *
 * Page that wraps the CapturaForm client component.
 * Authorizes access via session.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CapturaForm from './CapturaForm.client'

export const dynamic = 'force-dynamic'

interface Props {
  readonly params: Promise<{ id: string }>
}

export default async function CapturaPage({ params }: Props) {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralOneOnOneReadCapability(session)) redirect('/')

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const actorPersonaId = session.personaId

  // Verify access: actor must be mentor of this 1:1
  const { data: row } = await supabase
    .from('pastoral_one_on_one')
    .select('id, mentor_oficial_persona_id, estado')
    .eq('id', id)
    .single()

  if (!row || row.mentor_oficial_persona_id !== actorPersonaId) redirect('/')

  const typedRow = row as { id: string; mentor_oficial_persona_id: string; estado: string }

  // Get assisted person
  const { data: participantes } = await supabase
    .from('pastoral_one_on_one_participantes')
    .select('persona_id, rol')
    .eq('one_on_one_id', id)

  const assisted = participantes?.find((p) => p.rol === 'asistido')

  return (
    <ContenedorDashboard
      titulo="Captura Rápida"
      descripcion="Confirma o rechaza la sesión 1:1"
      breadcrumbs={
        <div className="flex items-center gap-1 text-sm">
          <Link href="/lider/uno-auno" className="text-muted-foreground hover:text-foreground">
            Mis 1:1
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/lider/uno-auno/${id}`} className="text-muted-foreground hover:text-foreground">
            Detalle
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Captura</span>
        </div>
      }
      botonRegreso={{ href: `/lider/uno-auno/${id}`, texto: 'Volver' }}
    >
      <TarjetaSistema>
        <TituloSistema nivel={3} className="mb-3">
          Sesión 1:1 — {id.slice(0, 8)}…
        </TituloSistema>
        <p className="text-sm text-muted-foreground mb-4">
          Asistido: {assisted?.persona_id ?? '—'}
        </p>
      </TarjetaSistema>

      <CapturaForm
        oneOnOneId={typedRow.id}
        mentorPersonaId={typedRow.mentor_oficial_persona_id}
        assistedPersonaId={assisted?.persona_id ?? ''}
      />
    </ContenedorDashboard>
  )
}
