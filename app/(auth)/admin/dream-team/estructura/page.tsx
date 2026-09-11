/**
 * Dream Team — /admin/dream-team/estructura (RSC).
 *
 * First of the three Dream Team screens: the org tree. Server component
 * loads equipos + roles and hands a pre-built tree to the client island;
 * mutations live in ./actions.ts (server actions).
 *
 * Not wired into the sidebar/navigation yet — reached by direct URL only.
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
  const equipos = await repo.listEquipos()
  const arbol = construirArbol(equipos)

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

  // Structure editing belongs to org.manage. An area director reaches this
  // screen to see their branch, but reshaping the tree is not theirs to do.
  const puedeEditar = hasDreamTeamOrgManageCapability(session)

  return <EstructuraClient arbol={arbol} rolesPorEquipo={rolesPorEquipo} puedeEditar={puedeEditar} />
}
