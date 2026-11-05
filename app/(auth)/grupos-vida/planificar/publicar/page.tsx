/**
 * Grupos de Vida — /grupos-vida/planificar/publicar (RSC). Placeholder of the
 * publish review (artboard 04, T8 of odd/tasks/planner-gdv.md) that the
 * board's publish button opens. Only admin, pastor and director general
 * publish (S12); anyone else goes to the dashboard. planner_publicar checks
 * it again when the review exists.
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { PlannerPronto } from '@/components/grupos-vida/planner/estado-planner'

export const metadata = { title: 'Publicar temporada | Grupos de Vida' }

const ROLES_PUBLICAR: readonly string[] = ['admin', 'pastor', 'director-general']

export interface PublicarPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

export default async function PublicarTemporadaPage({ searchParams }: PublicarPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect('/login')
  if (!userData.roles.some((rol) => ROLES_PUBLICAR.includes(rol))) redirect('/dashboard')

  const temporada = (await searchParams)?.temporada
  const id = typeof temporada === 'string' ? temporada : temporada?.[0]
  const volver = id ? `/grupos-vida/planificar?temporada=${encodeURIComponent(id)}` : '/grupos-vida/planificar'
  return <PlannerPronto migas="Publicar" titulo="La revisión para publicar llega pronto" volver={volver} />
}
