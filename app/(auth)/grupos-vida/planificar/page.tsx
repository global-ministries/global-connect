/**
 * Grupos de Vida — /grupos-vida/planificar (RSC), the season planner (T5a of
 * odd/tasks/planner-gdv.md; artboards 01, 03 and 08 of design/planner-gdv).
 *
 * Admin, pastor, director general and director de etapa only; any other role
 * goes to the dashboard, as in the other Grupos de Vida pages. The data loads
 * here with the session client (lib/platform/grupos-vida/planner/datos.ts):
 * the planner RPCs check the role again and scope the groups by segment (S10);
 * the bank is everyone (S11). The client island
 * (components/grupos-vida/planner/planner-client.tsx) renders the read-only
 * board; changing it comes with the steps (T5b).
 *
 * `?temporada=<id>` opens that season; without it, the most recent season in
 * planning. With none in planning: an empty state that sends the director
 * general to the new-season assistant (T8).
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { cargarPlanner, comoClientePlanner } from '@/lib/platform/grupos-vida/planner/datos'
import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { PlannerError, PlannerSinTemporada } from '@/components/grupos-vida/planner/estado-planner'

export const metadata = {
  title: 'Planificar temporada | Grupos de Vida',
  description: 'Planificador de temporadas de Grupos de Vida: grupos por segmento, banco de personas y alertas antes de publicar',
}

/** The roles of planner_alcance_actor() (supabase/migrations/20261107100000_planner_lecturas.sql). */
const ROLES_PLANIFICADOR: readonly string[] = ['admin', 'pastor', 'director-general', 'director-etapa']

export interface PlanificarPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

const primero = (valor: string | readonly string[] | undefined): string | null =>
  (typeof valor === 'string' ? valor : valor?.[0]) ?? null

export default async function PlanificarPage({ searchParams }: PlanificarPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect('/login')
  if (!userData.roles.some((rol) => ROLES_PLANIFICADOR.includes(rol))) redirect('/dashboard')

  const parametros = (await searchParams) ?? {}
  const resultado = await cargarPlanner(comoClientePlanner(supabase), primero(parametros.temporada))

  if (resultado.tipo === 'sin_acceso') redirect('/dashboard')
  if (resultado.tipo === 'error') return <PlannerError mensaje={resultado.mensaje} />
  if (resultado.tipo === 'sin_temporada') return <PlannerSinTemporada puedeCrearTemporada={resultado.capacidades.puede_crear_temporada} />
  return <PlannerClient datos={resultado.datos} />
}
