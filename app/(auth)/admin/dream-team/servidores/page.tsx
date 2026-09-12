/**
 * Dream Team — /admin/dream-team/servidores (RSC).
 *
 * Second of the three Dream Team screens: the pool of servidores (who
 * serves, where, in which role, in which stage) — Dream Team servicios PLUS
 * Grupos de Vida leaders/co-leaders surfaced read-only (see
 * lib/platform/dream-team/lideres-gdv.ts, lib/platform/dream-team/servidores.ts),
 * now grouped under the GROUP node they lead — a virtual node from
 * lib/platform/dream-team/estructura-gdv.ts. Server component loads
 * equipos + roles + servicios + GdV leaders + the virtual Grupos de Vida
 * branch and resolves display labels server-side; the client island
 * (./servidores-client.tsx) only renders + filters + drives the assigner
 * and stage-advance API calls.
 *
 * Linked from the desktop sidebar's Dream Team entry
 * (components/ui/sidebar-moderna.tsx); the mobile bottom nav doesn't link it
 * yet.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isDreamTeamEnabled,
  requireDreamTeamSession,
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
} from '@/lib/platform/dream-team/route-access'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import { construirNodosArbol, responsablesDreamTeamPorEquipo } from '@/lib/platform/dream-team/estructura-arbol'
import { fetchEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import { fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import { fetchLideresGdv } from '@/lib/platform/dream-team/lideres-gdv'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import { ROL_LIDER_GDV_LABELS } from '@/components/dream-team/labels'

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
  // fetchLideresGdv()/fetchEstructuraGdv() apply their own tree-authority
  // check server-side (see their docstrings) — a caller without authority
  // over the Grupos de Vida node simply gets zero rows back, same shape as
  // the RLS-scoped queries above.
  const [servicios, equipos, lideresGdv, nodosGdv] = await Promise.all([
    repo.listServicios({}),
    repo.listEquipos(),
    fetchLideresGdv(supabase),
    fetchEstructuraGdv(supabase),
  ])

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
  const roles = entradasRoles.flatMap(([, rolesDelEquipo]) => rolesDelEquipo)
  const rolLabelPorId = new Map(roles.map((rol) => [rol.id, rol.label]))

  // Persona display names are not part of DreamTeamServicio (it only carries
  // personaId, see types.ts) and the repository has no join for them.
  // Resolving them here with a single bulk `usuarios.in(id)` lookup (see
  // lib/platform/dream-team/personas.ts) avoids an N+1 over
  // servicios.length + lideresGdv.length while keeping the dream-team
  // repository free of a cross-domain concern — usuarios is not a
  // dream-team table.
  const personaNombrePorId = await fetchNombresPersonas(supabase, [
    ...servicios.map((servicio) => servicio.personaId),
    ...lideresGdv.map((lider) => lider.personaId),
  ])

  // Merge the real tree with the virtual Grupos de Vida branch (item 3) plus
  // who holds director/coordinador on each real node (item 4). This is what
  // makes a Grupos de Vida row's `equipoLabel` resolve to its group name
  // below — before this feature `equipoLabelPorId` only knew about real
  // equipos, so a GdV row (grouped under a group id, not a real equipo id)
  // always fell back to "Equipo no encontrado".
  const responsablesDreamTeam = responsablesDreamTeamPorEquipo(servicios, roles, personaNombrePorId)
  const nodosCombinados = construirNodosArbol(equipos, nodosGdv, responsablesDreamTeam)
  const arbol = construirArbol(nodosCombinados)
  const equipoLabelPorId = new Map(nodosCombinados.map((nodo) => [nodo.id, nodo.label]))

  const rows: readonly ServidorRow[] = [
    ...servicios.map(
      (servicio): ServidorRow => ({
        servidor: { origen: 'dream_team', servicio },
        personaNombre: personaNombrePorId.get(servicio.personaId) ?? 'Persona no encontrada',
        equipoLabel: equipoLabelPorId.get(servicio.equipoId) ?? 'Equipo no encontrado',
        rolLabel: rolLabelPorId.get(servicio.rolId) ?? 'Rol no encontrado',
      }),
    ),
    ...lideresGdv.map(
      (lider): ServidorRow => ({
        servidor: { origen: 'grupos_vida', lider },
        personaNombre: personaNombrePorId.get(lider.personaId) ?? 'Persona no encontrada',
        equipoLabel: equipoLabelPorId.get(lider.equipoId) ?? 'Equipo no encontrado',
        rolLabel: ROL_LIDER_GDV_LABELS[lider.rol],
      }),
    ),
  ]

  const puedeEditar = hasDreamTeamWriteCapability(session)

  return <ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={rolesPorEquipo} puedeEditar={puedeEditar} />
}
