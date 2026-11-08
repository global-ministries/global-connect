/**
 * Dream Team — /dream-team (RSC), the Equipo tab's root page
 * (odd/tasks/sistema-diseno-v2.md, L21): on phone the "Más" sheet has no
 * Dream Team submenu, so this page lists every Dream Team page the user can
 * open (components/navegacion/accesos-seccion.tsx, from the same navigation
 * entries as the sidebar).
 *
 * Same guard as /dream-team/mi-equipo: whoever opens no Dream Team page —
 * no Mi equipo access and nowhere to register people — gets a 404. A DPS-only
 * user (odd/tasks/dps-asistencia-pco.md, T9), whose menu shows only the DPS
 * entries, opens it too; the same facts as the (auth) layout.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  hasDreamTeamMiEquipoAccess,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'
import { puedeRegistrarParaNavegacion } from '@/lib/platform/dream-team/ficha-persona'
import { resolverDpsAcceso } from '@/lib/platform/dream-team/dps/acceso'
import { getDreamTeamNavItems } from '@/lib/platform/dream-team/navigation'
import { AccesosSeccion } from '@/components/navegacion/accesos-seccion'
import { PaginaSistema } from '@/components/ui/sistema-diseno'

export const metadata = { title: 'Dream Team' }

export default async function DreamTeamPage() {
  if (!isDreamTeamEnabled()) notFound()

  // Roles too: a Grupos de Vida director opens Mi equipo by system role.
  const session = await requireDreamTeamSession({ includeRoles: true })
  if (!session) redirect('/login')

  // The volunteer coordinator (or an area director) opens Mi equipo by
  // registering somewhere, the same flag as the sidebar (fails closed).
  if (!hasDreamTeamMiEquipoAccess(session)) {
    const supabase = await createSupabaseServerClient()
    if (!(await puedeRegistrarParaNavegacion(supabase, true))) {
      const dps = await resolverDpsAcceso(supabase, true)
      if (getDreamTeamNavItems(session, true, { dps }).length === 0) notFound()
    }
  }

  return (
    <PaginaSistema titulo="Dream Team">
      <AccesosSeccion seccion="dream-team" />
    </PaginaSistema>
  )
}
