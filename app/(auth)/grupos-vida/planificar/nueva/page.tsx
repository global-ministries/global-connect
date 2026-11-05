/**
 * Grupos de Vida — /grupos-vida/planificar/nueva (RSC). Placeholder of the
 * new-season assistant (artboard 10, T8 of odd/tasks/planner-gdv.md). Seasons
 * are created from the planner by admin, pastor and director general (S20);
 * anyone else goes to the dashboard. planner_crear_temporada checks it again
 * when the assistant exists.
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { PlannerPronto } from '@/components/grupos-vida/planner/estado-planner'

export const metadata = { title: 'Nueva temporada | Grupos de Vida' }

const ROLES_CREAR_TEMPORADA: readonly string[] = ['admin', 'pastor', 'director-general']

export default async function NuevaTemporadaPage() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect('/login')
  if (!userData.roles.some((rol) => ROLES_CREAR_TEMPORADA.includes(rol))) redirect('/dashboard')

  return <PlannerPronto migas="Nueva temporada" titulo="El asistente de nueva temporada llega pronto" volver="/grupos-vida/planificar" />
}
