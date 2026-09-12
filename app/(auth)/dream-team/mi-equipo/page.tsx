/**
 * Dream Team — /dream-team/mi-equipo (RSC).
 *
 * Third of the three Dream Team screens: the operative view for an area
 * director (outside /admin). Linked from the desktop sidebar's Dream Team
 * entry (components/ui/sidebar-moderna.tsx); the mobile bottom nav doesn't
 * link it yet. Shows the branch of the org tree the caller reaches — real
 * equipos PLUS the virtual Grupos de Vida branch merged in (see
 * lib/platform/dream-team/estructura-gdv.ts, estructura-arbol.ts) — and, per
 * node, who serves there with their current stage: Dream Team servicios
 * PLUS Grupos de Vida leaders/co-leaders surfaced read-only, now grouped
 * under the GROUP node they lead (see lib/platform/dream-team/lideres-gdv.ts,
 * lib/platform/dream-team/servidores.ts).
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
import { equipoIdDeServidor, personaIdDeServidor, type Servidor } from '@/lib/platform/dream-team/servidores'

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
  // in the task. fetchEstructuraGdv() applies its own tree-authority check
  // server-side — a director without reach into the Grupos de Vida node gets
  // zero rows back, so the virtual branch just doesn't appear.
  const equipos = await repo.listEquipos()

  // listServicios({}) once (RLS-scoped to the same branch) and group locally
  // by equipoId, instead of one listServicios({ equipoId }) call per node —
  // avoids N+1 over the branch's equipo count. fetchLideresGdv() applies its
  // own tree-authority check server-side (see its docstring) — a director
  // without reach into the Grupos de Vida node gets zero rows back, same
  // shape as the RLS-scoped queries above.
  const [servicios, entradasRoles, lideresGdv, nodosGdv] = await Promise.all([
    repo.listServicios({}),
    Promise.all(
      equipos.map(async (equipo): Promise<readonly [string, readonly DreamTeamRol[]]> => [
        equipo.id,
        await repo.listRolesPorEquipo(equipo.id),
      ]),
    ),
    fetchLideresGdv(supabase),
    fetchEstructuraGdv(supabase),
  ])

  const rolLabelPorId = new Map(entradasRoles.flatMap(([, roles]) => roles).map((rol) => [rol.id, rol.label]))
  // Passed through so <NodoFila> (shared with estructura-client.tsx) can
  // render the same read-only rol badges per node on this screen too.
  const rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>> = Object.fromEntries(entradasRoles)
  const roles = entradasRoles.flatMap(([, rolesDelEquipo]) => rolesDelEquipo)

  // Same reasoning as servidores/page.tsx: usuarios is not a dream-team
  // table, so persona names are resolved here with a single bulk lookup
  // rather than added to the repository — over servicio persona ids PLUS
  // GdV leader persona ids.
  const personaNombrePorId = await fetchNombresPersonas(supabase, [
    ...servicios.map((servicio) => servicio.personaId),
    ...lideresGdv.map((lider) => lider.personaId),
  ])

  // Merge the real tree with the virtual Grupos de Vida branch — item 3 of
  // this feature — plus who holds director/coordinador on each real node
  // (item 4). This ALSO redefines the visible-equipo set below: a Grupos de
  // Vida leader's servidor now hangs off their GROUP (a virtual node), so
  // the check has to include virtual ids, not just real ones.
  const responsablesDreamTeam = responsablesDreamTeamPorEquipo(servicios, roles, personaNombrePorId)
  const nodosCombinados = construirNodosArbol(equipos, nodosGdv, responsablesDreamTeam)
  const arbol = construirArbol(nodosCombinados)
  const equipoIds = new Set(nodosCombinados.map((nodo) => nodo.id))

  const servidores: readonly Servidor[] = [
    ...servicios.map((servicio): Servidor => ({ origen: 'dream_team', servicio })),
    ...lideresGdv.map((lider): Servidor => ({ origen: 'grupos_vida', lider })),
  ]

  const serviciosPorEquipo: Record<string, MiEquipoServicioRow[]> = {}
  for (const servidor of servidores) {
    const equipoId = equipoIdDeServidor(servidor)
    if (!equipoIds.has(equipoId)) continue
    const personaId = personaIdDeServidor(servidor)
    const fila: MiEquipoServicioRow = {
      servidor,
      personaNombre: personaNombrePorId.get(personaId) ?? 'Persona no encontrada',
      rolLabel:
        servidor.origen === 'dream_team'
          ? (rolLabelPorId.get(servidor.servicio.rolId) ?? 'Rol no encontrado')
          : ROL_LIDER_GDV_LABELS[servidor.lider.rol],
    }
    ;(serviciosPorEquipo[equipoId] ??= []).push(fila)
  }

  const puedeEditar = hasDreamTeamWriteCapability(session)

  return (
    <MiEquipoClient
      arbol={arbol}
      rolesPorEquipo={rolesPorEquipo}
      serviciosPorEquipo={serviciosPorEquipo}
      puedeEditar={puedeEditar}
    />
  )
}
