/**
 * Personas — /admin/personas/fusionar (RSC).
 *
 * «Fusionar personas» (odd/tasks/dream-team-estructura-correcciones.md, T5,
 * S6c): when someone was registered twice, the ficha with the account keeps
 * the whole history of the other one. Admin and pastor only — the same rule
 * the RPCs enforce (es_admin_o_pastor; personas_fusionar and its helpers
 * refuse anyone else with 42501). Merging is global (any two people of any
 * campus), so a campus-level dream_team.org.manage does not open it. Anyone
 * else gets a 404; a signed-out visitor goes to /login.
 *
 * Not in the navigation yet: reached by URL.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { FusionarPersonas } from '@/components/personas/fusionar-personas'

export const metadata = { title: 'Fusionar personas' }

export default async function FusionarPersonasPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: esAdminOPastor, error } = await supabase.rpc('es_admin_o_pastor', { p_auth_id: user.id })
  if (error || esAdminOPastor !== true) notFound()

  return (
    <PaginaSistema
      titulo="Fusionar personas"
      descripcion="Cuando alguien quedó registrado dos veces: la ficha con cuenta se queda con todo el historial de la otra, que se borra."
    >
      <FusionarPersonas />
    </PaginaSistema>
  )
}
