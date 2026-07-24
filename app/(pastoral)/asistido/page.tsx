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
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { requirePastoralSession } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { loadPublicRoadmap } from '@/lib/platform/pastoral/public-roadmap/load-public-roadmap'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import AsistidoRoadmapClient from './AsistidoRoadmapClient'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AsistidoRoadmapPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session) redirect('/')

  // Actor is the assisted person — load their own roadmap
  const roadmap = await loadPublicRoadmap({
    assistedPersonaId: session.personaId,
  })

  return (
    <ContenedorDashboard
      titulo="Mi Camino Pastoral"
      descripcion="Tu seguimiento espiritual personal"
    >
      {/* Roadmap content */}
      <AsistidoRoadmapClient roadmap={roadmap} />

      {/* Link to all sessions */}
      <div className="flex justify-end">
        <Link href="/asistido/uno-auno">
          <Button variant="outline" size="sm">
            Ver todas mis sesiones
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </ContenedorDashboard>
  )
}
