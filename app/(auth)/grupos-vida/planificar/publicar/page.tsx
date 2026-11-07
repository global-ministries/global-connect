/**
 * Grupos de Vida — /grupos-vida/planificar/publicar (RSC), the publish review
 * (artboard 04, T8a of odd/tasks/planner-gdv.md; S6–S8, S12, S14, S19) that
 * the board's publish button opens (S16). Only admin, pastor and director
 * general publish (S12); anyone else goes to the dashboard, and
 * planner_publicar checks it again.
 *
 * The data is the board's (cargarPlanner, session client): the publish state
 * of planner_estado_publicacion, the blockers of planner_bloqueos and the
 * warnings computed over the saved groups and bank (calcularAvisos, S7), as
 * the alerts panel counts them. `?temporada=<id>` reviews that season;
 * without it, the most recent in planning. The review itself
 * (components/grupos-vida/planner/publicar-temporada.tsx) publishes with
 * publicarTemporadaAction.
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { calcularAvisos } from '@/lib/platform/grupos-vida/planner'
import { cargarPlanner, comoClientePlanner } from '@/lib/platform/grupos-vida/planner/datos'
import { PlannerError, PlannerSinTemporada } from '@/components/grupos-vida/planner/estado-planner'
import { avisosDelAlcance, seccionesAvisos } from '@/components/grupos-vida/planner/modelo'
import { PublicarTemporada } from '@/components/grupos-vida/planner/publicar-temporada'

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

  const pedida = (await searchParams)?.temporada
  const id = typeof pedida === 'string' ? pedida : (pedida?.[0] ?? null)
  const resultado = await cargarPlanner(comoClientePlanner(supabase), id)

  if (resultado.tipo === 'sin_acceso') redirect('/dashboard')
  if (resultado.tipo === 'error') return <PlannerError mensaje={resultado.mensaje} />
  if (resultado.tipo === 'sin_temporada') return <PlannerSinTemporada puedeCrearTemporada={resultado.capacidades.puede_crear_temporada} />

  const { capacidades, temporada, grupos, banco, localidades, bloqueos, estado } = resultado.datos
  if (!estado) return <PlannerError mensaje={`No se pudo leer el estado de publicación de ${temporada.nombre}. Recarga la página.`} />

  const avisos = avisosDelAlcance(calcularAvisos({ grupos, banco, localidades, segmentos: capacidades.segmentos }), grupos, banco, capacidades)
  const resumen = seccionesAvisos(avisos, grupos, temporada.origen_nombre).map(({ id: clave, titulo, cantidad }) => ({ id: clave, titulo, cantidad }))

  return (
    <PublicarTemporada
      temporada={temporada}
      usuarioId={capacidades.usuario_id}
      estado={estado}
      bloqueos={bloqueos}
      segmentos={capacidades.segmentos}
      avisos={resumen}
      totalAvisos={avisos.length}
    />
  )
}
