/**
 * Dream Team — /dream-team (RSC), the Equipo tab's root page
 * (odd/tasks/sistema-diseno-v2.md, L21): on phone the "Más" sheet has no
 * Dream Team submenu, so this page lists every Dream Team page the user can
 * open (components/navegacion/accesos-seccion.tsx, from the same navigation
 * entries as the sidebar).
 *
 * Same guard as /dream-team/mi-equipo: whoever opens no Dream Team page —
 * no Mi equipo access and nowhere to register people — gets a 404.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  hasDreamTeamMiEquipoAccess,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'
import { fetchEquiposRegistrables } from '@/lib/platform/dream-team/ficha-persona'
import { AccesosSeccion } from '@/components/navegacion/accesos-seccion'
import { PaginaSistema } from '@/components/ui/sistema-diseno'

export const metadata = { title: 'Dream Team' }

export default async function DreamTeamPage() {
  if (!isDreamTeamEnabled()) notFound()

  // Roles too: a Grupos de Vida director opens Mi equipo by system role.
  const session = await requireDreamTeamSession({ includeRoles: true })
  if (!session) redirect('/login')

  // The volunteer coordinator opens Mi equipo by registering somewhere (fails closed).
  if (!hasDreamTeamMiEquipoAccess(session)) {
    const supabase = await createSupabaseServerClient()
    const puedeRegistrar = (await fetchEquiposRegistrables(supabase)).size > 0
    if (!puedeRegistrar) notFound()
  }

  return (
    <PaginaSistema titulo="Dream Team">
      <AccesosSeccion seccion="dream-team" />
    </PaginaSistema>
  )
}
