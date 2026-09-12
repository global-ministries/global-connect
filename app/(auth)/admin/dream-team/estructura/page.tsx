/**
 * Dream Team — /admin/dream-team/estructura (RSC).
 *
 * First of the three Dream Team screens: the org tree. Server component
 * loads equipos + roles + the virtual Grupos de Vida branch and hands a
 * pre-built, merged tree to the client island; mutations live in
 * ./actions.ts (server actions) and only ever target real equipos — the
 * Grupos de Vida branch is read-only (see
 * lib/platform/dream-team/estructura-gdv.ts, estructura-arbol.ts).
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
  hasDreamTeamOrgManageCapability,
} from '@/lib/platform/dream-team/route-access'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import { construirNodosArbol, responsablesDreamTeamPorEquipo } from '@/lib/platform/dream-team/estructura-arbol'
import { fetchEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import { fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

import { EstructuraClient } from './estructura-client'

export const metadata = { title: 'Estructura' }

export default async function DreamTeamEstructuraPage() {
  if (!isDreamTeamEnabled()) notFound()

  const session = await requireDreamTeamSession()
  if (!session) redirect('/login')

  if (!hasDreamTeamReadCapability(session)) notFound()

  const supabase = await createSupabaseServerClient()
  const repo = createSupabaseDreamTeamRepository(supabase)

  // RLS already scopes listEquipos() to what this session can see (global
  // for dream_team.org.manage, a single branch for a scoped
  // dream_team.direct area director) — nothing here filters by scope again.
  // fetchEstructuraGdv() applies its own tree-authority check server-side —
  // a caller without authority over the Grupos de Vida node simply gets zero
  // rows back, so the virtual branch just doesn't appear, same shape as the
  // RLS-scoped equipos read.
  const [equipos, nodosGdv, servicios] = await Promise.all([
    repo.listEquipos(),
    fetchEstructuraGdv(supabase),
    repo.listServicios({}),
  ])

  // listRolesPorEquipo() is per-equipo, not bulk. With ~29 equipos in
  // staging this is 29 parallel queries via Promise.all rather than one
  // request — acceptable for an admin screen, and it reuses the existing
  // repository method verbatim instead of hand-rolling a second raw query
  // against `dream_team_roles` with its own row-mapping logic here.
  const entradasRoles = await Promise.all(
    equipos.map(async (equipo): Promise<readonly [string, readonly DreamTeamRol[]]> => [
      equipo.id,
      await repo.listRolesPorEquipo(equipo.id),
    ]),
  )
  const rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>> = Object.fromEntries(entradasRoles)
  const roles = entradasRoles.flatMap(([, rolesDelEquipo]) => rolesDelEquipo)

  // This screen didn't load servicios before — it now needs them (plus
  // names) to derive who holds the director/coordinador role on each real
  // node (item 4 of this feature; see estructura-arbol.ts).
  const nombrePorId = await fetchNombresPersonas(supabase, servicios.map((servicio) => servicio.personaId))
  const responsablesDreamTeam = responsablesDreamTeamPorEquipo(servicios, roles, nombrePorId)

  const arbol = construirArbol(construirNodosArbol(equipos, nodosGdv, responsablesDreamTeam))

  // Structure editing belongs to org.manage. An area director reaches this
  // screen to see their branch, but reshaping the tree is not theirs to do —
  // and neither dream_team.org.manage nor a scoped dream_team.direct ever
  // extends to the virtual Grupos de Vida branch, which stays read-only for
  // everyone regardless of puedeEditar (see estructura-client.tsx).
  const puedeEditar = hasDreamTeamOrgManageCapability(session)

  return <EstructuraClient arbol={arbol} rolesPorEquipo={rolesPorEquipo} puedeEditar={puedeEditar} />
}
