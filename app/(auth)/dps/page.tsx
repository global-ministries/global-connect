/**
 * DPS — /dps, the root of the "DPS" menu section (odd/tasks/dps-asistencia-pco.md,
 * T9, L29; T10): planners open the plan del domingo, whoever passes
 * attendance opens it, everyone else the plan (rutaInicioDps). Each page
 * decides who may see it.
 */
import { redirect } from 'next/navigation'

import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { resolverDpsAcceso, rutaInicioDps } from '@/lib/platform/dps/acceso'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function DpsPage(): Promise<never> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await resolverDpsAcceso(supabase, isDreamTeamEnabled())
  // The grants only matter for someone who sees DPS without planning it.
  const session =
    acceso.ver && !acceso.planificar
      ? await resolveReadOnlyPlatformSession({
          subjectAuthId: user.id,
          findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
          capabilitySupabase: supabase,
        })
      : null
  redirect(rutaInicioDps(session, acceso))
}
