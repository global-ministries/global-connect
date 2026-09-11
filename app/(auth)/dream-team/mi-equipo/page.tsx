/**
 * Dream Team — /dream-team/mi-equipo (RSC).
 *
 * Third of the three Dream Team screens: the operative view for an area
 * director (outside /admin — reached by direct URL only, not wired into
 * navigation). Shows the branch of the org tree the caller reaches and, per
 * node, who serves there with their current stage.
 */
import { notFound, redirect } from 'next/navigation'

import { DashboardPage } from '@/components/talleres/dashboard-page'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isDreamTeamEnabled,
  requireDreamTeamSession,
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
} from '@/lib/platform/dream-team/route-access'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import { fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

import { MiEquipoClient, type MiEquipoServicioRow } from './mi-equipo-client'

export const metadata = { title: 'Mi equipo' }

export default async function DreamTeamMiEquipoPage() {
  if (!isDreamTeamEnabled()) notFound()

  const session = await requireDreamTeamSession()
  if (!session) redirect('/login')

  if (!hasDreamTeamReadCapability(session)) notFound()

  const supabase = await createSupabaseServerClient()
  const repo = createSupabaseDreamTeamRepository(supabase)

  // RLS scopes listEquipos() to the caller's own branch (or globally for
  // dream_team.org.manage). The topmost node the caller reaches arrives with
  // a parentEquipoId that resolves to nothing in this list — construirArbol()
  // already treats that as a visible root instead of an invisible orphan
  // (see its docstring), which is exactly the "no ve a su padre" case named
  // in the task.
  const equipos = await repo.listEquipos()
  const arbol = construirArbol(equipos)
  const equipoIds = new Set(equipos.map((equipo) => equipo.id))

  // listServicios({}) once (RLS-scoped to the same branch) and group locally
  // by equipoId, instead of one listServicios({ equipoId }) call per node —
  // avoids N+1 over the branch's equipo count.
  const [servicios, entradasRoles] = await Promise.all([
    repo.listServicios({}),
    Promise.all(
      equipos.map(async (equipo): Promise<readonly [string, readonly DreamTeamRol[]]> => [
        equipo.id,
        await repo.listRolesPorEquipo(equipo.id),
      ]),
    ),
  ])

  const rolLabelPorId = new Map(entradasRoles.flatMap(([, roles]) => roles).map((rol) => [rol.id, rol.label]))

  // Same reasoning as servidores/page.tsx: usuarios is not a dream-team
  // table, so persona names are resolved here with a single bulk lookup
  // rather than added to the repository.
  const personaNombrePorId = await fetchNombresPersonas(
    supabase,
    servicios.map((servicio) => servicio.personaId),
  )

  const serviciosPorEquipo: Record<string, MiEquipoServicioRow[]> = {}
  for (const servicio of servicios) {
    if (!equipoIds.has(servicio.equipoId)) continue
    const fila: MiEquipoServicioRow = {
      servicio,
      personaNombre: personaNombrePorId.get(servicio.personaId) ?? 'Persona no encontrada',
      rolLabel: rolLabelPorId.get(servicio.rolId) ?? 'Rol no encontrado',
    }
    ;(serviciosPorEquipo[servicio.equipoId] ??= []).push(fila)
  }

  const puedeEditar = hasDreamTeamWriteCapability(session)

  return (
    <DashboardPage titulo="Mi equipo" subtitulo="Tu rama de Dream Team: quién sirve en cada nodo y en qué etapa.">
      <MiEquipoClient arbol={arbol} serviciosPorEquipo={serviciosPorEquipo} puedeEditar={puedeEditar} />
    </DashboardPage>
  )
}
