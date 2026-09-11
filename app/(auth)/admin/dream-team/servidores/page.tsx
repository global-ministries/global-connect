/**
 * Dream Team — /admin/dream-team/servidores (RSC).
 *
 * Second of the three Dream Team screens: the pool of servicios (who serves,
 * where, in which role, in which stage). Server component loads equipos +
 * roles + servicios and resolves display labels server-side; the client
 * island (./servidores-client.tsx) only renders + filters + drives the
 * assigner and stage-advance API calls.
 *
 * Not wired into the sidebar/navigation yet — reached by direct URL only.
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

import { ServidoresClient, type ServidorRow } from './servidores-client'

export const metadata = { title: 'Servidores' }

export default async function DreamTeamServidoresPage() {
  if (!isDreamTeamEnabled()) notFound()

  const session = await requireDreamTeamSession()
  if (!session) redirect('/login')

  if (!hasDreamTeamReadCapability(session)) notFound()

  const supabase = await createSupabaseServerClient()
  const repo = createSupabaseDreamTeamRepository(supabase)

  // RLS already scopes listServicios()/listEquipos() to what this session can
  // see (global for dream_team.org.manage, a single branch for a scoped
  // area director) — nothing here filters by scope again (see
  // estructura/page.tsx). listServicios({}) is called once, unfiltered: the
  // estado filter lives client-side so the "count per etapa" header can show
  // totals across all 6 states regardless of the currently applied filter.
  const [servicios, equipos] = await Promise.all([repo.listServicios({}), repo.listEquipos()])
  const arbol = construirArbol(equipos)

  // Same tradeoff as estructura/page.tsx: listRolesPorEquipo() is per-equipo,
  // not bulk, so this is N parallel queries via Promise.all instead of one —
  // acceptable for an admin screen, and it reuses the repository method
  // verbatim. It also doubles as the role list the assigner needs for every
  // equipo node, not only the ones with existing servicios.
  const entradasRoles = await Promise.all(
    equipos.map(async (equipo): Promise<readonly [string, readonly DreamTeamRol[]]> => [
      equipo.id,
      await repo.listRolesPorEquipo(equipo.id),
    ]),
  )
  const rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>> = Object.fromEntries(entradasRoles)

  const equipoLabelPorId = new Map(equipos.map((equipo) => [equipo.id, equipo.label]))
  const rolLabelPorId = new Map(entradasRoles.flatMap(([, roles]) => roles).map((rol) => [rol.id, rol.label]))

  // Persona display names are not part of DreamTeamServicio (it only carries
  // personaId, see types.ts) and the repository has no join for them.
  // Resolving them here with a single bulk `usuarios.in(id)` lookup (see
  // lib/platform/dream-team/personas.ts) avoids an N+1 over servicios.length
  // while keeping the dream-team repository free of a cross-domain concern
  // — usuarios is not a dream-team table.
  const personaNombrePorId = await fetchNombresPersonas(
    supabase,
    servicios.map((servicio) => servicio.personaId),
  )

  const rows: readonly ServidorRow[] = servicios.map((servicio) => ({
    servicio,
    personaNombre: personaNombrePorId.get(servicio.personaId) ?? 'Persona no encontrada',
    equipoLabel: equipoLabelPorId.get(servicio.equipoId) ?? 'Equipo no encontrado',
    rolLabel: rolLabelPorId.get(servicio.rolId) ?? 'Rol no encontrado',
  }))

  const puedeEditar = hasDreamTeamWriteCapability(session)

  return (
    <DashboardPage
      titulo="Servidores"
      subtitulo="Pool de servicios de Dream Team: quién sirve, dónde, y en qué etapa."
    >
      <ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={rolesPorEquipo} puedeEditar={puedeEditar} />
    </DashboardPage>
  )
}
