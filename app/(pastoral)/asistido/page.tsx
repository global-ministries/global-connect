/**
 * W13 — DT-080 — Asistido public roadmap page (P6).
 *
 * Uses the loadPublicRoadmap loader which:
 * - Uses auth.uid() directly
 * - Applies field-projection (D18) — resumen/notas NEVER exposed
 * - Enforces P6 access guard
 *
 * Shows: next 1:1, validated milestones, suggested next step.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { getPersonasUnderMe } from '@/lib/platform/pastoral/hierarchical-visibility'
import { loadPublicRoadmap } from '@/lib/platform/pastoral/public-roadmap/load-public-roadmap'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import AsistidoRoadmapClient from './AsistidoRoadmapClient'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AsistidoRoadmapPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session) redirect('/')

  const supabase = await createSupabaseServerClient()
  const visiblePersonaIds = await getPersonasUnderMe(supabase)
  if (!visiblePersonaIds.includes(session.personaId)) redirect('/')

  // Actor is the assisted person — load their own roadmap
  const roadmap = await loadPublicRoadmap({
    assistedPersonaId: session.personaId,
  })

  return (
    <PaginaSistema
      titulo="Mi Camino Pastoral"
      descripcion="Tu seguimiento espiritual personal"
      ancho="form"
    >
      {/* Roadmap content */}
      <AsistidoRoadmapClient roadmap={roadmap} />

      {/* Link to all sessions */}
      <div className="flex justify-end">
        <BotonSistema asChild variante="outline" icono={ArrowRight} iconoPosicion="derecha" className="w-full sm:w-auto">
          <Link href="/asistido/uno-auno">
            Ver todas mis sesiones
          </Link>
        </BotonSistema>
      </div>
    </PaginaSistema>
  )
}
