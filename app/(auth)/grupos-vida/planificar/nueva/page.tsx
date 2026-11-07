/**
 * Grupos de Vida — /grupos-vida/planificar/nueva (RSC), the new-season
 * assistant (artboard 10, T8b of odd/tasks/planner-gdv.md; S18–S20). Seasons
 * are created from the planner by admin, pastor and director general (S20,
 * A10). A director de etapa never sees the assistant: it goes straight to
 * the board (S18); anyone else goes to the dashboard. planner_temporadas
 * gives the seasons (cohort, origin) and puede_crear_temporada, read with the
 * session client; planner_crear_temporada checks the role again.
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { leerTemporadas } from '@/lib/platform/grupos-vida/planner'
import { comoClientePlanner, mensajeErrorPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import { AsistenteTemporada } from '@/components/grupos-vida/planner/asistente-temporada'
import { PlannerError } from '@/components/grupos-vida/planner/estado-planner'

export const metadata = { title: 'Nueva temporada | Grupos de Vida' }

const ROLES_CREAR_TEMPORADA: readonly string[] = ['admin', 'pastor', 'director-general']
const RUTA_PLANIFICAR = '/grupos-vida/planificar'

/** Today in the church's time zone, 'YYYY-MM-DD'. */
const hoyEnCaracas = (): string => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Caracas' }).format(new Date())

export default async function NuevaTemporadaPage() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect('/login')
  if (!userData.roles.some((rol) => ROLES_CREAR_TEMPORADA.includes(rol))) {
    redirect(userData.roles.includes('director-etapa') ? RUTA_PLANIFICAR : '/dashboard')
  }

  const { data, error } = await comoClientePlanner(supabase).rpc('planner_temporadas')
  if (error) {
    if (error.code === '42501') redirect('/dashboard')
    return <PlannerError mensaje={mensajeErrorPlanner(error)} />
  }
  const capacidades = leerTemporadas(data)
  if (!capacidades) return <PlannerError mensaje="No se pudo cargar el planificador. Recarga la página." />
  if (!capacidades.puede_crear_temporada) redirect(RUTA_PLANIFICAR)

  return <AsistenteTemporada capacidades={capacidades} hoy={hoyEnCaracas()} />
}
