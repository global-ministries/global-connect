/**
 * Dream Team — /admin/dream-team/estructura (RSC).
 *
 * The org chart (design system v2, S12 of odd/tasks/sistema-diseno-v2.md).
 * Server component loads equipos + roles + servicios + the virtual Grupos de
 * Vida branch and hands a pre-built, merged tree (plus the people counts, the
 * taller links and the campus shifts) to the client island in
 * components/dream-team/estructura/. The URL state is read with
 * `leerFiltrosEstructura` (lib/platform/dream-team/estructura-organigrama.ts):
 * `?equipo=<id>` (the legacy link) opens that node's panel when the viewer
 * reaches it; `q`, `problema`, `tab` and `expandidos` seed the island. Mutations live in
 * ./actions.ts (server actions) and only ever target real equipos — the
 * Grupos de Vida branch is read-only (see
 * lib/platform/dream-team/estructura-gdv.ts, estructura-arbol.ts).
 *
 * Only serializable data reaches the client island — no components, icons or
 * functions cross the server/client boundary.
 *
 * Linked from the sidebar's Dream Team group and, on phones, from the
 * /dream-team access page.
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
import {
  construirNodosArbol,
  responsablesDreamTeamPorEquipo,
  tallerPorEquipoId,
} from '@/lib/platform/dream-team/estructura-arbol'
import { contarUso, crearVistaEstructura, type TallerVinculado } from '@/lib/platform/dream-team/estructura-vista'
import { agruparTurnosPropios, leerFiltrosEstructura } from '@/lib/platform/dream-team/estructura-organigrama'
import { fetchEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import { fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import { rutaTaller } from '@/lib/platform/talleres/rutas'
import { EstructuraClient, type TurnosEstructura } from '@/components/dream-team/estructura/estructura-client'
import { fetchTurnos, fetchTurnosDisponibles } from '@/lib/platform/dream-team/turnos'

export const metadata = { title: 'Estructura' }

interface EstructuraPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

export default async function DreamTeamEstructuraPage({ searchParams }: EstructuraPageProps) {
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
  // T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) —
  // node -> taller: `talleres` is world-readable (talleres_select_all,
  // USING true — same as the taller catalog's own loader), so this is a
  // plain unscoped select, never gated on the talleres feature flag (the
  // flag only gates the /talleres UI routes, not this table's data).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  const [equipos, nodosGdv, servicios, { data: talleresData }] = await Promise.all([
    repo.listEquipos(),
    fetchEstructuraGdv(supabase),
    repo.listServicios({}),
    client.from('talleres').select('slug, nombre, dream_team_equipo_id') as Promise<{
      data: readonly { slug: string; nombre: string; dream_team_equipo_id: string | null }[] | null
    }>,
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

  const talleres: Record<string, TallerVinculado> = Object.fromEntries(
    Object.entries(tallerPorEquipoId(talleresData ?? [])).map(([equipoId, taller]) => [
      equipoId,
      { href: rutaTaller(taller.slug), nombre: taller.nombre },
    ]),
  )
  const uso = contarUso(servicios)
  const vista = crearVistaEstructura({ arbol, rolesPorEquipo, uso, talleres })

  // `?equipo=` opens that node's panel; an unknown one (or a node out of reach) opens nothing.
  const filtros = leerFiltrosEstructura((await searchParams) ?? {})
  const equipoId = filtros.equipo && vista.detalle(filtros.equipo) ? filtros.equipo : ''

  // Campus service shifts (D12): the campus list and every equipo's own
  // restriction (for "Sin turno" on the chart) for every viewer, and for the
  // open REAL node the shifts it serves in after inheritance (resolved in the
  // database, which sees the ancestors). A convenience on top of the tree: on
  // failure the shift parts are left out.
  const turnosEstructura = await cargarTurnos(client, equipos.some((equipo) => equipo.id === equipoId) ? equipoId : null)

  return (
    <EstructuraClient
      arbol={arbol}
      rolesPorEquipo={rolesPorEquipo}
      uso={uso}
      talleres={talleres}
      equipoId={equipoId}
      puedeEditar={puedeEditar}
      filtros={{ ...filtros, equipo: equipoId || null }}
      turnos={turnosEstructura}
    />
  )
}

async function cargarTurnos(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  equipoId: string | null,
): Promise<TurnosEstructura | undefined> {
  try {
    const [turnos, { data: campus, error }, { data: propios, error: errorPropios }] = await Promise.all([
      fetchTurnos(client),
      client.from('campus').select('id, nombre').eq('activo', true).order('nombre'),
      // Every own restriction the viewer may read (RLS dream_team_equipo_turnos_select), one query.
      client.from('dream_team_equipo_turnos').select('equipo_id, turno_id'),
    ])
    if (error) throw error
    if (errorPropios) throw errorPropios
    const propiosPorEquipo = agruparTurnosPropios(propios ?? [])
    const delEquipo = equipoId
      ? { equipoId, propios: propiosPorEquipo[equipoId] ?? [], efectivos: await fetchTurnosDisponibles(client, equipoId, turnos) }
      : undefined
    return { campus: campus ?? [], turnos, propiosPorEquipo, delEquipo }
  } catch (error) {
    console.error('[dream-team/estructura] shifts lookup failed', error)
    return undefined
  }
}
